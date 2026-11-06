import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { configuration,verifyNetwork,signer,view,state,record,receipt,root } from './common.mjs';
const config=configuration();await verifyNetwork(config);
const target=process.argv[2];
if(!['escrow','token'].includes(target))throw new Error('Usage: node scripts/near/deploy.mjs escrow|token. Dedicated target account must already exist.');
const account=await signer(process.env.NEAR_DEPLOY_KEY_FILE,config);
const expected=target==='escrow'?config.escrowId:config.tokenId;
if(account.accountId!==expected)throw new Error('Dedicated signer must own the configured deployment target.');
const artifact=resolve(root,process.env.NEAR_WASM_FILE||(target==='escrow'?'contract/target/near/alltogether_escrow.wasm':'contract/target/near/alltogether_test_usd/alltogether_test_usd.wasm'));
const bytes=readFileSync(artifact);if(bytes.length<8||bytes[0]!==0||bytes[1]!==97)throw new Error('Expected a real compiled WebAssembly artifact.');
const previous=await state(expected,config);
if(previous.code_hash!=='11111111111111111111111111111111'&&process.env.ALLOW_TESTNET_REDEPLOY!=='yes')throw new Error('Target already has code. Set ALLOW_TESTNET_REDEPLOY=yes only for intentional testnet replacement.');
const args=target==='escrow'?{config:{dao_id:config.daoId,token_id:config.tokenId,token_decimals:6,token_symbol:'testUSD'}}:
  {owner_id:process.env.NEAR_TOKEN_OWNER_ID,total_supply:'1000000000000'};
if(target==='token'&&!args.owner_id?.endsWith('.testnet'))throw new Error('Set NEAR_TOKEN_OWNER_ID to the dedicated token supply recipient before deployment.');
const {actions}=await import('near-api-js');
// Deployment and initialization execute in one action batch, so a fresh account
// never exposes deployed-but-uninitialized contract code between transactions.
const deployedAndInitialized=await account.signAndSendTransaction({receiverId:expected,actions:[
  actions.deployContract(bytes),
  actions.functionCall('new',args,100000000000000n,0n),
],waitUntil:'FINAL'});
const [after,verified]=await Promise.all([state(expected,config),view(expected,target==='escrow'?'get_config':'ft_metadata',{},config)]);
const path=record(`deployment-${target}.json`,{accountId:expected,artifact,artifactSha256:createHash('sha256').update(bytes).digest('hex'),codeHash:after.code_hash,
  deploymentBatch:{sameTransaction:true,actionOrder:['DeployContract','FunctionCall:new']},
  deploy:receipt(deployedAndInitialized),initialize:receipt(deployedAndInitialized),verified,
  upgradeAuthority:'Dedicated deployment full-access key retained for testnet development; not immutable.'});
console.log(`Deployed and initialized ${target} on testnet. Public evidence: ${path}`);
