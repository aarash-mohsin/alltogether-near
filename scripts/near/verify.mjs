import { configuration,verifyNetwork,view,state,record } from './common.mjs';
const config=configuration();await verifyNetwork(config);
const id=process.argv[2];if(!/^\d+$/.test(id||''))throw new Error('Usage: node scripts/near/verify.mjs CAMPAIGN_ID');
const campaign=(await view(config.escrowId,'get_campaign',{campaign_id:id})).value;if(!campaign)throw new Error('Unknown campaign.');
const a=campaign.accounting;
const outstanding=['active_principal','sponsor_reserved','failed_principal_reserved','available_credits','pending_transfers'].reduce((sum,k)=>sum+BigInt(a[k]),0n);
if(BigInt(a.accepted_inflows)-BigInt(a.confirmed_paid)!==outstanding)throw new Error('Campaign books do not reconcile.');
const [custody,global,code]=await Promise.all([view(config.tokenId,'ft_balance_of',{account_id:config.escrowId}),view(config.escrowId,'get_accounting',{campaign_id:null}),state(config.escrowId)]);
const g=global.value;const globalLiabilities=['active_principal','sponsor_reserved','failed_principal_reserved','available_credits','pending_transfers'].reduce((sum,k)=>sum+BigInt(g[k]),0n);
if(BigInt(g.accepted_inflows)-BigInt(g.confirmed_paid)!==globalLiabilities)throw new Error('Global books do not reconcile.');
const report={campaign,global,custody,codeHash:code.code_hash,bookReconciled:true,quiescentBalanceMatched:BigInt(g.pending_transfers)===0n?BigInt(custody.value)===globalLiabilities:null,
  note:'An in-flight token transfer can precede its escrow callback. Book liabilities and token custody are distinct observations. Direct unaccounted token transfers can create surplus.'};
const path=record(`verification-${id}.json`,report);console.log(`Campaign and global books reconcile; actual token custody observed. Evidence: ${path}`);
