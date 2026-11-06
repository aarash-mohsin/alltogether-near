import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let requestId = 0;
export function configuration() {
  const network = process.env.NEAR_NETWORK || 'testnet';
  if (network !== 'testnet') throw new Error('Only NEAR testnet is supported. Mainnet is disabled.');
  const config = { network, rpc: process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
    tokenId: process.env.NEAR_TOKEN_ID, daoId: process.env.NEAR_DAO_ID, escrowId: process.env.NEAR_ESCROW_ID };
  for (const key of ['tokenId', 'daoId', 'escrowId']) if (!config[key] || !config[key].endsWith('.testnet')) throw new Error(`Set a verified ${key} testnet account; sample IDs are not deployments.`);
  return config;
}
export async function rpc(method, params, config = configuration()) {
  const response = await fetch(config.rpc, { method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method,params}), signal:AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`RPC ${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}
export async function verifyNetwork(config = configuration()) {
  const status = await rpc('status',[],config);
  if (status.chain_id !== 'testnet') throw new Error('RPC is not NEAR testnet.');
  return status;
}
export async function view(accountId, methodName, args = {}, config = configuration()) {
  const result = await rpc('query',{request_type:'call_function',finality:'final',account_id:accountId,method_name:methodName,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')},config);
  return { value: JSON.parse(Buffer.from(result.result).toString('utf8')), blockHeight:result.block_height, blockHash:result.block_hash };
}
export async function state(accountId,config = configuration()) {
  return rpc('query',{request_type:'view_account',finality:'final',account_id:accountId},config);
}
export async function signer(keyFile,config = configuration()) {
  if (!keyFile) throw new Error('Set a dedicated testnet key file inside this project .secrets directory.');
  const path=resolve(root,keyFile), allowed=resolve(root,'.secrets')+sep;
  if (!path.startsWith(allowed)) throw new Error('Only project .secrets key files are accepted; user wallet stores are not read.');
  const secret=JSON.parse(readFileSync(path,'utf8'));
  const id=secret.accountId || secret.account_id;
  const key=secret.privateKey || secret.private_key;
  if (!id?.endsWith('.testnet') || !key?.startsWith('ed25519:')) throw new Error('Invalid dedicated testnet credential file.');
  const { Account, JsonRpcProvider, KeyPairSigner }=await import('near-api-js');
  return new Account(id,new JsonRpcProvider({url:config.rpc}),KeyPairSigner.fromSecretKey(key));
}
export function receipt(outcome) {
  return { transactionHash:outcome.transaction?.hash, status:outcome.status,
    transactionOutcome:outcome.transaction_outcome, receipts:outcome.receipts_outcome };
}
export function record(name,data) {
  const path=resolve(root,'docs',name);mkdirSync(dirname(path),{recursive:true});
  writeFileSync(path,JSON.stringify({recordedAt:new Date().toISOString(),network:'testnet',...data},null,2)+'\n');
  return path;
}
