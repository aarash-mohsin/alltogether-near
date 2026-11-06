import {createRpcTransport} from '../../shared/rpc.ts';
import {prepareNearTransaction,type NearCommand,type NearSnapshot,type NearTransactionRequest} from '../../shared/near.ts';
import {canonical,type StorageLike} from './operations.ts';
export type NearPhase='AwaitingWallet'|'Unknown'|'Pending'|'Succeeded'|'Failed'|'Returned'|'Cancelled';
export interface NearOperation {id:string;accountId:string;escrowId:string;command:NearCommand;request:NearTransactionRequest;createdAt:number;reviewedAtBlock:string;hash:string|null;phase:NearPhase;message:string;receiptIds:string[];usedAmount?:string;}
export interface NearWallet {signAndSendTransaction(request:NearTransactionRequest&{network:'testnet'}):Promise<unknown>;}
export type TransactionReader=(hash:string,signer:string)=>Promise<any>;
const storeKey='alltogether.testnet.operations.v1';
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
export function transactionHash(value:any):string|null {for(const candidate of [value?.transaction?.hash,value?.transactionHash,value?.transaction_hash,value?.transaction_outcome?.id])if(typeof candidate==='string'&&HASH.test(candidate))return candidate;return null;}
function cancelled(error:unknown):boolean {const e=error as {code?:unknown;message?:unknown};return e?.code===4001||e?.code==='USER_REJECTED_REQUEST'||/user (rejected|cancelled|canceled)|request rejected by user/i.test(String(e?.message??''));}
function decodeBase64(value:string):string{return new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0)));}
export async function readFinalTransaction(hash:string,signer:string):Promise<any>{if(!HASH.test(hash))throw new Error('Enter the transaction hash supplied by your wallet.');const rpc=createRpcTransport();const status=await rpc('status',[]);if(status.chain_id!=='testnet')throw new Error('Transaction provider did not identify itself as testnet.');const result=await rpc('tx',{tx_hash:hash,sender_account_id:signer,wait_until:'FINAL'});if(result.final_execution_status==='FINAL'){const blockHash=result.transaction_outcome?.block_hash;if(typeof blockHash!=='string')throw new Error('The transaction execution block is missing.');const block=await rpc('block',{block_id:blockHash});if(String(block.header?.hash)!==blockHash||!Number.isSafeInteger(block.header?.height))throw new Error('The transaction execution block could not be verified.');const timestamp=block.header.timestamp_nanosec;if(typeof timestamp!=='string'||!/^(0|[1-9][0-9]*)$/.test(timestamp))throw new Error('The transaction execution timestamp could not be verified.');result.verifiedExecutionBlockHeight=String(block.header.height);result.verifiedExecutionTimestampNs=timestamp;}return result;}
export function classifyOutcome(operation:NearOperation,outcome:any):Pick<NearOperation,'phase'|'message'|'receiptIds'|'usedAmount'>{
  if(outcome?.final_execution_status!=='FINAL')return {phase:'Pending',message:'The transaction has not reached final receipt execution.',receiptIds:[]};
  if(!/^(0|[1-9][0-9]*)$/.test(outcome.verifiedExecutionBlockHeight??'')||BigInt(outcome.verifiedExecutionBlockHeight)<=BigInt(operation.reviewedAtBlock))throw new Error('The transaction was not executed after this operation was reviewed. An older matching transaction cannot resolve a new request.');
  if(!Number.isSafeInteger(operation.createdAt)||operation.createdAt<0||typeof outcome.verifiedExecutionTimestampNs!=='string'||!/^(0|[1-9][0-9]*)$/.test(outcome.verifiedExecutionTimestampNs)||BigInt(outcome.verifiedExecutionTimestampNs)<BigInt(operation.createdAt)*1000000n)throw new Error('The verified execution timestamp predates this wallet intent or cannot be verified. Keep it unknown; check the local clock and inspect the actual receipt. No older receipt can confirm this request.');
  const tx=outcome.transaction,expected=operation.request,action=tx?.actions?.[0]?.FunctionCall,request=expected.actions[0].params;
  if(tx?.hash!==operation.hash||tx?.signer_id!==expected.signerId||tx?.receiver_id!==expected.receiverId||tx?.actions?.length!==1||!action||action.method_name!==request.methodName||String(action.deposit)!==request.deposit||String(action.gas)!==request.gas)throw new Error('The finalized transaction does not match the reviewed signer, receiver, method, deposit or gas. No success was inferred.');
  let args:unknown;try{args=JSON.parse(decodeBase64(action.args));}catch{throw new Error('The finalized transaction arguments cannot be verified.');}
  if(canonical(args)!==canonical(request.args))throw new Error('The finalized transaction arguments differ from the reviewed operation.');
  const receipts=Array.isArray(outcome.receipts_outcome)?outcome.receipts_outcome:[],receiptIds=receipts.map((r:any)=>r.id).filter((id:unknown)=>typeof id==='string');
  if(outcome.status?.Failure){
    if(operation.command.type==='pledge'){
      const firstId=outcome.transaction_outcome?.outcome?.status?.SuccessReceiptId;
      const first=receipts.find((r:any)=>r.id===firstId);
      if(!outcome.transaction_outcome?.outcome?.status?.Failure&&!(first?.outcome?.executor_id===expected.receiverId&&first.outcome.status?.Failure))return {phase:'Unknown',message:'A final token promise failed after dispatch. Principal may already have been accepted; inspect the receipt chain and current position before any new pledge.',receiptIds};
    }
    return {phase:'Failed',message:'The finalized transaction failed. Inspect the refreshed fixed credits before making a new attempt.',receiptIds};
  }
  if(operation.command.type==='pledge'){
    let used:unknown;try{used=JSON.parse(decodeBase64(outcome.status?.SuccessValue));}catch{return {phase:'Unknown',message:'The token resolver result could not be verified. Do not send the pledge again.',receiptIds};}
    if(used==='0')return {phase:'Returned',message:'The token resolver returned the full pledge. No community principal was accepted by this transaction.',receiptIds,usedAmount:'0'};
    if(used!==operation.command.amount)return {phase:'Unknown',message:'The resolver reported an unexpected accepted amount. Inspect the transaction and live state before taking further action.',receiptIds,usedAmount:typeof used==='string'?used:undefined};
    if(receipts.some((r:any)=>r.outcome?.status?.Failure))return {phase:'Unknown',message:'Some receipts failed despite a nonzero resolver result. Inspect this transaction; do not blindly resend.',receiptIds,usedAmount:used};
    return {phase:'Succeeded',message:'Final token resolver confirms the exact reviewed pledge amount was accepted.',receiptIds,usedAmount:used};
  }
  if(receipts.some((r:any)=>r.outcome?.status?.Failure))return {phase:'Failed',message:'A downstream receipt failed. Any restored credit remains payable only to its fixed recipient; inspect live state before retrying.',receiptIds};
  if(!outcome.status||!('SuccessValue'in outcome.status))return {phase:'Pending',message:'Final receipt status remains unresolved.',receiptIds};
  return {phase:'Succeeded',message:'The reviewed transaction and its receipts finalized successfully. The refreshed contract view shows the current state.',receiptIds};
}
export class NearTransactionController {
  private memory:NearOperation[]=[];private submitting=false;
  private storage?:StorageLike;private reader:TransactionReader;
  constructor(storage?:StorageLike,reader:TransactionReader=readFinalTransaction){this.storage=storage;this.reader=reader;}
  list(accountId?:string,escrowId?:string):NearOperation[]{const raw=this.storage?.getItem(storeKey);const items=raw?JSON.parse(raw):this.memory;if(!Array.isArray(items)||items.length>100||!items.every(x=>x&&typeof x.id==='string'&&typeof x.accountId==='string'&&typeof x.escrowId==='string'&&x.request?.signerId===x.accountId))throw new Error('The saved transaction journal needs inspection before signing.');return items.filter(x=>(!accountId||x.accountId===accountId)&&(!escrowId||x.escrowId===escrowId));}
  private save(operation:NearOperation){let items=this.list().filter(x=>x.id!==operation.id);items.push(operation);if(items.length>100){const removable=items.findIndex(x=>['Succeeded','Failed','Returned','Cancelled'].includes(x.phase));if(removable<0)throw new Error('Resolve earlier unknown transactions before signing more.');items.splice(removable,1);}if(this.storage)this.storage.setItem(storeKey,JSON.stringify(items));this.memory=items;if(typeof window!=='undefined')window.dispatchEvent(new Event('alltogether:near-operations'));return operation;}
  private checkHash(id:string,hash:string){if(this.list().some(x=>x.id!==id&&x.hash===hash))throw new Error('This transaction hash already belongs to another saved wallet operation. The newer request remains unconfirmed.');}
  async submit(snapshot:NearSnapshot,accountId:string,command:NearCommand,wallet:NearWallet):Promise<NearOperation>{
    if(this.submitting)throw new Error('A wallet request is already in progress.');
    const unresolved=this.list(accountId,snapshot.binding.escrowId).find(x=>!['Succeeded','Failed','Returned','Cancelled'].includes(x.phase));if(unresolved)throw new Error('Resolve the earlier wallet operation before creating another. A timeout does not authorize resubmission.');
    const request=prepareNearTransaction(snapshot,accountId,command);let operation:NearOperation={id:crypto.randomUUID(),accountId,escrowId:snapshot.binding.escrowId,command,request,createdAt:Date.now(),reviewedAtBlock:snapshot.source.blockHeight,hash:null,phase:'AwaitingWallet',message:'Awaiting wallet approval. No execution has been confirmed.',receiptIds:[]};
    this.save(operation);this.submitting=true;
    try{const result=await wallet.signAndSendTransaction({...request,network:'testnet'});const hash=transactionHash(result);if(hash)this.checkHash(operation.id,hash);operation={...operation,hash,phase:'Pending',message:'Wallet returned. Verifying the actual finalized transaction before reporting success.'};this.save(operation);if(operation.hash)return await this.reconcile(operation.id);return this.save({...operation,phase:'Unknown',message:'The wallet returned no verifiable hash. Check wallet history and attach the matching transaction hash; do not sign again.'});}
    catch(error){const current=this.list().find(x=>x.id===operation.id)??operation;return this.save({...current,phase:cancelled(error)?'Cancelled':'Unknown',message:cancelled(error)?'The wallet explicitly rejected the request. No success is claimed.':'The wallet or network outcome is unknown. Check wallet history; do not sign another copy. '+String((error as Error)?.message??error)});}
    finally{this.submitting=false;}
  }
  async reconcile(id:string,hash?:string):Promise<NearOperation>{let operation=this.list().find(x=>x.id===id);if(!operation)throw new Error('Unknown wallet operation.');if(operation.phase==='Cancelled')throw new Error('A cancelled wallet operation cannot be confirmed with another transaction.');if(hash){if(operation.hash&&hash!==operation.hash&&['Succeeded','Failed','Returned'].includes(operation.phase))throw new Error('A finalized operation cannot be assigned a different transaction hash.');if(!HASH.test(hash))throw new Error('Enter a valid wallet transaction hash.');this.checkHash(operation.id,hash);operation={...operation,hash};this.save(operation);}if(!operation.hash)throw new Error('Attach the actual transaction hash from the wallet before checking. No transaction will be signed by this action.');try{this.checkHash(operation.id,operation.hash);const outcome=await this.reader(operation.hash,operation.accountId);return this.save({...operation,...classifyOutcome(operation,outcome)});}catch(error){return this.save({...operation,phase:'Unknown',message:String((error as Error)?.message??error)+' No transaction was resubmitted.'});}}
}
