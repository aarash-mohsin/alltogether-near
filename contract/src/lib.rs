mod model;
mod terms;

pub use model::*;
use terms::{add, sub, assert_books};
use near_sdk::{env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, PromiseError};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{self, json, Value};
use near_sdk::store::{LookupMap, LookupSet, Vector};
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum Key { Campaigns, Positions, Credits, Admissions, Index }

#[ext_contract(ext_ft)]
trait Token { fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>); }
#[ext_contract(ext_self)]
trait Callback { fn on_transfer_result(&mut self, credit_key: String, nonce: U64) -> bool; }

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AllTogether {
    config: Config,
    next_campaign: u64,
    campaigns: LookupMap<u64, Campaign>,
    index: Vector<u64>,
    positions: LookupMap<String, Position>,
    credits: LookupMap<String, Credit>,
    admissions: LookupSet<String>,
    global_accounting: Accounting,
}

fn position_key(id: u64, account: &AccountId, leg: u8) -> String { format!("{id}:{account}:{leg}") }
fn admission_key(id: u64, account: &AccountId) -> String { format!("{id}:{account}") }
pub fn credit_key(id: u64, kind: &CreditKind, owner: &AccountId, leg: Option<u8>) -> String {
    format!("{}:{}:{}:{}", id, kind.as_str(), owner, leg.map(|v| v.to_string()).unwrap_or_else(|| "-".into()))
}

#[near]
impl AllTogether {
    #[init]
    pub fn new(config: Config) -> Self {
        require!(config.token_decimals == 6 && config.token_symbol == "testUSD", "TEST_TOKEN_METADATA_REQUIRED");
        Self { config, next_campaign: 1, campaigns: LookupMap::new(Key::Campaigns), index: Vector::new(Key::Index),
            positions: LookupMap::new(Key::Positions), credits: LookupMap::new(Key::Credits),
            admissions: LookupSet::new(Key::Admissions), global_accounting: Accounting::default() }
    }

    pub fn get_config(&self) -> Value {
        json!({"dao_id":self.config.dao_id,"token_id":self.config.token_id,"token_decimals":6,
            "token_symbol":"testUSD","participant_limit":PARTICIPANTS,"max_legs":3,"domain":"alltogether/near-testnet/v1",
            "network":"testnet","version":env!("CARGO_PKG_VERSION"),"transfer_gas_tgas":25,"callback_gas_tgas":20})
    }

    pub fn quote_campaign_storage(&self, leg_count: u8) -> StorageQuote {
        require!((1..=3).contains(&leg_count), "INVALID_LEG_COUNT");
        let (bytes, records) = storage_measurement(leg_count);
        let reserved = bytes.checked_add(records * 128).expect("STORAGE_OVERFLOW");
        StorageQuote { required_yocto: U128((reserved as u128).checked_mul(env::storage_byte_cost().as_yoctonear()).expect("STORAGE_OVERFLOW")),
            reserved_bytes: U64(reserved), participant_limit: PARTICIPANTS, record_bytes: U64(bytes), key_overhead_per_record: 128 }
    }

    #[payable]
    pub fn create_campaign(&mut self, input: PublishInput) -> Campaign {
        terms::validate_input(&input);
        let quote = self.quote_campaign_storage(input.legs.len() as u8);
        require!(env::attached_deposit().as_yoctonear() >= quote.required_yocto.0, "STORAGE_NOT_FUNDED");
        let id = self.next_campaign;
        self.next_campaign = id.checked_add(1).expect("CAMPAIGN_ID_OVERFLOW");
        let legs = terms::derive_legs(input.legs);
        let terms = Terms { schema_version: 1, domain: "alltogether/near-testnet/v1".into(), escrow_id: env::current_account_id(),
            campaign_id: id.to_string(), organizer: env::predecessor_account_id(), title: input.title, summary: input.summary,
            detail: input.detail, dao_id: self.config.dao_id.clone(), token_id: self.config.token_id.clone(), token_decimals: 6,
            token_symbol: "testUSD".into(), deadline_ms: input.deadline_ms, participant_limit: PARTICIPANTS,
            match_rule: "one-to-one-capped-v1".into(), settlement_rule: "all-legs-v1".into(), legs };
        let campaign = Campaign { id: U64(id), terms_hash: terms::hash(&terms), active: vec![U128(0); terms.legs.len()], terms,
            state: CampaignState::AwaitingFunding, created_at_ms: U64(env::block_timestamp_ms()), finalized_at_ms: None,
            failure_reason: None, closing_active: None, participant_count: 0, accounting: Accounting::default() };
        self.campaigns.insert(id, campaign.clone());
        self.index.push(id);
        self.event("campaign_created", json!({"campaign_id":id.to_string(),"terms_hash":campaign.terms_hash,"storage_yocto":quote.required_yocto}));
        campaign
    }

    pub fn remove_pledge(&mut self, campaign_id: U64, leg_id: u8, amount: U128) -> Credit {
        let mut c = self.must_campaign(campaign_id.0);
        require!(c.state == CampaignState::Open, "INVALID_STATE");
        require!(env::block_timestamp_ms() < c.terms.deadline_ms.0, "DEADLINE_REACHED");
        require!((leg_id as usize) < c.active.len() && amount.0 > 0, "INVALID_AMOUNT_OR_LEG");
        let owner = env::predecessor_account_id();
        let key = position_key(c.id.0, &owner, leg_id);
        let mut p = self.positions.get(&key).cloned().expect("POSITION_NOT_FOUND");
        require!(p.active.0 >= amount.0, "INSUFFICIENT_PRINCIPAL");
        p.active.0 = sub(p.active.0, amount.0);
        c.active[leg_id as usize].0 = sub(c.active[leg_id as usize].0, amount.0);
        c.accounting.active_principal.0 = sub(c.accounting.active_principal.0, amount.0);
        let credit = self.add_credit(&mut c, CreditKind::Withdrawal, owner, None, amount.0);
        self.positions.insert(key, p);
        self.save(c);
        self.event("pledge_removed", json!({"campaign_id":campaign_id,"leg_id":leg_id,"amount":amount,"credit_id":credit.id}));
        credit
    }

    pub fn finalize(&mut self, campaign_id: U64) -> Campaign {
        let mut c = self.must_campaign(campaign_id.0);
        if matches!(c.state, CampaignState::Succeeded | CampaignState::Failed) { return c; }
        require!(env::block_timestamp_ms() >= c.terms.deadline_ms.0, "DEADLINE_NOT_REACHED");
        let funded = c.state == CampaignState::Open;
        let success = funded && c.terms.legs.iter().zip(c.active.iter()).all(|(l,a)| l.community_target.0 == a.0);
        c.closing_active = Some(c.active.clone());
        c.finalized_at_ms = Some(U64(env::block_timestamp_ms()));
        if success {
            c.state = CampaignState::Succeeded;
            c.accounting.active_principal = U128(0);
            c.accounting.sponsor_reserved = U128(0);
            for leg in c.terms.legs.clone() {
                self.add_credit(&mut c, CreditKind::Beneficiary, leg.beneficiary, Some(leg.leg_id), leg.budget.0);
            }
        } else {
            c.state = CampaignState::Failed;
            c.failure_reason = Some(if funded { "INCOMPLETE_BUDGETS" } else { "SPONSOR_NOT_FUNDED" }.into());
            c.accounting.failed_principal_reserved = c.accounting.active_principal;
            c.accounting.active_principal = U128(0);
            let reserve = c.accounting.sponsor_reserved.0;
            c.accounting.sponsor_reserved = U128(0);
            if reserve > 0 { self.add_credit(&mut c, CreditKind::SponsorRefund, self.config.dao_id.clone(), None, reserve); }
        }
        self.save(c.clone());
        self.event("campaign_finalized", json!({"campaign_id":campaign_id,"state":c.state,"closing_active":c.closing_active}));
        c
    }

    pub fn materialize_refund(&mut self, campaign_id: U64) -> Option<Credit> {
        let mut c = self.must_campaign(campaign_id.0);
        require!(c.state == CampaignState::Failed, "INVALID_STATE");
        let owner = env::predecessor_account_id();
        let mut amount = 0u128;
        for leg in 0..c.terms.legs.len() as u8 {
            let key = position_key(c.id.0, &owner, leg);
            if let Some(mut p) = self.positions.get(&key).cloned() {
                if !p.refund_consumed {
                    amount = add(amount, p.active.0);
                    p.refund_consumed = true;
                    p.active = U128(0);
                    self.positions.insert(key, p);
                }
            }
        }
        let key = credit_key(c.id.0, &CreditKind::Refund, &owner, None);
        if amount == 0 { return self.credits.get(&key).cloned(); }
        c.accounting.failed_principal_reserved.0 = sub(c.accounting.failed_principal_reserved.0, amount);
        let credit = self.add_credit(&mut c, CreditKind::Refund, owner, None, amount);
        self.save(c);
        self.event("refund_materialized", json!({"campaign_id":campaign_id,"amount":U128(amount),"credit_id":credit.id}));
        Some(credit)
    }

    #[payable]
    pub fn claim_credit(&mut self, credit_key: String) -> Promise {
        require!(env::attached_deposit() == NearToken::from_yoctonear(1), "ATTACH_ONE_YOCTO");
        require!(env::prepaid_gas().as_gas() >= Gas::from_tgas(60).as_gas(), "INSUFFICIENT_PREPAID_GAS");
        let mut credit = self.credits.get(&credit_key).cloned().expect("CREDIT_NOT_FOUND");
        if matches!(credit.kind, CreditKind::Withdrawal | CreditKind::Refund) {
            require!(env::predecessor_account_id() == credit.owner, "NOT_CREDIT_OWNER");
        }
        require!(credit.pending.0 == 0, "TRANSFER_PENDING");
        require!(credit.available.0 > 0, "NO_AVAILABLE_CREDIT");
        let amount = credit.available;
        credit.available = U128(0);
        credit.pending = amount;
        credit.nonce.0 = credit.nonce.0.checked_add(1).expect("NONCE_OVERFLOW");
        let nonce = credit.nonce;
        credit.last_attempt = Some(Attempt { nonce, amount, status: AttemptStatus::Pending, created_at_ms: U64(env::block_timestamp_ms()), resolved_at_ms: None });
        let mut c = self.must_campaign(credit.campaign_id.0);
        c.accounting.available_credits.0 = sub(c.accounting.available_credits.0, amount.0);
        c.accounting.pending_transfers.0 = add(c.accounting.pending_transfers.0, amount.0);
        self.credits.insert(credit_key.clone(), credit.clone());
        self.save(c);
        self.event("transfer_started", json!({"credit_id":credit_key,"nonce":nonce,"amount":amount,"recipient":credit.recipient}));
        ext_ft::ext(self.config.token_id.clone()).with_attached_deposit(NearToken::from_yoctonear(1)).with_static_gas(Gas::from_tgas(25))
            .ft_transfer(credit.recipient, amount, Some(format!("AllTogether {credit_key} #{}",nonce.0)))
            .then(ext_self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(20)).on_transfer_result(credit_key, nonce))
    }

    #[private]
    pub fn on_transfer_result(&mut self, credit_key: String, nonce: U64) -> bool {
        require!(env::predecessor_account_id() == env::current_account_id(), "PRIVATE_CALLBACK");
        let Some(mut credit) = self.credits.get(&credit_key).cloned() else { return false; };
        let Some(attempt) = credit.last_attempt.clone() else { return false; };
        if credit.nonce.0 != nonce.0 || attempt.status != AttemptStatus::Pending { return false; }
        require!(env::promise_results_count() == 1, "INVALID_PROMISE_RESULT_COUNT");
        // Return bytes are irrelevant for ft_transfer. An oversized successful return is
        // still a successful payment and must never restore spendable credit.
        let success = match env::promise_result_checked(0,64) {
            Ok(_) | Err(PromiseError::TooLong(_)) => true,
            Err(PromiseError::Failed) => false,
            Err(_) => env::panic_str("UNKNOWN_PROMISE_OUTCOME"),
        };
        let amount = credit.pending.0;
        credit.pending = U128(0);
        let mut c = self.must_campaign(credit.campaign_id.0);
        c.accounting.pending_transfers.0 = sub(c.accounting.pending_transfers.0, amount);
        if success {
            credit.paid.0 = add(credit.paid.0, amount);
            c.accounting.confirmed_paid.0 = add(c.accounting.confirmed_paid.0, amount);
        } else {
            credit.available.0 = add(credit.available.0, amount);
            c.accounting.available_credits.0 = add(c.accounting.available_credits.0, amount);
        }
        credit.last_attempt = Some(Attempt { status: if success { AttemptStatus::Succeeded } else { AttemptStatus::Failed }, resolved_at_ms: Some(U64(env::block_timestamp_ms())), ..attempt });
        self.credits.insert(credit_key.clone(), credit);
        self.save(c);
        self.event("transfer_resolved", json!({"credit_id":credit_key,"nonce":nonce,"amount":U128(amount),"success":success}));
        success
    }

    pub fn get_campaign(&self, campaign_id: U64) -> Option<Campaign> { self.campaigns.get(&campaign_id.0).cloned() }
    pub fn list_campaigns(&self, from_index: Option<U64>, limit: Option<u8>) -> Vec<Campaign> {
        let start = from_index.unwrap_or(U64(0)).0 as usize;
        let take = limit.unwrap_or(20).min(50) as usize;
        self.index.iter().skip(start).take(take).filter_map(|id| self.campaigns.get(id).cloned()).collect()
    }
    pub fn get_credit(&self, credit_key: String) -> Option<Credit> { self.credits.get(&credit_key).cloned() }
    pub fn get_attempt(&self, credit_key: String) -> Option<Attempt> { self.credits.get(&credit_key).and_then(|c| c.last_attempt.clone()) }
    pub fn get_accounting(&self, campaign_id: Option<U64>) -> Accounting { campaign_id.map(|id| self.must_campaign(id.0).accounting).unwrap_or_else(|| self.global_accounting.clone()) }
    pub fn get_account_campaign(&self, campaign_id: U64, account_id: AccountId) -> AccountCampaign {
        let c = self.must_campaign(campaign_id.0);
        let positions = (0..c.terms.legs.len() as u8).map(|l| self.positions.get(&position_key(c.id.0, &account_id, l)).cloned().unwrap_or_default()).collect();
        let mut credits = vec![];
        for kind in [CreditKind::Withdrawal, CreditKind::Refund, CreditKind::SponsorRefund] {
            if let Some(credit) = self.credits.get(&credit_key(c.id.0, &kind, &account_id, None)) { credits.push(credit.clone()); }
        }
        for leg in 0..c.terms.legs.len() as u8 {
            if let Some(credit) = self.credits.get(&credit_key(c.id.0, &CreditKind::Beneficiary, &account_id, Some(leg))) { credits.push(credit.clone()); }
        }
        AccountCampaign { account_id, positions, credits }
    }
}

#[near]
impl FungibleTokenReceiver for AllTogether {
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.config.token_id, "UNKNOWN_TOKEN");
        let unused = self.receive(sender_id, amount.0, &msg);
        PromiseOrValue::Value(U128(unused))
    }
}

impl AllTogether {
    fn receive(&mut self, sender: AccountId, amount: u128, msg: &str) -> u128 {
        let reject = || amount;
        if msg.len() > 2048 || amount == 0 { return reject(); }
        let Ok(value) = serde_json::from_str::<Value>(msg) else { return reject(); };
        let Some(object) = value.as_object() else { return reject(); };
        if value["v"] != 1 { return reject(); }
        let Some(action) = value["action"].as_str() else { return reject(); };
        let allowed = if action == "sponsor" { vec!["v","action","campaign_id","terms_hash"] } else if action == "pledge" { vec!["v","action","campaign_id","terms_hash","leg_id"] } else { return reject(); };
        if object.len() != allowed.len() || object.keys().any(|k| !allowed.contains(&k.as_str())) { return reject(); }
        let Some(id) = value["campaign_id"].as_str().and_then(|s| s.parse::<u64>().ok()) else { return reject(); };
        let Some(mut c) = self.campaigns.get(&id).cloned() else { return reject(); };
        if value["terms_hash"].as_str() != Some(&c.terms_hash) || env::block_timestamp_ms() >= c.terms.deadline_ms.0 { return reject(); }
        if action == "sponsor" {
            let reserve = c.terms.legs.iter().fold(0, |a,l| add(a,l.sponsor_allocation.0));
            if sender != self.config.dao_id || c.state != CampaignState::AwaitingFunding || amount != reserve { return reject(); }
            c.state = CampaignState::Open;
            c.accounting.sponsor_reserved = U128(amount);
        } else {
            let Some(leg) = value["leg_id"].as_u64().filter(|n| *n < c.terms.legs.len() as u64) else { return reject(); };
            let leg = leg as u8;
            if c.state != CampaignState::Open || amount > c.terms.legs[leg as usize].community_target.0 - c.active[leg as usize].0 { return reject(); }
            let admit = admission_key(id, &sender);
            let is_new = !self.admissions.contains(&admit);
            if is_new && c.participant_count >= PARTICIPANTS { return reject(); }
            let key = position_key(id, &sender, leg);
            let mut p = self.positions.get(&key).cloned().unwrap_or_default();
            // Lifetime accepted flow can overflow only after an impractical number of recycling operations;
            // reject before writes rather than panic after accepting an incoming transfer.
            let Some(accepted_total) = p.accepted_total.0.checked_add(amount) else { return reject(); };
            if c.accounting.accepted_inflows.0.checked_add(amount).is_none() || self.global_accounting.accepted_inflows.0.checked_add(amount).is_none() { return reject(); }
            p.active.0 = add(p.active.0, amount);
            p.accepted_total = U128(accepted_total);
            self.positions.insert(key,p);
            if is_new { self.admissions.insert(admit); c.participant_count += 1; }
            c.active[leg as usize].0 = add(c.active[leg as usize].0, amount);
            c.accounting.active_principal.0 = add(c.accounting.active_principal.0, amount);
        }
        if c.accounting.accepted_inflows.0.checked_add(amount).is_none() || self.global_accounting.accepted_inflows.0.checked_add(amount).is_none() { return reject(); }
        c.accounting.accepted_inflows.0 = add(c.accounting.accepted_inflows.0, amount);
        self.save(c);
        self.event("funds_accepted", json!({"campaign_id":id.to_string(),"sender_id":sender,"action":action,"amount":U128(amount)}));
        0
    }

    fn must_campaign(&self, id: u64) -> Campaign { self.campaigns.get(&id).cloned().expect("CAMPAIGN_NOT_FOUND") }
    fn add_credit(&mut self, c: &mut Campaign, kind: CreditKind, owner: AccountId, leg: Option<u8>, amount: u128) -> Credit {
        let id = credit_key(c.id.0,&kind,&owner,leg);
        let mut credit = self.credits.get(&id).cloned().unwrap_or_else(|| Credit { id:id.clone(),campaign_id:c.id,kind,
            owner:owner.clone(),recipient:owner,leg_id:leg,available:U128(0),pending:U128(0),paid:U128(0),nonce:U64(0),last_attempt:None });
        credit.available.0 = add(credit.available.0,amount);
        c.accounting.available_credits.0 = add(c.accounting.available_credits.0,amount);
        self.credits.insert(id,credit.clone());
        credit
    }
    fn save(&mut self, c: Campaign) {
        assert_books(&c.accounting);
        let old = self.must_campaign(c.id.0).accounting;
        macro_rules! diff { ($field:ident) => { self.global_accounting.$field.0 = add(sub(self.global_accounting.$field.0,old.$field.0),c.accounting.$field.0); }; }
        diff!(accepted_inflows); diff!(active_principal); diff!(sponsor_reserved); diff!(failed_principal_reserved);
        diff!(available_credits); diff!(pending_transfers); diff!(confirmed_paid);
        assert_books(&self.global_accounting);
        self.campaigns.insert(c.id.0,c);
    }
    fn event(&self, event: &str, data: Value) {
        env::log_str(&format!("EVENT_JSON:{}",json!({"standard":"alltogether","version":"1.0.0","event":event,"data":[data]})));
    }
}

// The bound is measured from Borsh serialization of maximum-size persistent records,
// with an explicit conservative trie/key allowance per record. Retry count is not a term.
fn storage_measurement(legs: u8) -> (u64,u64) {
    let account: AccountId = "a".repeat(64).parse().unwrap();
    let id = u64::MAX;
    let credit = Credit { id:credit_key(id,&CreditKind::SponsorRefund,&account,Some(2)),campaign_id:U64(id),kind:CreditKind::SponsorRefund,
        owner:account.clone(),recipient:account.clone(),leg_id:Some(2),available:U128(u128::MAX),pending:U128(u128::MAX),paid:U128(u128::MAX),nonce:U64(u64::MAX),
        last_attempt:Some(Attempt { nonce:U64(u64::MAX),amount:U128(u128::MAX),status:AttemptStatus::Succeeded,created_at_ms:U64(u64::MAX),resolved_at_ms:Some(U64(u64::MAX)) }) };
    let position = Position { active:U128(u128::MAX),accepted_total:U128(u128::MAX),refund_consumed:true };
    let key_bytes = position_key(id,&account,2).len() as u64;
    let position_bytes = near_sdk::borsh::to_vec(&position).unwrap().len() as u64 + key_bytes;
    let credit_bytes = near_sdk::borsh::to_vec(&credit).unwrap().len() as u64 + credit.id.len() as u64;
    let admission_bytes = admission_key(id,&account).len() as u64 + 1;
    let participants = PARTICIPANTS as u64;
    // Four-byte UTF-8 characters maximize stored titles/descriptions under character limits.
    let campaign = 4 * (80 + 500 + 2000 + legs as u64 * (60+240)) + 4096;
    let records = participants * (legs as u64 + 3) + legs as u64 + 4;
    let bytes = campaign + participants * (legs as u64 * position_bytes + 2 * credit_bytes + admission_bytes)
        + (legs as u64 + 1) * credit_bytes + 64;
    (bytes,records)
}

#[cfg(test)]
mod tests;
