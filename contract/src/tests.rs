use super::*;
use near_sdk::{testing_env, test_utils::VMContextBuilder, PromiseResult};
use near_sdk::test_utils::accounts;

fn account(s: &str)->AccountId { s.parse().unwrap() }
fn ctx(actor: &str,time:u64,deposit:u128) {
    testing_env!(VMContextBuilder::new().current_account_id(account("escrow.alltogether.testnet"))
        .predecessor_account_id(account(actor)).signer_account_id(account(actor))
        .block_timestamp(time*1_000_000).attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100)).prepaid_gas(Gas::from_tgas(300)).build());
}
fn callback(success:bool,time:u64) {
    let context=VMContextBuilder::new().current_account_id(account("escrow.alltogether.testnet"))
        .predecessor_account_id(account("escrow.alltogether.testnet"))
        .block_timestamp(time*1_000_000).account_balance(NearToken::from_near(100))
        .prepaid_gas(Gas::from_tgas(300)).build();
    testing_env!(context,near_sdk::test_vm_config(),near_sdk::RuntimeFeesConfig::test(),std::collections::HashMap::default(),
        vec![if success {PromiseResult::Successful(vec![])} else {PromiseResult::Failed}]);
}
fn setup()->AllTogether {
    ctx("organizer.testnet",1000,0);
    AllTogether::new(Config {dao_id:account("dao.testnet"),token_id:account("token.testnet"),token_decimals:6,token_symbol:"testUSD".into()})
}

#[test]
fn escrow_self_beneficiary_rejected_before_any_state_allocation(){
    let mut c=setup();let mut bad=input(2000);bad.legs[1].beneficiary=account("escrow.alltogether.testnet");
    ctx("organizer.testnet",1000,NearToken::from_near(50).as_yoctonear());let before=env::storage_usage();
    let result=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||c.create_campaign(bad)));assert!(result.is_err());
    assert_eq!(c.next_campaign,1);assert_eq!(c.index.len(),0);assert_eq!(env::storage_usage(),before);assert_eq!(c.global_accounting,Accounting::default());
    let created=create(&mut c,2000);assert_eq!(created.id.0,1);
}

#[test]
fn duplicate_ordinary_beneficiaries_keep_separate_earmarked_credits(){
    let mut c=setup();let mut valid=input(2000);for leg in &mut valid.legs{leg.beneficiary=account("venue.testnet");}
    ctx("organizer.testnet",1000,NearToken::from_near(50).as_yoctonear());let campaign=c.create_campaign(valid);full(&mut c,campaign.id.0,1100);
    ctx("reader.testnet",2000,0);c.finalize(campaign.id);let view=c.get_account_campaign(campaign.id,account("venue.testnet"));assert_eq!(view.credits.len(),3);
    for (leg,expected) in [(0,600),(1,250),(2,150)]{let credit=view.credits.iter().find(|credit|credit.leg_id==Some(leg)).unwrap();assert_eq!(credit.available.0,expected);assert_eq!(credit.recipient,account("venue.testnet"));}check(&c,campaign.id.0);
}
fn input(deadline:u64)->PublishInput {
    PublishInput {title:"Accessible maker day".into(),summary:"All essential obligations".into(),detail:"".into(),deadline_ms:U64(deadline),
        legs:vec![(600,200,"venue.testnet"),(250,125,"equipment.testnet"),(150,75,"access.testnet")].into_iter().map(|(b,k,a)|LegInput {title:a.into(),purpose:"Essential".into(),beneficiary:account(a),budget:U128(b),declared_sponsor_cap:U128(k)}).collect()}
}
fn create(c:&mut AllTogether,deadline:u64)->Campaign {
    ctx("organizer.testnet",1000,NearToken::from_near(50).as_yoctonear());
    c.create_campaign(input(deadline))
}
fn receive(c:&mut AllTogether,id:u64,sender:&str,action:&str,leg:Option<u8>,amount:u128,time:u64)->u128 {
    ctx("token.testnet",time,0);
    let campaign=c.get_campaign(U64(id)).unwrap();
    let mut msg=json!({"v":1,"action":action,"campaign_id":id.to_string(),"terms_hash":campaign.terms_hash});
    if let Some(leg)=leg {msg["leg_id"]=json!(leg)}
    match c.ft_on_transfer(account(sender),U128(amount),msg.to_string()) {PromiseOrValue::Value(v)=>v.0,_=>panic!("unexpected promise")}
}
fn full(c:&mut AllTogether,id:u64,time:u64) {
    assert_eq!(receive(c,id,"dao.testnet","sponsor",None,400,time),0);
    for (leg,amount) in [(0,400),(1,125),(2,75)] {assert_eq!(receive(c,id,"alice.testnet","pledge",Some(leg),amount,time),0);}
}
fn check(c:&AllTogether,id:u64) {
    let campaign=c.must_campaign(id);terms::assert_books(&campaign.accounting);terms::assert_books(&c.global_accounting);
    // Independently rebuild liabilities from records for the two-actor generated and
    // canonical scenarios, rather than trusting aggregates that could drift together.
    if campaign.participant_count<=2 {
        let mut accepted=0u128;let mut active=0u128;let mut failed=0u128;
        for actor in ["alice.testnet","bob.testnet"] {
            for leg in 0..campaign.terms.legs.len() as u8 {
                if let Some(p)=c.positions.get(&position_key(id,&account(actor),leg)) {
                    accepted=add(accepted,p.accepted_total.0);
                    if campaign.state==CampaignState::Open {active=add(active,p.active.0);}
                    if campaign.state==CampaignState::Failed && !p.refund_consumed {failed=add(failed,p.active.0);}
                }
            }
        }
        if campaign.state!=CampaignState::AwaitingFunding && campaign.failure_reason.as_deref()!=Some("SPONSOR_NOT_FUNDED") {
            accepted=add(accepted,campaign.terms.legs.iter().fold(0,|a,l|add(a,l.sponsor_allocation.0)));
        }
        let mut available=0;let mut pending=0;let mut paid=0;
        for actor in ["alice.testnet","bob.testnet","dao.testnet","venue.testnet","equipment.testnet","access.testnet"] {
            let account=account(actor);
            for kind in [CreditKind::Withdrawal,CreditKind::Refund,CreditKind::SponsorRefund] {
                if let Some(credit)=c.credits.get(&credit_key(id,&kind,&account,None)) {available=add(available,credit.available.0);pending=add(pending,credit.pending.0);paid=add(paid,credit.paid.0);}
            }
            for leg in 0..campaign.terms.legs.len() as u8 {
                if let Some(credit)=c.credits.get(&credit_key(id,&CreditKind::Beneficiary,&account,Some(leg))) {available=add(available,credit.available.0);pending=add(pending,credit.pending.0);paid=add(paid,credit.paid.0);}
            }
        }
        assert_eq!(campaign.accounting.accepted_inflows.0,accepted);
        assert_eq!(campaign.accounting.active_principal.0,active);
        assert_eq!(campaign.accounting.failed_principal_reserved.0,failed);
        assert_eq!(campaign.accounting.available_credits.0,available);
        assert_eq!(campaign.accounting.pending_transfers.0,pending);
        assert_eq!(campaign.accounting.confirmed_paid.0,paid);
    }
}

#[test]
fn canonical_unicode_odd_units_shared_vector() {
    let _c=setup();
    let fixture:Value=serde_json::from_str(include_str!("../../shared/fixtures/terms-v1.json")).unwrap();
    let terms:Terms=serde_json::from_value(fixture["terms"].clone()).unwrap();
    assert_eq!(terms::canonical(&terms),fixture["canonical"].as_str().unwrap());
    assert_eq!(terms::hash(&terms),fixture["sha256"].as_str().unwrap());
    let legs=terms::derive_legs(vec![LegInput {title:"Odd".into(),purpose:"".into(),beneficiary:accounts(0),budget:U128(101),declared_sponsor_cap:U128(60)}]);
    assert_eq!(legs[0].sponsor_allocation.0,50);assert_eq!(legs[0].community_target.0,51);
}

#[test]
fn sponsor_auth_exact_hash_and_strict_messages_return_unused() {
    let mut c=setup();let p=create(&mut c,2000);
    assert_eq!(receive(&mut c,p.id.0,"alice.testnet","sponsor",None,400,1100),400);
    assert_eq!(receive(&mut c,p.id.0,"dao.testnet","sponsor",None,399,1100),399);
    ctx("token.testnet",1100,0);
    assert!(matches!(c.ft_on_transfer(account("dao.testnet"),U128(400),"{}".into()),PromiseOrValue::Value(U128(400))));
    let msg=json!({"v":1,"action":"sponsor","campaign_id":p.id.0.to_string(),"terms_hash":"wrong"}).to_string();
    assert!(matches!(c.ft_on_transfer(account("dao.testnet"),U128(400),msg),PromiseOrValue::Value(U128(400))));
    assert_eq!(c.must_campaign(p.id.0).state,CampaignState::AwaitingFunding);
    assert_eq!(receive(&mut c,p.id.0,"dao.testnet","sponsor",None,400,1100),0);
    assert_eq!(receive(&mut c,p.id.0,"dao.testnet","sponsor",None,400,1100),400);
    assert_eq!(receive(&mut c,p.id.0,"alice.testnet","pledge",Some(0),401,1100),401);
    assert_eq!(receive(&mut c,p.id.0,"alice.testnet","pledge",Some(0),400,2000),400);
    check(&c,p.id.0);
}

#[test]
#[should_panic(expected="UNKNOWN_TOKEN")]
fn unknown_token_predecessor_panics() {
    let mut c=setup();ctx("attacker.testnet",1001,0);
    let _=c.ft_on_transfer(account("dao.testnet"),U128(400),"{}".into());
}

#[test]
fn failure_refunds_all_legs_and_dao_once() {
    let mut c=setup();let p=create(&mut c,2000);
    assert_eq!(receive(&mut c,p.id.0,"dao.testnet","sponsor",None,400,1100),0);
    for (leg,amount) in [(0,400),(1,125),(2,50)] {assert_eq!(receive(&mut c,p.id.0,"alice.testnet","pledge",Some(leg),amount,1100),0);}
    ctx("anyone.testnet",2000,0);let outcome=c.finalize(p.id);
    assert_eq!(outcome.state,CampaignState::Failed);assert_eq!(outcome.accounting.failed_principal_reserved.0,575);
    assert!(c.get_credit(credit_key(p.id.0,&CreditKind::Beneficiary,&account("venue.testnet"),Some(0))).is_none());
    let sponsor=c.get_credit(credit_key(p.id.0,&CreditKind::SponsorRefund,&account("dao.testnet"),None)).unwrap();assert_eq!(sponsor.available.0,400);
    c.finalize(p.id);
    ctx("alice.testnet",2001,0);assert_eq!(c.materialize_refund(p.id).unwrap().available.0,575);
    assert_eq!(c.materialize_refund(p.id).unwrap().available.0,575);check(&c,p.id.0);
}

#[test]
fn success_credits_allocate_together_and_callback_retry() {
    let mut c=setup();let p=create(&mut c,2000);full(&mut c,p.id.0,1100);
    ctx("anyone.testnet",2000,0);let outcome=c.finalize(p.id);assert_eq!(outcome.state,CampaignState::Succeeded);
    for (leg,amount,owner) in [(0,600,"venue.testnet"),(1,250,"equipment.testnet"),(2,150,"access.testnet")] {
        assert_eq!(c.get_credit(credit_key(p.id.0,&CreditKind::Beneficiary,&account(owner),Some(leg))).unwrap().available.0,amount);
    }
    let key=credit_key(p.id.0,&CreditKind::Beneficiary,&account("equipment.testnet"),Some(1));
    ctx("anyone.testnet",2001,1);let _=c.claim_credit(key.clone());
    callback(false,2002);assert!(!c.on_transfer_result(key.clone(),U64(1)));assert_eq!(c.get_credit(key.clone()).unwrap().available.0,250);
    assert!(!c.on_transfer_result(key.clone(),U64(1)));
    ctx("anyone.testnet",2003,1);let _=c.claim_credit(key.clone());
    callback(true,2004);assert!(!c.on_transfer_result(key.clone(),U64(1)));assert!(c.on_transfer_result(key.clone(),U64(2)));
    assert_eq!(c.get_credit(key).unwrap().paid.0,250);check(&c,p.id.0);
}

#[test]
fn oversized_success_return_does_not_restore_already_paid_credit() {
    let mut c=setup();let p=create(&mut c,2000);full(&mut c,p.id.0,1100);
    ctx("anyone.testnet",2000,0);c.finalize(p.id);
    let key=credit_key(p.id.0,&CreditKind::Beneficiary,&account("venue.testnet"),Some(0));
    ctx("anyone.testnet",2001,1);let _=c.claim_credit(key.clone());
    let context=VMContextBuilder::new().current_account_id(account("escrow.alltogether.testnet"))
        .predecessor_account_id(account("escrow.alltogether.testnet")).block_timestamp(2002*1_000_000)
        .account_balance(NearToken::from_near(100)).prepaid_gas(Gas::from_tgas(300)).build();
    testing_env!(context,near_sdk::test_vm_config(),near_sdk::RuntimeFeesConfig::test(),std::collections::HashMap::default(),vec![PromiseResult::Successful(vec![0;1024])]);
    assert!(c.on_transfer_result(key.clone(),U64(1)));assert_eq!(c.get_credit(key).unwrap().paid.0,600);check(&c,p.id.0);
}

#[test]
#[should_panic(expected="DEADLINE_REACHED")]
fn exact_close_forbids_withdrawal() {
    let mut c=setup();let p=create(&mut c,2000);full(&mut c,p.id.0,1999);
    ctx("alice.testnet",2000,0);c.remove_pledge(p.id,0,U128(1));
}

#[test]
#[should_panic(expected="DEADLINE_NOT_REACHED")]
fn one_millisecond_before_close_forbids_finalize() {
    let mut c=setup();let p=create(&mut c,2000);ctx("anyone.testnet",1999,0);c.finalize(p.id);
}

#[test]
#[should_panic(expected="STORAGE_NOT_FUNDED")]
fn creation_requires_storage_quote() {
    let mut c=setup();ctx("organizer.testnet",1000,0);c.create_campaign(input(2000));
}

#[test]
fn withdrawal_failure_after_close_never_revives_principal_and_preserves_new_credit() {
    let mut c=setup();let p=create(&mut c,2000);full(&mut c,p.id.0,1100);
    ctx("alice.testnet",1900,0);let withdrawal=c.remove_pledge(p.id,0,U128(20));
    ctx("alice.testnet",1901,1);let _=c.claim_credit(withdrawal.id.clone());
    ctx("alice.testnet",1902,0);c.remove_pledge(p.id,0,U128(10));
    ctx("anyone.testnet",2000,0);assert_eq!(c.finalize(p.id).state,CampaignState::Failed);
    callback(false,2001);c.on_transfer_result(withdrawal.id.clone(),U64(1));
    assert_eq!(c.get_credit(withdrawal.id).unwrap().available.0,30);
    assert_eq!(c.must_campaign(p.id.0).active[0].0,370);
    assert_eq!(c.must_campaign(p.id.0).accounting.failed_principal_reserved.0,570);check(&c,p.id.0);
}

#[test]
#[should_panic(expected="PRIVATE_CALLBACK")]
fn callback_is_not_public_authority() {let mut c=setup();ctx("attacker.testnet",1001,0);c.on_transfer_result("missing".into(),U64(1));}

#[test]
#[should_panic(expected="NOT_CREDIT_OWNER")]
fn other_actor_cannot_claim_withdrawal() {
    let mut c=setup();let p=create(&mut c,2000);full(&mut c,p.id.0,1100);
    ctx("alice.testnet",1200,0);let credit=c.remove_pledge(p.id,0,U128(20));
    ctx("attacker.testnet",1201,1);let _=c.claim_credit(credit.id);
}

#[test]
fn lifetime_admission_limit_survives_withdrawals_and_finalize_bounded() {
    let mut c=setup();let p=create(&mut c,2000);receive(&mut c,p.id.0,"dao.testnet","sponsor",None,400,1100);
    for i in 0..128 {
        let actor=format!("person-{i}.testnet");assert_eq!(receive(&mut c,p.id.0,&actor,"pledge",Some(0),1,1100),0);
        ctx(&actor,1101,0);c.remove_pledge(p.id,0,U128(1));
    }
    assert_eq!(receive(&mut c,p.id.0,"person-128.testnet","pledge",Some(0),1,1102),1);
    assert_eq!(c.must_campaign(p.id.0).participant_count,128);
    ctx("anyone.testnet",2000,0);let before=env::used_gas().as_gas();c.finalize(p.id);let used=env::used_gas().as_gas()-before;
    assert!(used<Gas::from_tgas(25).as_gas());check(&c,p.id.0);
}

#[test]
fn generated_sequences_two_campaigns_conserve_independent_balances() {
    let mut c=setup();let a=create(&mut c,3000);let b=create(&mut c,3000);
    receive(&mut c,a.id.0,"dao.testnet","sponsor",None,400,1100);receive(&mut c,b.id.0,"dao.testnet","sponsor",None,400,1100);
    let mut random=0x9e3779b9u64;
    for step in 0..100 {
        random=random.wrapping_mul(6364136223846793005).wrapping_add(1);
        let id=if random&1==0 {a.id.0}else{b.id.0};let leg=((random>>8)%3) as u8;let amount=((random>>16)%9+1) as u128;
        let actor=if random&4==0 {"alice.testnet"}else{"bob.testnet"};
        receive(&mut c,id,actor,"pledge",Some(leg),amount,1200+step);
        if random&2==0 {
            let key=position_key(id,&account(actor),leg);
            if let Some(p)=c.positions.get(&key) {let value=p.active.0.min(3);if value>0 {ctx(actor,1300+step,0);c.remove_pledge(U64(id),leg,U128(value));}}
        }
        check(&c,a.id.0);check(&c,b.id.0);
    }
    ctx("anyone.testnet",3000,0);c.finalize(a.id);c.finalize(b.id);check(&c,a.id.0);check(&c,b.id.0);
}

#[test]
fn storage_quote_uses_serialized_worst_records_and_bounds_actual_growth() {
    let mut c=setup();let quote=c.quote_campaign_storage(3);assert!(quote.reserved_bytes.0>100_000);
    let before=env::storage_usage();let p=create(&mut c,2000);receive(&mut c,p.id.0,"dao.testnet","sponsor",None,400,1100);
    for i in 0..128 {let actor=format!("{}{:03}.testnet","a".repeat(52),i);for leg in 0..3 {receive(&mut c,p.id.0,&actor,"pledge",Some(leg),1,1100);}ctx(&actor,1200,0);c.remove_pledge(p.id,0,U128(1));}
    c.campaigns.flush();c.positions.flush();c.credits.flush();c.index.flush();
    let actual=env::storage_usage()-before;
    assert!(actual<quote.reserved_bytes.0,"actual {actual} >= quote {}",quote.reserved_bytes.0);
    println!("3-leg storage reserved_bytes={} measured_partial_liability_bytes={actual} required_yocto={}",quote.reserved_bytes.0,quote.required_yocto.0);
}
