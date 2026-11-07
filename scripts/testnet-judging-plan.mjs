// Create the open "judging plan" on the existing keyless escrow, sponsored by the real Sputnik DAO.
// Valueless NEAR testnet only. Every step checks chain state first, so a rerun continues where it stopped.
// Evidence (every transaction hash and outcome) goes to docs/testnet-judging-plan.json.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Account,JsonRpcProvider,KeyPairSigner,actions} from 'near-api-js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(readFileSync(resolve(root,'docs/testnet-config.json'),'utf8'));
const RPC=process.env.NEAR_RPC_URL||'https://test.rpc.fastnear.com',N=10n**24n,U=10n**6n;
const provider=new JsonRpcProvider({url:RPC});
const evidencePath=resolve(root,'docs/testnet-judging-plan.json');
const evidence=existsSync(evidencePath)?JSON.parse(readFileSync(evidencePath,'utf8')):{network:'testnet',purpose:'Open plan for judges to pledge to from their own wallets',actions:[]};
const save=()=>writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
const {escrowId,tokenId,daoId}=config;
const [venue,equipment,access]=config.beneficiaries;

function account(slot){const c=JSON.parse(readFileSync(resolve(root,'.secrets',`${slot}.json`),'utf8'));assert.ok(c.accountId.endsWith('.testnet'));return new Account(c.accountId,provider,KeyPairSigner.fromSecretKey(c.privateKey));}
async function rpc(method,params){const r=await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'alltogether-judging-plan',method,params}),signal:AbortSignal.timeout(30000)});const v=await r.json();if(v.error)throw new Error(JSON.stringify(v.error));return v.result;}
async function view(id,method,args={}){const v=await rpc('query',{request_type:'call_function',account_id:id,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64'),finality:'final'});return JSON.parse(Buffer.from(v.result).toString());}
async function balance(id){return BigInt((await rpc('query',{request_type:'view_account',account_id:id,finality:'final'})).amount);}
const failed=out=>Boolean(out.status?.Failure)||(out.receipts_outcome??[]).some(r=>Boolean(r.outcome?.status?.Failure));
const decoded=out=>{const v=out.status?.SuccessValue;if(!v)return null;const t=Buffer.from(v,'base64').toString();return t?JSON.parse(t):null;};
async function send(label,who,receiverId,txActions){
  const out=await who.signAndSendTransaction({receiverId,actions:txActions,waitUntil:'FINAL',throwOnFailure:false});
  const hash=out.transaction?.hash??out.transaction_outcome?.id;
  evidence.actions.push({label,signer:who.accountId,receiver:receiverId,tx:hash,ok:!failed(out),at:new Date().toISOString()});save();
  assert.ok(!failed(out),`${label} failed: ${hash}`);console.log(label,hash);return out;
}
const call=(label,who,id,method,args,deposit=0n,gas=100_000_000_000_000n)=>send(label,who,id,[actions.functionCall(method,Buffer.from(JSON.stringify(args)),gas,deposit)]);

const owner=account('release-owner'),council=account('release-council'),alice=account('release-alice'),bob=account('release-bob');
const DEADLINE=String(Date.UTC(2026,10,20,0,0,0));
const legs=[
  {title:'Venue',purpose:'Community hall for four Saturday sessions',beneficiary:venue,budget:String(3000n*U),declared_sponsor_cap:String(1000n*U)},
  {title:'Tools',purpose:'Shared repair tools and spare parts',beneficiary:equipment,budget:String(1500n*U),declared_sponsor_cap:String(500n*U)},
  {title:'Access',purpose:'Ramp hire and a sign-language interpreter',beneficiary:access,budget:String(900n*U),declared_sponsor_cap:String(300n*U)},
];
const input={title:'Riverside Repair Café',summary:'Three budgets, one deadline: a hall, shared tools and step-free access. If any budget falls short, everyone is refunded.',
  detail:'Open for the hackathon judges. Claim 1,000 testUSD from the demo faucet and pledge to any budget before 20 November 2026, 00:00 UTC. The DAO matches each budget up to its cap once its proposal passes.',deadline_ms:DEADLINE,legs};

// 1. Pool test NEAR inside this project's accounts so the organizer can pay the plan's storage deposit.
const quote=await view(escrowId,'quote_campaign_storage',{leg_count:3});
let campaign=evidence.campaignId?await view(escrowId,'get_campaign',{campaign_id:evidence.campaignId}):null;
if(!campaign){
  const need=BigInt(quote.required_yocto)+N/10n;
  for(const [who,keep] of [[alice,N/7n],[bob,N/7n],[council,(14n*N)/10n]]){
    const have=await balance(owner.accountId);if(have>=need)break;
    const spare=(await balance(who.accountId))-keep;const amount=spare<need-have?spare:need-have;
    if(amount>0n)await send(`Move ${Number(amount/10n**20n)/1e4} test NEAR to the organizer`,who,owner.accountId,[actions.transfer(amount)]);
  }
  assert.ok(await balance(owner.accountId)>=need,'The organizer still lacks the storage deposit.');
  // 2. The organizer publishes the plan. Its terms (and their hash) are fixed from here on.
  const out=await call('Organizer publishes the Riverside Repair Café plan',owner,escrowId,'create_campaign',{input},BigInt(quote.required_yocto),30_000_000_000_000n);
  campaign=decoded(out);evidence.campaignId=campaign.id;evidence.termsHash=campaign.terms_hash;evidence.deadlineMs=DEADLINE;save();
}
const id=campaign.id;assert.equal(campaign.terms_hash,evidence.termsHash);
const reserve=campaign.terms.legs.reduce((n,l)=>n+BigInt(l.sponsorAllocation),0n);

// 3. Top up the DAO treasury with the matching reserve (it holds 100 testUSD from earlier runs).
if(campaign.state==='AwaitingFunding'&&evidence.proposalId===undefined){
  const daoBalance=BigInt(await view(tokenId,'ft_balance_of',{account_id:daoId}));
  if(daoBalance<reserve)await call(`Treasury top-up: ${(reserve-daoBalance)/U} testUSD to the DAO`,owner,tokenId,'ft_transfer',{receiver_id:daoId,amount:String(reserve-daoBalance),memo:'Matching reserve for the Riverside Repair Café'},1n,30_000_000_000_000n);
  // 4. A Sputnik proposal asks the DAO to send exactly the reserve, bound to this plan's terms hash.
  const policy=await view(daoId,'get_policy');
  const inner={receiver_id:escrowId,amount:String(reserve),memo:`AllTogether campaign ${id}`,msg:JSON.stringify({v:1,action:'sponsor',campaign_id:id,terms_hash:campaign.terms_hash})};
  const description=`AllTogether ${id}: ${campaign.terms.title}\nTerms SHA-256: ${campaign.terms_hash}\nOne deadline: ${campaign.terms.deadlineMs}\nAll earmarked budgets must succeed.\n${campaign.terms.legs.map(l=>`${l.title}: ${l.budget} base units to ${l.beneficiary}`).join('\n')}`;
  const out=await call('Council member proposes the DAO match',council,daoId,'add_proposal',{proposal:{description,kind:{FunctionCall:{receiver_id:tokenId,actions:[{method_name:'ft_transfer_call',args:Buffer.from(JSON.stringify(inner)).toString('base64'),deposit:'1',gas:'100000000000000'}]}}}},BigInt(policy.proposal_bond));
  evidence.proposalId=Number(decoded(out));save();
}
// 5. The council votes. Approval executes the proposal: the reserve moves into the escrow, which opens the plan.
if((await view(escrowId,'get_campaign',{campaign_id:id})).state==='AwaitingFunding'){
  const proposal=await view(daoId,'get_proposal',{id:evidence.proposalId});assert.equal(proposal.status,'InProgress');
  await call('Council approves; the DAO sends the reserve to the escrow',council,daoId,'act_proposal',{id:evidence.proposalId,action:'VoteApprove'},0n,280_000_000_000_000n);
}
campaign=await view(escrowId,'get_campaign',{campaign_id:id});assert.equal(campaign.state,'Open');
assert.equal((await view(daoId,'get_proposal',{id:evidence.proposalId})).status,'Approved');

// 6. Two community members pledge, so the board shows a plan in progress.
for(const [who,leg,amount] of [[alice,0,500n*U],[bob,1,300n*U],[bob,2,150n*U]]){
  const label=`${who.accountId.split('.')[0]} pledges ${amount/U} testUSD to ${legs[leg].title}`;
  if(evidence.actions.some(a=>a.label===label&&a.ok))continue;
  await call(label,who,tokenId,'ft_transfer_call',{receiver_id:escrowId,amount:String(amount),memo:`AllTogether campaign ${id}`,msg:JSON.stringify({v:1,action:'pledge',campaign_id:id,terms_hash:campaign.terms_hash,leg_id:leg})},1n);
}
campaign=await view(escrowId,'get_campaign',{campaign_id:id});
evidence.state={observedAt:new Date().toISOString(),state:campaign.state,active:campaign.active,targets:campaign.terms.legs.map(l=>l.communityTarget),accounting:campaign.accounting};save();
console.log(JSON.stringify(evidence.state,null,2));
