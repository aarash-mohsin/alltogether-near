import { configuration,verifyNetwork,view,record } from './common.mjs';
const config=configuration();await verifyNetwork(config);
const campaignId=process.argv[2];
if(!/^\d+$/.test(campaignId||''))throw new Error('Usage: node scripts/near/proposal.mjs CAMPAIGN_ID');
const campaign=(await view(config.escrowId,'get_campaign',{campaign_id:campaignId})).value;
if(!campaign||campaign.state!=='AwaitingFunding')throw new Error('Campaign must exist and await sponsorship.');
const policy=(await view(config.daoId,'get_policy')).value;
if(typeof policy.proposal_bond!=='string'||!Array.isArray(policy.roles))throw new Error('Unsupported DAO policy; no proposal invented.');
const reserve=campaign.terms.legs.reduce((sum,leg)=>sum+BigInt(leg.sponsorAllocation),0n).toString();
const transferArgs={receiver_id:config.escrowId,amount:reserve,memo:`AllTogether campaign ${campaignId}`,msg:JSON.stringify({v:1,action:'sponsor',campaign_id:campaignId,terms_hash:campaign.terms_hash})};
const args={proposal:{description:`AllTogether ${campaignId}: ${campaign.terms.title}\nTerms SHA-256: ${campaign.terms_hash}\nOne deadline: ${campaign.terms.deadlineMs}\nAll earmarked budgets must succeed.\n${campaign.terms.legs.map(l=>`${l.title}: ${l.budget} base units to ${l.beneficiary}`).join('\n')}`,
  kind:{FunctionCall:{receiver_id:config.tokenId,actions:[{method_name:'ft_transfer_call',args:Buffer.from(JSON.stringify(transferArgs)).toString('base64'),deposit:'1',gas:'100000000000000'}]}}}};
const payload={receiver_id:config.daoId,method_name:'add_proposal',args,attached_deposit:policy.proposal_bond,gas:'200000000000000',status:'prepared_not_submitted',campaignId,termsHash:campaign.terms_hash,reserve};
const path=record(`proposal-${campaignId}.json`,payload);console.log(`Prepared exact Sputnik FunctionCall proposal, not submitted: ${path}`);
