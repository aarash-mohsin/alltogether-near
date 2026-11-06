import {TESTNET_RPCS} from './rpc.ts';
import type { Accounting, CreditKind, Terms,PublishInput } from './types.ts';
import {atomic,checkedAdd,deriveLeg,isAccountId} from './amounts.ts';

/** Public contract JSON, deliberately separate from the local ledger DTOs. */
export interface NearAccounting {accepted_inflows:string;active_principal:string;sponsor_reserved:string;failed_principal_reserved:string;available_credits:string;pending_transfers:string;confirmed_paid:string;}
export interface NearCampaign {id:string;terms:Terms;terms_hash:string;state:'AwaitingFunding'|'Open'|'Succeeded'|'Failed';created_at_ms:string;finalized_at_ms:string|null;failure_reason:string|null;active:string[];closing_active:string[]|null;participant_count:number;accounting:NearAccounting;}
export interface NearAttempt {nonce:string;amount:string;status:'Pending'|'Succeeded'|'Failed';created_at_ms:string;resolved_at_ms:string|null;}
export interface NearCredit {id:string;campaign_id:string;kind:CreditKind;owner:string;recipient:string;leg_id:number|null;available:string;pending:string;paid:string;nonce:string;last_attempt:NearAttempt|null;}
export interface NearPosition {active:string;accepted_total:string;refund_consumed:boolean;}
export interface NearStorageQuote {required_yocto:string;reserved_bytes:string;participant_limit:number;record_bytes:string;key_overhead_per_record:number;}
export interface NearBinding {network:'testnet';rpc:string;escrowId:string;tokenId:string;daoId:string;expectedEscrowCodeHash:string;expectedTokenCodeHash:string;}
export interface NearFaucetStatus {enabled:boolean;amount:string;claimed:boolean;remainingAccounts:number;}
export interface NearSnapshot {
  network:'testnet';verified:true;binding:NearBinding;
  gasPriceYocto:string;
  source:{mode:'near';network:'testnet';observedAt:string;stale:false;blockHeight:string;blockHash:string;blockTimestampNs:string};
  contracts:{escrowCodeHash:string;tokenCodeHash:string;escrowAccessKeyCount:number;tokenAccessKeyCount:number;upgradeAuthority:'prototype_keys_retained'|'no_access_keys_observed'};
  config:{dao_id:string;token_id:string;token_decimals:6;token_symbol:'testUSD';participant_limit:128;max_legs:3;domain:'alltogether/near-testnet/v1';network:'testnet';[key:string]:unknown};
  tokenMetadata:{decimals:6;symbol:'testUSD';[key:string]:unknown};
  daoPolicy:{proposal_bond:string;roles:unknown[];[key:string]:unknown};
  campaigns:NearCampaign[];fromIndex:string;nextIndex:string|null;campaign:NearCampaign|null;
  campaignCredits:NearCredit[];
  account:null|{accountId:string;nativeBalance:string;nativeStorageStake:string;spendableNativeBalance:string;tokenBalance:string;tokenStorage:null|{total:string;available:string};campaign:null|{account_id:string;positions:NearPosition[];credits:NearCredit[]}};
  custody:{accounting:NearAccounting;observedTokenBalance:string;bookResidual:string;cashLiabilities:string;reconciliation:'Matched'|'InFlight'|'Mismatch'};
  storageQuotes:Record<'1'|'2'|'3',NearStorageQuote>;
  tokenStorageBounds:{min:string;max:string|null};
  faucet:NearFaucetStatus|null;
  history:{available:false;detail:string};
}
export interface NearSnapshotQuery {accountId?:string;campaignId?:string;fromIndex?:string;limit?:number;}
export function normalizeNearAccounting(a:NearAccounting):Accounting{return {acceptedInflows:a.accepted_inflows,activePrincipal:a.active_principal,sponsorReserved:a.sponsor_reserved,failedPrincipalReserved:a.failed_principal_reserved,availableCredits:a.available_credits,pendingTransfers:a.pending_transfers,confirmedPaid:a.confirmed_paid};}

export type NearCommand=
 |{type:'publish';input:PublishInput}
 |{type:'pledge';campaignId:string;legId:number;amount:string;termsHash:string}
 |{type:'remove';campaignId:string;legId:number;amount:string}
 |{type:'finalize';campaignId:string}
 |{type:'refund';campaignId:string}
 |{type:'claim';creditId:string}
 |{type:'register'}
 |{type:'demoFaucet'}
 |{type:'proposal';campaignId:string};
export interface NearTransactionRequest {signerId:string;receiverId:string;actions:[{type:'FunctionCall';params:{methodName:string;args:Record<string,unknown>;gas:string;deposit:string}}];}
function need(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function u64(value:string):bigint{const n=atomic(value);need(n<1n<<64n,'Identifier exceeds u64.');return n;}
function text(value:unknown,label:string,max:number,min=1):string{need(typeof value==='string',`${label} must be text.`);need(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value),`${label} contains invalid Unicode.`);need((min===0||value.trim().length>0)&&Array.from(value).length>=min&&Array.from(value).length<=max,`${label} must contain ${min}–${max} characters.`);return value;}
/** Pure transaction preparation. This never signs, submits, or labels a hash successful. */
export function prepareNearTransaction(snapshot:NearSnapshot,signerId:string,command:NearCommand,nowMs=Date.now()):NearTransactionRequest {
  const b=snapshot.binding;
  need(snapshot.verified===true&&snapshot.network==='testnet'&&b.network==='testnet'&&TESTNET_RPCS.includes(b.rpc),'A verified testnet observation is required.');
  need(snapshot.source.mode==='near'&&snapshot.source.network==='testnet'&&!snapshot.source.stale&&Number.isSafeInteger(nowMs)&&Math.abs(nowMs-Number(snapshot.source.observedAt))<=30_000,'Refresh live testnet state before preparing a transaction.');
  need(isAccountId(signerId)&&snapshot.account?.accountId===signerId,'Refresh the snapshot for the connected wallet account.');
  need(snapshot.contracts.escrowCodeHash===b.expectedEscrowCodeHash&&snapshot.contracts.tokenCodeHash===b.expectedTokenCodeHash,'The deployed code does not match the approved binding.');
  need(snapshot.config.dao_id===b.daoId&&snapshot.config.token_id===b.tokenId&&snapshot.config.domain==='alltogether/near-testnet/v1'&&snapshot.config.network==='testnet'&&snapshot.tokenMetadata.decimals===6&&snapshot.tokenMetadata.symbol==='testUSD','Contract or token configuration differs from the approved application.');
  need(snapshot.custody.bookResidual==='0'&&snapshot.custody.reconciliation!=='Mismatch','Live custody does not reconcile.');
  const tx=(receiverId:string,methodName:string,args:Record<string,unknown>,deposit='0',gas='200000000000000'):NearTransactionRequest=>{atomic(deposit);const estimate=((atomic(gas)+5_000_000_000_000n)*atomic(snapshot.gasPriceYocto)*3n+1n)/2n;const minimum=300_000_000_000_000_000_000_000n;const gasBuffer=estimate>minimum?estimate:minimum;need(atomic(snapshot.account!.spendableNativeBalance)>=atomic(deposit)+gasBuffer,'The wallet needs more spendable test NEAR for the deposit and conservative prepaid gas buffer (at least 0.3 NEAR). Unused prepaid gas is returned.');return {signerId,receiverId,actions:[{type:'FunctionCall',params:{methodName,args,gas,deposit}}]};};
  const selected=(id:string)=>{u64(id);const c=snapshot.campaign;need(c&&c.id===id,'Select and refresh this testnet campaign first.');need(c.terms.escrowId===b.escrowId&&c.terms.daoId===b.daoId&&c.terms.tokenId===b.tokenId&&c.terms.domain==='alltogether/near-testnet/v1','Campaign terms differ from the approved binding.');return c;};
  const beforeDeadline=(c:NearCampaign)=>need(BigInt(snapshot.source.blockTimestampNs)/1_000_000n<u64(c.terms.deadlineMs),'The onchain funding deadline has arrived.');
  if(command.type==='register'){need(snapshot.account.tokenStorage===null,'This wallet is already registered with testUSD.');return tx(b.tokenId,'storage_deposit',{account_id:signerId,registration_only:true},snapshot.tokenStorageBounds.min,'50000000000000');}
  if(command.type==='demoFaucet'){need(snapshot.faucet?.enabled&&snapshot.faucet.amount==='1000000000'&&!snapshot.faucet.claimed&&Number.isInteger(snapshot.faucet.remainingAccounts)&&snapshot.faucet.remainingAccounts>0,'The fixed demo faucet is unavailable, exhausted or already claimed by this account.');need(snapshot.account.tokenStorage!==null,'Register this wallet with testUSD before claiming the demo faucet.');return tx(b.tokenId,'demo_faucet',{},'1','100000000000000');}
  if(command.type==='publish'){
    const i=command.input;text(i.title,'Title',80);text(i.summary,'Summary',500);text(i.detail,'Description',2000,0);const deadline=u64(i.deadlineMs),chainMs=BigInt(snapshot.source.blockTimestampNs)/1_000_000n;need(deadline>chainMs&&deadline<=chainMs+365n*86400000n,'Choose a future deadline within 365 days.');need(Array.isArray(i.legs)&&i.legs.length>=1&&i.legs.length<=3,'A plan needs one to three budgets.');let total=0n;
    const legs=i.legs.map((leg,index)=>{text(leg.title,`Budget ${index+1} title`,60);text(leg.purpose,`Budget ${index+1} purpose`,240,0);need(isAccountId(leg.beneficiary)&&leg.beneficiary!==b.escrowId,`Budget ${index+1} needs a valid beneficiary other than the escrow.`);deriveLeg(leg.budget,leg.declaredSponsorCap);total=checkedAdd(total,atomic(leg.budget));return {title:leg.title,purpose:leg.purpose,beneficiary:leg.beneficiary,budget:leg.budget,declared_sponsor_cap:leg.declaredSponsorCap};});
    const quote=snapshot.storageQuotes[String(legs.length) as '1'|'2'|'3'];need(quote&&quote.participant_limit===128,'A current storage quote is required.');return tx(b.escrowId,'create_campaign',{input:{title:i.title,summary:i.summary,detail:i.detail,deadline_ms:i.deadlineMs,legs}},quote.required_yocto);
  }
  if(command.type==='claim'){const credits=[...(snapshot.account.campaign?.credits??[]),...snapshot.campaignCredits];const credit=credits.find(c=>c.id===command.creditId);need(credit&&credit.recipient===credit.owner&&atomic(credit.available)>0n&&atomic(credit.pending)===0n,'A live available credit without a pending payout is required.');if(credit.kind==='withdrawal'||credit.kind==='refund')need(credit.owner===signerId,'Only the fixed credit owner can claim this principal.');return tx(b.escrowId,'claim_credit',{credit_key:credit.id},'1','120000000000000');}
  const c=selected(command.campaignId);
  switch(command.type){
    case 'pledge':{need(c.state==='Open','Actual sponsor funding must open this campaign first.');beforeDeadline(c);need(command.termsHash===c.terms_hash,'The reviewed terms hash changed.');need(snapshot.account.tokenStorage!==null,'Register this wallet with testUSD before contributing.');need(Number.isInteger(command.legId)&&command.legId>=0&&command.legId<c.terms.legs.length,'Choose a valid earmarked budget.');const amount=atomic(command.amount);need(amount>0n&&amount<=atomic(snapshot.account.tokenBalance),'The wallet needs enough testUSD for a positive pledge.');need(amount<=atomic(c.terms.legs[command.legId].communityTarget)-atomic(c.active[command.legId]),'The pledge exceeds this budget’s remaining requirement.');return tx(b.tokenId,'ft_transfer_call',{receiver_id:b.escrowId,amount:command.amount,memo:`AllTogether campaign ${c.id}`,msg:JSON.stringify({v:1,action:'pledge',campaign_id:c.id,terms_hash:c.terms_hash,leg_id:command.legId})},'1');}
    case 'remove':{need(c.state==='Open','Only an open campaign permits pledge removal.');beforeDeadline(c);need(Number.isInteger(command.legId)&&command.legId>=0&&command.legId<c.active.length,'Choose a valid earmarked budget.');const position=snapshot.account.campaign?.positions[command.legId];need(position&&atomic(command.amount)>0n&&atomic(command.amount)<=atomic(position.active),'Removal cannot exceed this wallet’s active principal.');return tx(b.escrowId,'remove_pledge',{campaign_id:c.id,leg_id:command.legId,amount:command.amount},'0','100000000000000');}
    case 'finalize':need(c.state==='Open'||c.state==='AwaitingFunding','The campaign has already finalized.');need(BigInt(snapshot.source.blockTimestampNs)/1_000_000n>=u64(c.terms.deadlineMs),'Finalization begins at the onchain deadline.');return tx(b.escrowId,'finalize',{campaign_id:c.id},'0','100000000000000');
    case 'refund':need(c.state==='Failed','Only a failed plan unlocks contributor refunds.');need(snapshot.account.campaign?.positions.some(p=>!p.refund_consumed&&atomic(p.active)>0n),'No unmaterialized refundable principal was observed for this wallet.');return tx(b.escrowId,'materialize_refund',{campaign_id:c.id},'0','100000000000000');
    case 'proposal':{need(c.state==='AwaitingFunding','Only an unfunded plan needs its sponsorship proposal.');beforeDeadline(c);const reserve=c.terms.legs.reduce((n,l)=>checkedAdd(n,atomic(l.sponsorAllocation)),0n).toString();const inner={receiver_id:b.escrowId,amount:reserve,memo:`AllTogether campaign ${c.id}`,msg:JSON.stringify({v:1,action:'sponsor',campaign_id:c.id,terms_hash:c.terms_hash})};const encoded=new TextEncoder().encode(JSON.stringify(inner));let raw='';for(const byte of encoded)raw+=String.fromCharCode(byte);const args={proposal:{description:`AllTogether ${c.id}: ${c.terms.title}\nTerms SHA-256: ${c.terms_hash}\nOne deadline: ${c.terms.deadlineMs}\nAll earmarked budgets must succeed.\n${c.terms.legs.map(l=>`${l.title}: ${l.budget} base units to ${l.beneficiary}`).join('\n')}`,kind:{FunctionCall:{receiver_id:b.tokenId,actions:[{method_name:'ft_transfer_call',args:btoa(raw),deposit:'1',gas:'100000000000000'}]}}}};return tx(b.daoId,'add_proposal',args,snapshot.daoPolicy.proposal_bond);}
  }
}
