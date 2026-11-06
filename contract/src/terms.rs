use near_sdk::{env, require};
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json};
use crate::model::*;

pub fn add(a: u128, b: u128) -> u128 { a.checked_add(b).expect("AMOUNT_OVERFLOW") }
pub fn sub(a: u128, b: u128) -> u128 { a.checked_sub(b).expect("AMOUNT_UNDERFLOW") }

pub fn canonical(terms: &Terms) -> String {
    let legs: Vec<_> = terms.legs.iter().map(|l| json!([
        l.leg_id, l.title, l.purpose, l.beneficiary, l.budget,
        l.declared_sponsor_cap, l.sponsor_allocation, l.community_target
    ])).collect();
    serde_json::to_string(&json!([
        "alltogether-terms-v1", terms.schema_version, terms.domain,
        terms.escrow_id, terms.campaign_id, terms.organizer,
        terms.title, terms.summary, terms.detail, terms.dao_id, terms.token_id,
        terms.token_decimals, terms.token_symbol, terms.deadline_ms,
        terms.participant_limit, terms.match_rule, terms.settlement_rule, legs
    ])).expect("SERIALIZATION_ERROR")
}

pub fn hash(terms: &Terms) -> String {
    env::sha256(canonical(terms).as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

pub fn validate_input(input: &PublishInput) {
    require!((1..=80).contains(&input.title.chars().count()), "INVALID_TITLE");
    require!((1..=500).contains(&input.summary.chars().count()), "INVALID_SUMMARY");
    require!(input.detail.chars().count() <= 2000, "INVALID_DETAIL");
    let now = env::block_timestamp_ms();
    require!(input.deadline_ms.0 > now && input.deadline_ms.0 <= now.saturating_add(365 * 86400000), "INVALID_DEADLINE");
    require!((1..=3).contains(&input.legs.len()), "INVALID_LEG_COUNT");
    let mut total = 0u128;
    for leg in &input.legs {
        require!(leg.beneficiary != env::current_account_id(), "ESCROW_BENEFICIARY_FORBIDDEN");
        require!((1..=60).contains(&leg.title.chars().count()), "INVALID_LEG_TITLE");
        require!(leg.purpose.chars().count() <= 240, "INVALID_PURPOSE");
        require!(leg.budget.0 >= 2 && leg.declared_sponsor_cap.0 > 0 && leg.declared_sponsor_cap.0 <= leg.budget.0, "INVALID_AMOUNTS");
        total = add(total, leg.budget.0);
    }
}

pub fn derive_legs(input: Vec<LegInput>) -> Vec<LegTerms> {
    input.into_iter().enumerate().map(|(id, l)| {
        let sponsor = l.declared_sponsor_cap.0.min(l.budget.0 / 2);
        LegTerms { leg_id: id as u8, title: l.title, purpose: l.purpose,
            beneficiary: l.beneficiary, budget: l.budget, declared_sponsor_cap: l.declared_sponsor_cap,
            sponsor_allocation: U128(sponsor), community_target: U128(l.budget.0 - sponsor) }
    }).collect()
}

pub fn assert_books(a: &Accounting) {
    let live = [a.active_principal.0, a.sponsor_reserved.0, a.failed_principal_reserved.0,
        a.available_credits.0, a.pending_transfers.0].into_iter().fold(0u128, add);
    require!(sub(a.accepted_inflows.0, a.confirmed_paid.0) == live, "ACCOUNTING_INVARIANT");
}
