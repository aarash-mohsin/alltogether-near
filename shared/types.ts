export type Amount=string;
export type Millis=string;
export type Mode='local'|'near';
export type CampaignState='AwaitingFunding'|'Open'|'Succeeded'|'Failed';
export type CreditKind='withdrawal'|'refund'|'beneficiary'|'sponsor_refund';
export type ProposalStatus='NotSubmitted'|'InProgress'|'Approved'|'Rejected'|'Expired'|'ExecutionFailed'|'Unknown';
export interface Source {mode:Mode;network:'local'|'testnet';observedAt:Millis;stale:boolean;blockHeight?:string;blockHash?:string}
export interface Evidence {kind:'local'|'near';reference:string;transactionHash?:string;receiptId?:string;explorerUrl?:string}
export interface LegInput {title:string;purpose:string;beneficiary:string;budget:Amount;declaredSponsorCap:Amount}
export interface PublishInput {title:string;summary:string;detail:string;deadlineMs:Millis;legs:LegInput[]}
export interface LegTerms extends LegInput {legId:number;sponsorAllocation:Amount;communityTarget:Amount}
export interface Terms {
 schemaVersion:1;domain:'alltogether/local/v1'|'alltogether/near-testnet/v1';
 escrowId:string;campaignId:string;organizer:string;title:string;summary:string;detail:string;
 daoId:string;tokenId:string;tokenDecimals:number;tokenSymbol:string;deadlineMs:Millis;
 participantLimit:128;matchRule:'one-to-one-capped-v1';settlementRule:'all-legs-v1';legs:LegTerms[];
}
export interface Accounting {acceptedInflows:Amount;activePrincipal:Amount;sponsorReserved:Amount;failedPrincipalReserved:Amount;availableCredits:Amount;pendingTransfers:Amount;confirmedPaid:Amount}
export interface Credit {id:string;campaignId:string;kind:CreditKind;owner:string;recipient:string;legId?:number;available:Amount;pending:Amount;paid:Amount;pendingAttemptId?:string}
export interface Attempt {id:string;campaignId:string;creditId:string;recipient:string;amount:Amount;status:'Pending'|'Succeeded'|'Failed';createdAt:Millis;resolvedAt?:Millis;errorCode?:string;evidence:Evidence;resultEvidence?:Evidence}
export interface LegFunding {legId:number;active:Amount;provisionalMatch:Amount;closingActive?:Amount}
export interface Proposal {id:string;campaignId:string;daoId:string;status:ProposalStatus;termsHash:string;observedAt:Millis;executionEvidence?:Evidence}
export interface Campaign {id:string;terms:Terms;termsHash:string;state:CampaignState;createdAt:Millis;finalizedAt?:Millis;failureReason?:'SPONSOR_NOT_FUNDED'|'INCOMPLETE_BUDGETS';legs:LegFunding[];accounting:Accounting;participantCount:number;sponsorEvidence?:Evidence;proposal?:Proposal;credits:Credit[];attempts:Attempt[];fixture:boolean}
export interface Position {campaignId:string;accountId:string;legId:number;active:Amount;acceptedTotal:Amount;refundConsumed:boolean}
export interface Account {id:string;roles:string[];registered:boolean;balance?:Amount;positions:Position[];credits:Credit[]}
export interface Activity {id:string;v:1;campaignId:string;actor:string;kind:string;at:Millis;amount?:Amount;legId?:number;creditId?:string;attemptId?:string;evidence:Evidence;detail:string;fixture:boolean}
export interface Page<T> {items:T[];nextCursor?:string}
export interface Config {
 mode:Mode;network:'local'|'testnet';serverNowMs:Millis;daoId:string;tokenId:string;escrowId:string;tokenDecimals:number;tokenSymbol:string;
 capabilities:{reads:boolean;publish:boolean;contribute:boolean;claims:boolean;demoControls:boolean;proposalExport:boolean;walletSubmission:boolean};
 integration:{sourceWritten:boolean;unitTested:boolean;wasmBuilt:boolean;sandboxVerified:boolean;deployedTestnet:boolean;liveFlowVerified:boolean;detail:string;evidencePath?:string};
 accounts:{id:string;roles:string[]}[];
}
export interface ApiError {code:string;message:string;retryable:boolean;evidence?:Evidence;details?:Record<string,unknown>}
export type Envelope<T>={ok:true;data:T;source:Source}|{ok:false;error:ApiError;source:Source};
export interface CommandResult {campaign?:Campaign;credit?:Credit;attempt?:Attempt;proposal?:Proposal;account?:Account;evidence:Evidence}
export interface Custody {accounting:Accounting;observedTokenBalance:Amount;observedAt:Millis;transferExecutedAwaitingResolution:Amount;unallocatedSurplus:Amount;bookReconciled:boolean;tokenReconciliation:'Matched'|'InFlight'|'Mismatch'}
export interface CommandContext {actor:string;idempotencyKey:string}
