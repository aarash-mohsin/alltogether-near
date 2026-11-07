// Finish plan 3 (published and fully pledged from Meteor Wallet by araash.testnet): anyone may finalize after its
// deadline and trigger each beneficiary payout. Signed here by the test accounts alice (finalize) and bob (payouts).
// node scripts/testnet-finish-plan3.mjs finalize|pay    Evidence: docs/testnet-plan3-finish.json
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {Account,JsonRpcProvider,KeyPairSigner,actions} from 'near-api-js';
const RPC='https://test.rpc.fastnear.com',ESCROW='escrow.at-rel-owner-mw4f9xmq.testnet',path='docs/testnet-plan3-finish.json';
const provider=new JsonRpcProvider({url:RPC});
const evidence=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{network:'testnet',campaignId:'3',actions:[]};
const save=()=>writeFileSync(path,JSON.stringify(evidence,null,2)+'\n');
const account=slot=>{const c=JSON.parse(readFileSync(`.secrets/${slot}.json`,'utf8'));return new Account(c.accountId,provider,KeyPairSigner.fromSecretKey(c.privateKey));};
async function view(method,args){const r=await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'query',params:{request_type:'call_function',finality:'final',account_id:ESCROW,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')}})}).then(r=>r.json());return JSON.parse(Buffer.from(r.result.result).toString());}
async function call(label,who,method,args,deposit=0n,gas=100_000_000_000_000n){
  const out=await who.signAndSendTransaction({receiverId:ESCROW,actions:[actions.functionCall(method,Buffer.from(JSON.stringify(args)),gas,deposit)],waitUntil:'FINAL',throwOnFailure:false});
  const ok=!out.status?.Failure&&!(out.receipts_outcome??[]).some(r=>r.outcome?.status?.Failure);
  evidence.actions.push({label,signer:who.accountId,method,tx:out.transaction?.hash,ok,at:new Date().toISOString()});save();
  assert.ok(ok,`${label} failed ${out.transaction?.hash}`);console.log(label,out.transaction?.hash);
}
const step=process.argv[2];
let c=await view('get_campaign',{campaign_id:'3'});
if(step==='finalize'&&c.state==='Open')await call('Anyone finalizes plan 3 after its deadline',account('release-alice'),'finalize',{campaign_id:'3'});
if(step==='pay'){
  for(const leg of c.terms.legs){
    const key=`3:beneficiary:${leg.beneficiary}:${leg.legId}`;const credit=await view('get_credit',{credit_key:key});
    if(credit&&BigInt(credit.available)>0n)await call(`Pay ${leg.title} to ${leg.beneficiary}`,account('release-bob'),'claim_credit',{credit_key:key},1n,120_000_000_000_000n);
  }
}
c=await view('get_campaign',{campaign_id:'3'});console.log('plan 3',c.state,JSON.stringify(c.accounting));
