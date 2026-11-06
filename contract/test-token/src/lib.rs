use near_sdk::{near,env,require,AccountId,PanicOnDefault,PromiseOrValue,NearToken};
use near_sdk::json_types::U128;
use near_sdk::collections::LazyOption;
use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::resolver::FungibleTokenResolver;
use near_contract_standards::storage_management::{StorageManagement,StorageBalance,StorageBalanceBounds};
use near_contract_standards::fungible_token::metadata::{FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC};
use near_contract_standards::fungible_token::events::FtMint;

const FAUCET_AMOUNT:u128=1_000_000_000;
const FAUCET_CAPACITY:usize=256;
const FLAG_MAX_BYTES:u64=68; // Borsh string length prefix plus a maximum64-byte account.
const STATE_MARGIN_BYTES:u64=256;

#[near(serializers=[json])]
#[serde(rename_all="camelCase")]
pub struct FaucetStatus {pub enabled:bool,pub amount:U128,pub claimed:bool,pub remaining_accounts:u16}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TestUsd { token: FungibleToken, metadata: LazyOption<FungibleTokenMetadata>,faucet_recipients:Vec<AccountId> }

#[near]
impl TestUsd {
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128) -> Self {
        require!(env::current_account_id().as_str().ends_with(".testnet"),"TESTNET_DEMO_ONLY");
        let mut token = FungibleToken::new(b"t".to_vec());
        token.internal_register_account(&owner_id);
        token.internal_deposit(&owner_id,total_supply.0);
        let metadata = FungibleTokenMetadata { spec:FT_METADATA_SPEC.into(), name:"AllTogether Test Dollars (no monetary value)".into(),
            symbol:"testUSD".into(), icon:None, reference:None, reference_hash:None, decimals:6 };
        let value=Self {token,metadata:LazyOption::new(b"m".to_vec(),Some(&metadata)),faucet_recipients:vec![]};
        value.assert_faucet_headroom();value
    }
    pub fn get_faucet_status(&self,account_id:Option<AccountId>)->FaucetStatus {
        FaucetStatus{enabled:self.demo_profile()&&self.faucet_recipients.len()<FAUCET_CAPACITY,amount:U128(FAUCET_AMOUNT),claimed:account_id.as_ref().is_some_and(|id|self.faucet_recipients.contains(id)),remaining_accounts:(FAUCET_CAPACITY-self.faucet_recipients.len()) as u16}
    }
    pub fn get_faucet_storage_quote(&self)->near_sdk::serde_json::Value {
        near_sdk::serde_json::json!({"remaining_flag_bytes":self.remaining_flag_bytes().to_string(),"maximum_flag_records_bytes":(FAUCET_CAPACITY as u64*FLAG_MAX_BYTES).to_string(),"state_margin_bytes":STATE_MARGIN_BYTES.to_string(),"current_storage_usage":env::storage_usage().to_string(),"required_account_balance":self.required_faucet_balance().to_string()})
    }
    #[payable]
    pub fn demo_faucet(&mut self)->U128 {
        near_sdk::assert_one_yocto();require!(self.demo_profile(),"TESTNET_DEMO_ONLY");let recipient=env::predecessor_account_id();
        require!(self.token.accounts.get(&recipient).is_some(),"REGISTER_WITH_TOKEN_FIRST");
        require!(!self.faucet_recipients.contains(&recipient),"FAUCET_ALREADY_CLAIMED");require!(self.faucet_recipients.len()<FAUCET_CAPACITY,"FAUCET_CAPACITY_REACHED");
        self.assert_faucet_headroom();self.token.internal_deposit(&recipient,FAUCET_AMOUNT);self.faucet_recipients.push(recipient.clone());
        FtMint{owner_id:&recipient,amount:U128(FAUCET_AMOUNT),memo:Some("Demo faucet: valueless testUSD, once per account")}.emit();U128(FAUCET_AMOUNT)
    }
}

impl TestUsd {
    fn demo_profile(&self)->bool {let metadata=self.metadata.get();env::current_account_id().as_str().ends_with(".testnet")&&metadata.is_some_and(|m|m.decimals==6&&m.symbol=="testUSD"&&m.name=="AllTogether Test Dollars (no monetary value)")}
    fn remaining_flag_bytes(&self)->u64{(FAUCET_CAPACITY-self.faucet_recipients.len()) as u64*FLAG_MAX_BYTES+STATE_MARGIN_BYTES}
    fn required_faucet_balance(&self)->u128{(env::storage_usage().checked_add(self.remaining_flag_bytes()).expect("STORAGE_OVERFLOW") as u128).checked_mul(env::storage_byte_cost().as_yoctonear()).expect("STORAGE_COST_OVERFLOW")}
    fn assert_faucet_headroom(&self){require!(env::account_balance().as_yoctonear()>=self.required_faucet_balance(),"FAUCET_STORAGE_HEADROOM");}
}

#[near]
impl FungibleTokenCore for TestUsd {
    #[payable]
    fn ft_transfer(&mut self,receiver_id:AccountId,amount:U128,memo:Option<String>) { self.token.ft_transfer(receiver_id,amount,memo) }
    #[payable]
    fn ft_transfer_call(&mut self,receiver_id:AccountId,amount:U128,memo:Option<String>,msg:String)->PromiseOrValue<U128> {self.token.ft_transfer_call(receiver_id,amount,memo,msg)}
    fn ft_total_supply(&self)->U128 {self.token.ft_total_supply()}
    fn ft_balance_of(&self,account_id:AccountId)->U128 {self.token.ft_balance_of(account_id)}
}

#[near]
impl FungibleTokenResolver for TestUsd {
    #[private]
    fn ft_resolve_transfer(&mut self,sender_id:AccountId,receiver_id:AccountId,amount:U128)->U128 {
        let (used,_burned)=self.token.internal_ft_resolve_transfer(&sender_id,receiver_id,amount);U128(used)
    }
}

#[near]
impl StorageManagement for TestUsd {
    #[payable]
    fn storage_deposit(&mut self,account_id:Option<AccountId>,registration_only:Option<bool>)->StorageBalance {self.token.storage_deposit(account_id,registration_only)}
    #[payable]
    fn storage_withdraw(&mut self,amount:Option<NearToken>)->StorageBalance {self.token.storage_withdraw(amount)}
    #[payable]
    fn storage_unregister(&mut self,force:Option<bool>)->bool {self.token.internal_storage_unregister(force).is_some()}
    fn storage_balance_bounds(&self)->StorageBalanceBounds {self.token.storage_balance_bounds()}
    fn storage_balance_of(&self,account_id:AccountId)->Option<StorageBalance> {self.token.storage_balance_of(account_id)}
}

#[near]
impl FungibleTokenMetadataProvider for TestUsd {
    fn ft_metadata(&self) -> FungibleTokenMetadata { self.metadata.get().unwrap() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::VMContextBuilder,testing_env};
    use near_contract_standards::fungible_token::core::FungibleTokenCore;
    fn id(value:&str)->AccountId{value.parse().unwrap()}
    fn context(actor:&str,deposit:u128,balance:u128){testing_env!(VMContextBuilder::new().current_account_id(id("token.testnet")).predecessor_account_id(id(actor)).signer_account_id(id(actor)).attached_deposit(NearToken::from_yoctonear(deposit)).account_balance(NearToken::from_yoctonear(balance)).prepaid_gas(near_sdk::Gas::from_tgas(300)).build());}
    fn setup()->TestUsd{context("owner.testnet",0,NearToken::from_near(100).as_yoctonear());TestUsd::new(id("owner.testnet"),U128(1_000_000_000_000))}
    fn rejected(f:impl FnOnce()){assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).is_err());}
    #[test]
    fn fixed_test_supply_and_metadata() {
        testing_env!(VMContextBuilder::new().current_account_id("token.testnet".parse().unwrap()).build());
        let token=TestUsd::new("owner.testnet".parse().unwrap(),U128(1_000_000_000_000));
        assert_eq!(token.ft_total_supply().0,1_000_000_000_000);
        assert_eq!(token.ft_balance_of("owner.testnet".parse().unwrap()).0,1_000_000_000_000);
        assert_eq!(token.ft_metadata().decimals,6);
        assert_eq!(near_sdk::env::current_account_id().as_str(),"token.testnet");
    }
    #[test]
    fn public_demo_faucet_mints_fixed_amount_only_to_registered_predecessor_once(){
        let mut c=setup();c.token.internal_register_account(&id("alice.testnet"));c.token.internal_register_account(&id("bob.testnet"));
        context("alice.testnet",1,NearToken::from_near(100).as_yoctonear());let before=c.ft_total_supply().0;assert_eq!(c.demo_faucet().0,FAUCET_AMOUNT);assert_eq!(c.ft_balance_of(id("alice.testnet")).0,FAUCET_AMOUNT);assert_eq!(c.ft_balance_of(id("bob.testnet")).0,0);assert_eq!(c.ft_total_supply().0,before+FAUCET_AMOUNT);assert_eq!(c.faucet_recipients,vec![id("alice.testnet")]);let status=c.get_faucet_status(Some(id("alice.testnet")));assert!(status.claimed);assert_eq!(status.remaining_accounts,255);assert!(status.enabled);assert_eq!(status.amount.0,FAUCET_AMOUNT);assert!(near_sdk::test_utils::get_logs().iter().any(|log|log.contains("ft_mint")&&log.contains("alice.testnet")&&log.contains("1000000000")));
        context("alice.testnet",1,NearToken::from_near(100).as_yoctonear());rejected(||{c.demo_faucet();});assert_eq!(c.ft_balance_of(id("alice.testnet")).0,FAUCET_AMOUNT);assert_eq!(c.faucet_recipients.len(),1);
    }
    #[test]
    fn faucet_rejects_unregistered_wrong_deposit_and_insufficient_native_headroom_without_flags(){
        let mut c=setup();context("unregistered.testnet",1,NearToken::from_near(100).as_yoctonear());rejected(||{c.demo_faucet();});assert!(c.faucet_recipients.is_empty());c.token.internal_register_account(&id("alice.testnet"));for deposit in [0,2]{context("alice.testnet",deposit,NearToken::from_near(100).as_yoctonear());rejected(||{c.demo_faucet();});}context("alice.testnet",1,1);rejected(||{c.demo_faucet();});assert!(c.faucet_recipients.is_empty());assert_eq!(c.ft_balance_of(id("alice.testnet")).0,0);
    }
    #[test]
    fn faucet_reaches_exact_recipient_cap_and_measured_flag_storage_stays_bounded(){
        let mut c=setup();for i in 0..FAUCET_CAPACITY{let actor=format!("user{i:03}.testnet");c.token.internal_register_account(&id(&actor));context(&actor,1,NearToken::from_near(100).as_yoctonear());c.demo_faucet();}assert_eq!(c.faucet_recipients.len(),256);let status=c.get_faucet_status(None);assert!(!status.enabled);assert_eq!(status.remaining_accounts,0);c.token.internal_register_account(&id("last.testnet"));context("last.testnet",1,NearToken::from_near(100).as_yoctonear());rejected(||{c.demo_faucet();});assert_eq!(c.ft_balance_of(id("last.testnet")).0,0);
        let longest=(0..256).map(|i|id(&format!("{}{:03}.testnet","a".repeat(53),i))).collect::<Vec<_>>();assert!(longest.iter().all(|id|id.as_str().len()==64));let measured=near_sdk::borsh::to_vec(&longest).unwrap().len() as u64;assert_eq!(measured,4+FAUCET_CAPACITY as u64*FLAG_MAX_BYTES);assert!(measured<FAUCET_CAPACITY as u64*FLAG_MAX_BYTES+STATE_MARGIN_BYTES);println!("faucet_maximum_flags_serialized_bytes={measured};reserved_flags_plus_margin={}",FAUCET_CAPACITY as u64*FLAG_MAX_BYTES+STATE_MARGIN_BYTES);
    }
    #[test]
    fn faucet_profile_is_testnet_only_and_re_registration_does_not_reset_claim(){
        let mut c=setup();c.token.internal_register_account(&id("alice.testnet"));context("alice.testnet",1,NearToken::from_near(100).as_yoctonear());c.demo_faucet();assert!(c.storage_unregister(Some(true)));context("alice.testnet",1,NearToken::from_near(100).as_yoctonear());c.token.internal_register_account(&id("alice.testnet"));rejected(||{c.demo_faucet();});assert_eq!(c.ft_balance_of(id("alice.testnet")).0,0);
        testing_env!(VMContextBuilder::new().current_account_id(id("token.near")).predecessor_account_id(id("alice.testnet")).attached_deposit(NearToken::from_yoctonear(1)).account_balance(NearToken::from_near(100)).build());assert!(!c.get_faucet_status(None).enabled);rejected(||{c.demo_faucet();});rejected(||{TestUsd::new(id("owner.near"),U128(1));});
    }
}
