// Read-only checks and history for the live AllTogether deployment on NEAR testnet.
// Shared by the hosted page (site/) and `npm run verify` (scripts/verify.mjs). Nothing here signs or needs a key.
import type {NearAccounting,NearCampaign,NearCredit,NearPosition,NearFaucetStatus} from './near.ts';
import {hashTerms} from './terms.ts';
import {formatAmount} from './amounts.ts';

export const ESCROW='escrow.at-rel-owner-mw4f9xmq.testnet';
export const TOKEN='testusd.at-rel-owner-mw4f9xmq.testnet';
export const DAO='alltogether-mw4f9nmo.sputnikv2.testnet';
export const EXPECTED_ESCROW_HASH='DJ73KDw8fE818kYrR9CVMztonGUnv8nn4475fpdV21pS';
export const EXPECTED_TOKEN_HASH='9Sc4vjKHWKwB7BYVPRzsfzkiHS9NhebDCM459Yz4fgqy';
export const RPC_URLS=['https://test.rpc.fastnear.com','https://testnet-rpc.intea.rs','https://rpc.testnet.near.org'];
export const TX_API='https://tx.test.fastnear.com/v0';
export const explorerTx=(hash:string)=>`https://testnet.nearblocks.io/txns/${hash}`;
export const explorerAccount=(id:string)=>`https://testnet.nearblocks.io/address/${id}`;
export const daoProposalUrl=(id:number)=>`https://testnet.app.astrodao.com/dao/${DAO}/proposals/${DAO}-${id}`;

const B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes:Uint8Array):string{
  let n=0n;for(const b of bytes)n=n*256n+BigInt(b);
  let out='';while(n>0n){out=B58[Number(n%58n)]+out;n/=58n;}
  for(const b of bytes){if(b!==0)break;out='1'+out;}return out;
}
export async function codeHashOf(wasm:Uint8Array):Promise<string>{
  return base58(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new Uint8Array(wasm).buffer)));
}

type Fetch=typeof fetch;
async function postJson(fetcher:Fetch,url:string,body:unknown,timeout=15000,attempts=1):Promise<any>{
  for(let attempt=1;;attempt++){
    try{
      const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
      if(!response.ok)throw new Error(`${url} answered HTTP ${response.status}`);
      return await response.json();
    }catch(error){if(attempt>=attempts)throw error;await new Promise(r=>setTimeout(r,700*attempt));}
  }
}
export async function rpc(method:string,params:unknown,fetcher:Fetch=fetch):Promise<any>{
  let last:unknown;
  for(const url of RPC_URLS){
    try{
      const value=await postJson(fetcher,url,{jsonrpc:'2.0',id:'alltogether',method,params});
      if(value.error)throw new Error(value.error.data??value.error.message??JSON.stringify(value.error));
      if(value.result?.error)throw new Error(String(value.result.error));
      return value.result;
    }catch(error){last=error;}
  }
  throw last instanceof Error?last:new Error(String(last));
}
const utf8=(value:string)=>{let raw='';for(const b of new TextEncoder().encode(value))raw+=String.fromCharCode(b);return btoa(raw);};
const unb64=(value:string)=>new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0)));
export async function view<T>(account:string,method:string,args:unknown={},fetcher:Fetch=fetch):Promise<T>{
  const result=await rpc('query',{request_type:'call_function',finality:'final',account_id:account,method_name:method,args_base64:utf8(JSON.stringify(args))},fetcher);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result as number[])));
}

/** One EVENT_JSON log from the escrow, with the transaction that caused it. */
export interface ChainEvent {
  tx:string;at:string;block:number;signer:string;receiver:string;method:string;args:any;
  event:string;data:any;
  /** For pledges: the budget named in the ft_transfer_call message. */
  leg:number|null;
}
export interface DaoProposal {id:number;proposer:string;description:string;status:string;kind:any;votes:Record<string,string>;submission_time:string;campaign_id:string|null;terms_hash:string|null;amount:string|null;}
export interface PlanAccount {account_id:string;positions:NearPosition[];credits:NearCredit[];}
export interface LivePlan {campaign:NearCampaign;proposal:DaoProposal|null;contributors:PlanAccount[];beneficiary_credits:(NearCredit|null)[];sponsor_refund:NearCredit|null;}
export interface LiveState {
  observed_at:string;chain_id:string;block_time_ms:string;
  escrow:{code_hash:string;keys:unknown[];config:any;token_balance:string;accounting:NearAccounting};
  token:{code_hash:string;keys:unknown[];faucet:NearFaucetStatus|null};
  plans:LivePlan[];proposals:DaoProposal[];
  events:ChainEvent[];history_source:'fastnear-tx-api'|'unavailable';history_error:string|null;
}

function parseSponsor(kind:any):{campaign_id:string|null;terms_hash:string|null;amount:string|null}{
  const fc=kind?.FunctionCall;const action=fc?.actions?.[0];
  if(!fc||fc.receiver_id!==TOKEN||action?.method_name!=='ft_transfer_call')return {campaign_id:null,terms_hash:null,amount:null};
  try{const args=JSON.parse(unb64(action.args));const msg=JSON.parse(args.msg);
    if(args.receiver_id!==ESCROW||msg.action!=='sponsor')return {campaign_id:null,terms_hash:null,amount:null};
    return {campaign_id:String(msg.campaign_id),terms_hash:String(msg.terms_hash),amount:String(args.amount)};
  }catch{return {campaign_id:null,terms_hash:null,amount:null};}
}

/** Every transaction that reached the escrow, with its AllTogether event logs. */
export async function readHistory(fetcher:Fetch=fetch):Promise<ChainEvent[]>{
  const listing=await postJson(fetcher,`${TX_API}/account`,{account_id:ESCROW},20000,3);
  const hashes:string[]=[...new Set<string>((listing.account_txs??[]).map((t:any)=>t.transaction_hash))];
  const details:any[]=[];
  for(let i=0;i<hashes.length;i+=5){
    const page=await postJson(fetcher,`${TX_API}/transactions`,{tx_hashes:hashes.slice(i,i+5)},20000,3);
    if(!Array.isArray(page.transactions))throw new Error('The transaction API returned no transactions.');
    details.push(...page.transactions);
  }
  const events:ChainEvent[]=[];
  for(const item of details){
    const tx=item.transaction;
    const call=(tx.actions as any[]).map(a=>typeof a==='object'&&a.FunctionCall?a.FunctionCall:null).find(Boolean);
    let args:any=null;try{args=call?JSON.parse(unb64(call.args)):null;}catch{args=null;}
    let leg:number|null=null;
    if(call?.method_name==='ft_transfer_call'){try{const msg=JSON.parse(args.msg);if(msg.action==='pledge')leg=Number(msg.leg_id);}catch{}}
    const base={tx:tx.hash as string,signer:tx.signer_id as string,receiver:tx.receiver_id as string,method:call?.method_name??'(transfer)',args,leg};
    for(const receipt of item.receipts as any[]){
      const outcome=receipt.execution_outcome;
      if(outcome.outcome.executor_id!==ESCROW)continue;
      for(const log of outcome.outcome.logs as string[]){
        if(!log.startsWith('EVENT_JSON:'))continue;
        let parsed:any;try{parsed=JSON.parse(log.slice(11));}catch{continue;}
        if(parsed.standard!=='alltogether')continue;
        for(const data of parsed.data??[])events.push({...base,at:String(outcome.block_timestamp),block:outcome.block_height,event:parsed.event,data});
      }
    }
  }
  return events.sort((a,b)=>a.block-b.block||(BigInt(a.at)<BigInt(b.at)?-1:BigInt(a.at)>BigInt(b.at)?1:0));
}

async function mapLimit<T,R>(items:T[],limit:number,fn:(item:T)=>Promise<R>):Promise<R[]>{
  const out:R[]=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;out[i]=await fn(items[i]);}}));
  return out;
}

export async function readLive(fetcher:Fetch=fetch):Promise<LiveState>{
  const [status,escrowAccount,escrowKeys,tokenAccount,tokenKeys,config,accounting,tokenBalance,lastProposal,faucet]=await Promise.all([
    rpc('status',[],fetcher),
    rpc('query',{request_type:'view_account',finality:'final',account_id:ESCROW},fetcher),
    rpc('query',{request_type:'view_access_key_list',finality:'final',account_id:ESCROW},fetcher),
    rpc('query',{request_type:'view_account',finality:'final',account_id:TOKEN},fetcher),
    rpc('query',{request_type:'view_access_key_list',finality:'final',account_id:TOKEN},fetcher),
    view<any>(ESCROW,'get_config',{},fetcher),
    view<NearAccounting>(ESCROW,'get_accounting',{},fetcher),
    view<string>(TOKEN,'ft_balance_of',{account_id:ESCROW},fetcher),
    view<number>(DAO,'get_last_proposal_id',{},fetcher),
    view<NearFaucetStatus>(TOKEN,'get_faucet_status',{account_id:ESCROW},fetcher).catch(()=>null),
  ]);
  const campaigns:NearCampaign[]=[];
  for(let from=0;from<1000;from+=50){const page=await view<NearCampaign[]>(ESCROW,'list_campaigns',{from_index:String(from),limit:50},fetcher);campaigns.push(...page);if(page.length<50)break;}
  const proposals:DaoProposal[]=(await mapLimit(Array.from({length:lastProposal},(_,i)=>i),4,id=>view<any>(DAO,'get_proposal',{id},fetcher)))
    .map(p=>({id:p.id,proposer:p.proposer,description:p.description,status:p.status,kind:p.kind,votes:p.votes??{},submission_time:String(p.submission_time),...parseSponsor(p.kind)}));
  let events:ChainEvent[]=[],history_error:string|null=null;
  try{events=await readHistory(fetcher);}catch(error){history_error=error instanceof Error?error.message:String(error);}
  const plans=await mapLimit(campaigns,2,async(campaign):Promise<LivePlan>=>{
    const people=[...new Set(events.filter(e=>e.event==='funds_accepted'&&e.data.action==='pledge'&&e.data.campaign_id===campaign.id).map(e=>e.data.sender_id as string))];
    const contributors=await mapLimit(people,4,account=>view<PlanAccount>(ESCROW,'get_account_campaign',{campaign_id:campaign.id,account_id:account},fetcher));
    const beneficiary_credits=await mapLimit(campaign.terms.legs,3,leg=>view<NearCredit|null>(ESCROW,'get_credit',{credit_key:`${campaign.id}:beneficiary:${leg.beneficiary}:${leg.legId}`},fetcher));
    const sponsor_refund=await view<NearCredit|null>(ESCROW,'get_credit',{credit_key:`${campaign.id}:sponsor_refund:${DAO}:-`},fetcher);
    const proposal=proposals.find(p=>p.campaign_id===campaign.id&&p.terms_hash===campaign.terms_hash&&p.status==='Approved')??proposals.find(p=>p.campaign_id===campaign.id)??null;
    return {campaign,proposal,contributors,beneficiary_credits,sponsor_refund};
  });
  return {observed_at:new Date().toISOString(),chain_id:status.chain_id,block_time_ms:String(BigInt(status.sync_info.latest_block_time?Date.parse(status.sync_info.latest_block_time):Date.now())),
    escrow:{code_hash:escrowAccount.code_hash,keys:escrowKeys.keys,config,token_balance:tokenBalance,accounting},
    token:{code_hash:tokenAccount.code_hash,keys:tokenKeys.keys,faucet},
    plans,proposals,events,history_source:history_error?'unavailable':'fastnear-tx-api',history_error};
}

// ---------- Derived views ----------
export const usd=(value:bigint|string)=>`${formatAmount(value.toString()).replace(/\B(?=(\d{3})+(?!\d))/g,',')} testUSD`;
const sum=(values:(bigint|string)[])=>values.reduce<bigint>((a,b)=>a+BigInt(b),0n);
export const reserveOf=(c:NearCampaign)=>sum(c.terms.legs.map(l=>l.sponsorAllocation));
export const targetOf=(c:NearCampaign)=>sum(c.terms.legs.map(l=>l.communityTarget));
export const liabilities=(a:NearAccounting)=>sum([a.active_principal,a.sponsor_reserved,a.failed_principal_reserved,a.available_credits,a.pending_transfers]);
export const timeOf=(ns:string)=>new Date(Number(BigInt(ns)/1_000_000n));

export interface Contribution {campaign_id:string;title:string;state:NearCampaign['state'];leg:number;leg_title:string;amount:string;tx:string;at:string;}
export interface ContributorRecord {
  account_id:string;backed:number;succeeded:number;failed:number;open:number;
  pledged:string;paid_to_beneficiaries:string;refunded:string;refund_waiting:string;
  /** Plans this account published as organizer, and how many of them completed. */
  organized:number;organized_completed:number;
  /** Reputation: completed plans backed + 2 per completed plan organized. */
  score:number;tier:Tier;
  contributions:Contribution[];
}
export type Tier='new'|'backer'|'trusted';
export const TIERS:Record<Tier,{label:string;rule:string;unlocks:string}>={
  new:{label:'New',rule:'No completed plan yet',unlocks:'Pledge to any open plan'},
  backer:{label:'Backer',rule:'Backed or organized a plan that completed',unlocks:'Start a plan and file its DAO match proposal from this page'},
  trusted:{label:'Trusted organizer',rule:'Reputation 3 or more: each completed plan backed counts 1, each completed plan organized counts 2',unlocks:'Everything above; plans you start are marked as coming from a trusted organizer for the DAO council'},
};
export const tierOf=(score:number):Tier=>score>=3?'trusted':score>=1?'backer':'new';
/** A named account's record across every plan, rebuilt from pledge events and live positions. */
export function contributorRecords(state:LiveState):ContributorRecord[]{
  const byAccount=new Map<string,ContributorRecord>();
  const blank=(id:string):ContributorRecord=>({account_id:id,backed:0,succeeded:0,failed:0,open:0,pledged:'0',paid_to_beneficiaries:'0',refunded:'0',refund_waiting:'0',organized:0,organized_completed:0,score:0,tier:'new',contributions:[]});
  for(const p of state.plans){const id=p.campaign.terms.organizer;const r=byAccount.get(id)??blank(id);r.organized++;if(p.campaign.state==='Succeeded')r.organized_completed++;byAccount.set(id,r);}
  for(const e of state.events){
    if(e.event!=='funds_accepted'||e.data.action!=='pledge')continue;
    const plan=state.plans.find(p=>p.campaign.id===e.data.campaign_id);if(!plan)continue;
    const id=e.data.sender_id as string;
    const r=byAccount.get(id)??blank(id);
    const leg=e.leg??0;
    r.contributions.push({campaign_id:plan.campaign.id,title:plan.campaign.terms.title,state:plan.campaign.state,leg,leg_title:plan.campaign.terms.legs[leg]?.title??`Budget ${leg+1}`,amount:String(e.data.amount),tx:e.tx,at:e.at});
    byAccount.set(id,r);
  }
  for(const r of byAccount.values()){
    const plans=[...new Set(r.contributions.map(c=>c.campaign_id))];
    r.backed=plans.length;
    let pledged=0n,paid=0n,refunded=0n,waiting=0n;
    for(const id of plans){
      const plan=state.plans.find(p=>p.campaign.id===id)!;const c=plan.campaign;
      const mine=plan.contributors.find(x=>x.account_id===r.account_id);
      const accepted=sum((mine?.positions??[]).map(p=>p.accepted_total));
      const withdrawn=sum((mine?.credits??[]).filter(x=>x.kind==='withdrawal').map(x=>BigInt(x.paid)+BigInt(x.available)+BigInt(x.pending)));
      const kept=accepted-withdrawn;pledged+=kept;
      if(c.state==='Succeeded'){r.succeeded++;paid+=kept;}
      else if(c.state==='Failed'){
        r.failed++;
        const refund=(mine?.credits??[]).find(x=>x.kind==='refund');
        refunded+=refund?BigInt(refund.paid):0n;
        waiting+=refund?BigInt(refund.available)+BigInt(refund.pending):sum((mine?.positions??[]).filter(p=>!p.refund_consumed).map(p=>p.active));
      }else r.open++;
    }
    r.pledged=pledged.toString();r.paid_to_beneficiaries=paid.toString();r.refunded=refunded.toString();r.refund_waiting=waiting.toString();
    r.contributions.sort((a,b)=>BigInt(b.at)>BigInt(a.at)?1:-1);
    r.score=r.succeeded+2*r.organized_completed;r.tier=tierOf(r.score);
  }
  return [...byAccount.values()].sort((a,b)=>b.score-a.score||b.backed-a.backed||a.account_id.localeCompare(b.account_id));
}

/** CSV of one plan: every pledge, refund and payout with its transaction. */
export function planCsv(state:LiveState,campaignId:string):string{
  const plan=state.plans.find(p=>p.campaign.id===campaignId);if(!plan)throw new Error('Unknown plan.');
  const rows=[['time_utc','event','account','budget','amount_testUSD','transaction']];
  const legTitle=(i:number|null|undefined)=>i===null||i===undefined?'':plan.campaign.terms.legs[i]?.title??'';
  for(const e of state.events){
    const id=e.data.campaign_id??(typeof e.data.credit_id==='string'?e.data.credit_id.split(':')[0]:null);
    if(id!==campaignId)continue;
    const t=timeOf(e.at).toISOString().replace('T',' ').slice(0,19);
    const credit=typeof e.data.credit_id==='string'?e.data.credit_id.split(':'):[];
    if(e.event==='funds_accepted')rows.push([t,e.data.action==='sponsor'?'dao_match':'pledge',e.data.sender_id,e.data.action==='sponsor'?'all':legTitle(e.leg),formatAmount(String(e.data.amount)),e.tx]);
    else if(e.event==='pledge_removed')rows.push([t,'pledge_withdrawn',e.signer,legTitle(e.data.leg_id),formatAmount(String(e.data.amount)),e.tx]);
    else if(e.event==='campaign_finalized')rows.push([t,`finalized_${String(e.data.state).toLowerCase()}`,e.signer,'','',e.tx]);
    else if(e.event==='refund_materialized')rows.push([t,'refund_opened',e.signer,'',formatAmount(String(e.data.amount)),e.tx]);
    else if(e.event==='transfer_resolved')rows.push([t,e.data.success?`paid_${credit[1]}`:`payout_failed_${credit[1]}`,credit[2]??'',credit[3]&&credit[3]!=='-'?legTitle(Number(credit[3])):'',formatAmount(String(e.data.amount)),e.tx]);
  }
  return rows.map(r=>r.map(v=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v).join(',')).join('\n')+'\n';
}

// ---------- Checks ----------
export type CheckStatus='PASS'|'FAIL'|'INFO';
export interface Check {id:string;title:string;status:CheckStatus;detail:string;txs:string[];}
export interface CheckInputs {escrowWasm:Uint8Array|null;tokenWasm:Uint8Array|null;wasm_source:string;now_ms?:number;}

export async function runChecks(state:LiveState,input:CheckInputs):Promise<Check[]>{
  const checks:Check[]=[];
  const add=(id:string,title:string,ok:boolean|'info',detail:string,txs:string[]=[])=>checks.push({id,title,status:ok==='info'?'INFO':ok?'PASS':'FAIL',detail,txs:[...new Set(txs)]});
  const {escrow,token,plans,events}=state,haveHistory=state.history_source!=='unavailable';
  const created=events.filter(e=>e.event==='campaign_created');
  const now=BigInt(input.now_ms??Date.now());

  add('network','The RPC is NEAR testnet',state.chain_id==='testnet',`chain_id = "${state.chain_id}"`);
  add('keyless-escrow','The escrow account has no access keys',escrow.keys.length===0,`view_access_key_list(${ESCROW}) returned ${escrow.keys.length} keys. Nobody can redeploy its code or move its tokens outside its rules.`);
  add('keyless-token','The testUSD token account has no access keys',token.keys.length===0,`view_access_key_list(${TOKEN}) returned ${token.keys.length} keys.`);
  for(const [id,label,wasm,expected,actual] of [['code-escrow','escrow',input.escrowWasm,EXPECTED_ESCROW_HASH,escrow.code_hash],['code-token','token',input.tokenWasm,EXPECTED_TOKEN_HASH,token.code_hash]] as const){
    const local=wasm?await codeHashOf(wasm):null;
    add(id,`Deployed ${label} code = the committed release WASM`,local!==null&&local===actual&&actual===expected,
      local?`sha256(${label} WASM from ${input.wasm_source}) = ${local}; on-chain code_hash = ${actual}.`:`Could not load the committed ${label} WASM; on-chain code_hash = ${actual}.`);
  }
  add('binding','The escrow only accepts testUSD and only this DAO can sponsor',escrow.config.dao_id===DAO&&escrow.config.token_id===TOKEN&&escrow.config.network==='testnet',
    `get_config: dao_id = ${escrow.config.dao_id}, token_id = ${escrow.config.token_id}. ft_on_transfer rejects any other token, and a "sponsor" transfer from anyone but the DAO is returned.`);

  // Books
  const a=escrow.accounting,owed=BigInt(a.accepted_inflows)-BigInt(a.confirmed_paid);
  add('books','Every testUSD the escrow accepted is accounted for',owed===liabilities(a),
    `accepted ${usd(a.accepted_inflows)} − paid out ${usd(a.confirmed_paid)} = ${usd(owed)} = active pledges ${usd(a.active_principal)} + DAO reserve ${usd(a.sponsor_reserved)} + failed-plan refunds ${usd(a.failed_principal_reserved)} + claimable ${usd(a.available_credits)} + in flight ${usd(a.pending_transfers)}.`);
  add('custody','The escrow holds exactly what it owes',BigInt(escrow.token_balance)===owed,`ft_balance_of(${ESCROW}) = ${usd(escrow.token_balance)}; liabilities on the books = ${usd(owed)}.`);
  const fields=['accepted_inflows','active_principal','sponsor_reserved','failed_principal_reserved','available_credits','pending_transfers','confirmed_paid'] as const;
  const perPlan=fields.every(f=>sum(plans.map(p=>p.campaign.accounting[f]))===BigInt(a[f]));
  add('plans-sum','The per-plan books add up to the global books',perPlan,`${plans.length} plans; each of the 7 accounting fields summed across plans equals get_accounting().`);
  if(haveHistory){
    const inflow=sum(events.filter(e=>e.event==='funds_accepted').map(e=>String(e.data.amount)));
    add('inflows','Money in matches the transfers on chain',inflow===BigInt(a.accepted_inflows),
      `${events.filter(e=>e.event==='funds_accepted').length} funds_accepted events add up to ${usd(inflow)}; accepted_inflows = ${usd(a.accepted_inflows)}.`,events.filter(e=>e.event==='funds_accepted').slice(-3).map(e=>e.tx));
    const paidEvents=events.filter(e=>e.event==='transfer_resolved'&&e.data.success);
    const paid=sum(paidEvents.map(e=>String(e.data.amount)));
    add('payouts','Payouts on the books = payouts on chain',paid===BigInt(a.confirmed_paid),`${paidEvents.length} successful transfer_resolved events total ${usd(paid)}; confirmed_paid = ${usd(a.confirmed_paid)}.`,paidEvents.slice(-3).map(e=>e.tx));
  }else add('history','Transaction history',false,`The transaction API was unavailable: ${state.history_error}`);

  // Terms
  const hashes=await Promise.all(plans.map(p=>hashTerms(p.campaign.terms as any)));
  const mismatched=plans.filter((p,i)=>hashes[i]!==p.campaign.terms_hash).map(p=>p.campaign.id);
  add('terms','Every plan\'s terms hash recomputes from its terms',mismatched.length===0,
    mismatched.length?`Plans ${mismatched.join(', ')} do not match.`:`SHA-256 of the canonical terms (budgets, beneficiaries, deadline, DAO, token) recomputed here for all ${plans.length} plans. The DAO votes on this hash, and pledges must quote it.`,created.slice(-2).map(e=>e.tx));

  // DAO
  const opened=plans.filter(p=>p.campaign.state!=='AwaitingFunding'&&!(p.campaign.state==='Failed'&&p.campaign.failure_reason==='SPONSOR_NOT_FUNDED'));
  const badDao=opened.filter(p=>{
    const sponsorEvent=events.find(e=>e.event==='funds_accepted'&&e.data.action==='sponsor'&&e.data.campaign_id===p.campaign.id);
    return !(p.proposal&&p.proposal.status==='Approved'&&p.proposal.terms_hash===p.campaign.terms_hash&&p.proposal.amount===reserveOf(p.campaign).toString()&&(!haveHistory||(sponsorEvent&&sponsorEvent.data.sender_id===DAO&&sponsorEvent.receiver===DAO)));
  });
  add('dao','Each plan opened only after its DAO proposal passed',opened.length>0&&badDao.length===0,
    badDao.length?`Plans ${badDao.map(p=>p.campaign.id).join(', ')} lack an approved, matching proposal.`:
    opened.map(p=>`plan ${p.campaign.id}: proposal #${p.proposal!.id} Approved by ${Object.keys(p.proposal!.votes).join(', ')}, sent exactly ${usd(reserveOf(p.campaign))} bound to its terms hash`).join('; ')+'.',
    events.filter(e=>e.event==='funds_accepted'&&e.data.action==='sponsor').map(e=>e.tx));

  // Outcomes
  const succeeded=plans.filter(p=>p.campaign.state==='Succeeded'),failed=plans.filter(p=>p.campaign.state==='Failed');
  const okSuccess=succeeded.every(p=>p.campaign.terms.legs.every((l,i)=>p.campaign.closing_active?.[i]===l.communityTarget&&p.beneficiary_credits[i]&&BigInt(p.beneficiary_credits[i]!.paid)+BigInt(p.beneficiary_credits[i]!.available)+BigInt(p.beneficiary_credits[i]!.pending)===BigInt(l.budget)));
  add('success','A plan pays out only when every budget is full',succeeded.length>0&&okSuccess,
    succeeded.map(p=>`plan ${p.campaign.id}: all ${p.campaign.terms.legs.length} budgets reached their targets; ${p.campaign.terms.legs.map((l,i)=>`${l.beneficiary} owed ${usd(l.budget)}, paid ${usd(p.beneficiary_credits[i]?.paid??'0')}`).join('; ')}`).join('. ')+'.',
    events.filter(e=>e.event==='campaign_finalized'&&e.data.state==='Succeeded').map(e=>e.tx));
  const okFail=failed.every(p=>p.beneficiary_credits.every(c=>c===null)&&(p.campaign.failure_reason==='SPONSOR_NOT_FUNDED'||(p.sponsor_refund&&BigInt(p.sponsor_refund.paid)+BigInt(p.sponsor_refund.available)+BigInt(p.sponsor_refund.pending)===reserveOf(p.campaign)))
    &&p.contributors.every(x=>{const kept=sum(x.positions.map(q=>q.accepted_total))-sum(x.credits.filter(c=>c.kind==='withdrawal').map(c=>BigInt(c.paid)+BigInt(c.available)+BigInt(c.pending)));const refund=x.credits.find(c=>c.kind==='refund');const back=refund?BigInt(refund.paid)+BigInt(refund.available)+BigInt(refund.pending):0n;return back+sum(x.positions.filter(q=>!q.refund_consumed).map(q=>q.active))===kept;}));
  add('failure','A plan that misses any budget pays no beneficiary and refunds everyone',failed.length>0&&okFail,
    failed.map(p=>`plan ${p.campaign.id} (${p.campaign.failure_reason}): no beneficiary credit; DAO reserve ${usd(reserveOf(p.campaign))} returned (${usd(p.sponsor_refund?.paid??'0')} paid); ${p.contributors.map(x=>{const r=x.credits.find(c=>c.kind==='refund');return `${x.account_id} refund ${usd(r?.paid??'0')} paid${r&&BigInt(r.available)>0n?`, ${usd(r.available)} claimable`:''}`;}).join('; ')}`).join('. ')+'.',
    events.filter(e=>e.event==='campaign_finalized'&&e.data.state==='Failed').map(e=>e.tx));
  if(haveHistory){
    const failedPay=events.filter(e=>e.event==='transfer_resolved'&&!e.data.success);
    const retried=failedPay.filter(f=>events.some(e=>e.event==='transfer_resolved'&&e.data.success&&e.data.credit_id===f.data.credit_id&&BigInt(e.data.nonce)>BigInt(f.data.nonce)));
    const once=retried.every(f=>events.filter(e=>e.event==='transfer_resolved'&&e.data.success&&e.data.credit_id===f.data.credit_id).length===1);
    add('retry','A failed payout restored the credit and the retry paid exactly once',retried.length>0&&once,
      retried.map(f=>`${f.data.credit_id}: attempt #${f.data.nonce} failed and was restored, a later attempt paid ${usd(f.data.amount)} once`).join('; ')||'No failed payout was observed.',
      retried.flatMap(f=>[f.tx,events.find(e=>e.event==='transfer_resolved'&&e.data.success&&e.data.credit_id===f.data.credit_id)!.tx]));
  }
  const open=plans.filter(p=>p.campaign.state==='Open'&&BigInt(p.campaign.terms.deadlineMs)>now);
  add('open','A plan is open for your pledge',open.length>0,
    open.length?open.map(p=>`plan ${p.campaign.id} "${p.campaign.terms.title}": ${usd(sum(p.campaign.active))} of ${usd(targetOf(p.campaign))} pledged, deadline ${new Date(Number(p.campaign.terms.deadlineMs)).toISOString().replace('T',' ').slice(0,16)} UTC`).join('; '):'No plan is currently open.',
    open.map(p=>created.find(e=>e.data.campaign_id===p.campaign.id)?.tx).filter((x):x is string=>Boolean(x)));
  const f=token.faucet;
  add('faucet','Anyone can claim testUSD to try it',Boolean(f?.enabled&&f.remainingAccounts>0),f?`demo_faucet gives ${usd(f.amount)} once per account; ${f.remainingAccounts} accounts left.`:'Faucet status unavailable.');
  return checks;
}
