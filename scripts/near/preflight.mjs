import { configuration,verifyNetwork,view,state,record } from './common.mjs';
const config=configuration();
const status=await verifyNetwork(config);
const [metadata,storageBounds,policy,daoConfig,escrowConfig,escrowAccount]=await Promise.all([
  view(config.tokenId,'ft_metadata'),view(config.tokenId,'storage_balance_bounds'),view(config.daoId,'get_policy'),
  view(config.daoId,'get_config'),view(config.escrowId,'get_config'),state(config.escrowId),
]);
if(metadata.value.symbol!=='testUSD'||metadata.value.decimals!==6)throw new Error('Configured token is not six-decimal testUSD.');
if(escrowConfig.value.dao_id!==config.daoId||escrowConfig.value.token_id!==config.tokenId)throw new Error('Escrow configuration mismatch.');
if(typeof policy.value.proposal_bond!=='string'||!Array.isArray(policy.value.roles))throw new Error('Unsupported DAO policy shape. Inspect deployment before creating proposals.');
let daoVersion;
try{daoVersion=(await view(config.daoId,'get_version')).value;}catch{daoVersion='get_version unavailable; inspect code hash/version externally';}
const report={config,protocolVersion:status.protocol_version,metadata,storageBounds,policy,daoConfig,daoVersion,escrowConfig,escrowCodeHash:escrowAccount.code_hash};
const path=record('near-preflight.json',report);
console.log(`Verified testnet configuration, token metadata, storage bounds, and DAO policy. Evidence: ${path}`);
