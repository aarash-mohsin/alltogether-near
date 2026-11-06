use near_sdk::{near, AccountId};
use near_sdk::json_types::{U128, U64};

pub const PARTICIPANTS: u16 = 128;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub dao_id: AccountId,
    pub token_id: AccountId,
    pub token_decimals: u8,
    pub token_symbol: String,
}

#[near(serializers = [json])]
#[serde(deny_unknown_fields)]
pub struct LegInput {
    pub title: String,
    pub purpose: String,
    pub beneficiary: AccountId,
    pub budget: U128,
    pub declared_sponsor_cap: U128,
}

#[near(serializers = [json])]
#[serde(deny_unknown_fields)]
pub struct PublishInput {
    pub title: String,
    pub summary: String,
    pub detail: String,
    pub deadline_ms: U64,
    pub legs: Vec<LegInput>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
#[serde(rename_all = "camelCase")]
pub struct LegTerms {
    pub leg_id: u8,
    pub title: String,
    pub purpose: String,
    pub beneficiary: AccountId,
    pub budget: U128,
    pub declared_sponsor_cap: U128,
    pub sponsor_allocation: U128,
    pub community_target: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
#[serde(rename_all = "camelCase")]
pub struct Terms {
    pub schema_version: u8,
    pub domain: String,
    pub escrow_id: AccountId,
    pub campaign_id: String,
    pub organizer: AccountId,
    pub title: String,
    pub summary: String,
    pub detail: String,
    pub dao_id: AccountId,
    pub token_id: AccountId,
    pub token_decimals: u8,
    pub token_symbol: String,
    pub deadline_ms: U64,
    pub participant_limit: u16,
    pub match_rule: String,
    pub settlement_rule: String,
    pub legs: Vec<LegTerms>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Default, Debug, PartialEq)]
pub struct Accounting {
    pub accepted_inflows: U128,
    pub active_principal: U128,
    pub sponsor_reserved: U128,
    pub failed_principal_reserved: U128,
    pub available_credits: U128,
    pub pending_transfers: U128,
    pub confirmed_paid: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum CampaignState { AwaitingFunding, Open, Succeeded, Failed }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Campaign {
    pub id: U64,
    pub terms: Terms,
    pub terms_hash: String,
    pub state: CampaignState,
    pub created_at_ms: U64,
    pub finalized_at_ms: Option<U64>,
    pub failure_reason: Option<String>,
    pub active: Vec<U128>,
    pub closing_active: Option<Vec<U128>>,
    pub participant_count: u16,
    pub accounting: Accounting,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct Position { pub active: U128, pub accepted_total: U128, pub refund_consumed: bool }

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CreditKind { Withdrawal, Refund, Beneficiary, SponsorRefund }

impl CreditKind {
    pub fn as_str(&self) -> &'static str {
        match self { Self::Withdrawal => "withdrawal", Self::Refund => "refund", Self::Beneficiary => "beneficiary", Self::SponsorRefund => "sponsor_refund" }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum AttemptStatus { Pending, Succeeded, Failed }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Attempt {
    pub nonce: U64,
    pub amount: U128,
    pub status: AttemptStatus,
    pub created_at_ms: U64,
    pub resolved_at_ms: Option<U64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Credit {
    pub id: String,
    pub campaign_id: U64,
    pub kind: CreditKind,
    pub owner: AccountId,
    pub recipient: AccountId,
    pub leg_id: Option<u8>,
    pub available: U128,
    pub pending: U128,
    pub paid: U128,
    pub nonce: U64,
    pub last_attempt: Option<Attempt>,
}

#[near(serializers = [json])]
pub struct StorageQuote {
    pub required_yocto: U128,
    pub reserved_bytes: U64,
    pub participant_limit: u16,
    pub record_bytes: U64,
    pub key_overhead_per_record: u64,
}

#[near(serializers = [json])]
pub struct AccountCampaign {
    pub account_id: AccountId,
    pub positions: Vec<Position>,
    pub credits: Vec<Credit>,
}
