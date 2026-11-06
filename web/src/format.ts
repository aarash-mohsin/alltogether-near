import { formatAmount } from '../../shared/amounts.ts';
import type { Account, Campaign, Credit, LegTerms } from '../../shared/types.ts';

export function money(amount: string, decimals = 6): string { return formatAmount(amount, decimals); }
export function sum(values: string[]): string { return values.reduce((total, value) => total + BigInt(value), 0n).toString(); }
export function progress(active: string, target: string): number { return BigInt(target) > 0n ? Number((BigInt(active) * 10000n) / BigInt(target)) / 100 : 0; }
export function reserve(campaign: Campaign): string { return sum(campaign.terms.legs.map(leg => leg.sponsorAllocation)); }
export function totalBudget(campaign: Campaign): string { return sum(campaign.terms.legs.map(leg => leg.budget)); }
export function communityTotal(campaign: Campaign): string { return sum(campaign.terms.legs.map(leg => leg.communityTarget)); }
export function fundedLegs(campaign: Campaign): number { return campaign.terms.legs.filter(leg => BigInt(campaign.legs.find(item => item.legId === leg.legId)?.closingActive ?? campaign.legs.find(item => item.legId === leg.legId)?.active ?? '0') >= BigInt(leg.communityTarget)).length; }
export function activeFor(campaign: Campaign, leg: LegTerms): string { const funding = campaign.legs.find(item => item.legId === leg.legId); return funding?.closingActive ?? funding?.active ?? '0'; }
export function creditTitle(credit: Credit): string { return ({ withdrawal: 'Withdrawn pledge', refund: 'Plan refund', beneficiary: 'Budget payment', sponsor_refund: 'Sponsor reserve return' })[credit.kind]; }
export function latestAttemptError(campaign: Campaign | undefined, credit: Credit): string | undefined {
  if(!campaign)return undefined;
  const latest = campaign.attempts.filter(item => item.creditId === credit.id).sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1)[0];
  return latest?.status === 'Failed' ? latest.errorCode : undefined;
}
export function reclaimablePrincipal(account: Account | undefined, campaignId: string): string {
  const positions = account?.positions.filter(item => item.campaignId === campaignId) ?? [];
  if (!positions.some(item => !item.refundConsumed)) return '0';
  // Terminal account views intentionally report active=0. Cumulative accepted
  // principal less already-created withdrawal/refund credits is the remaining
  // principal to materialize. The service remains the refund authority.
  const accepted = positions.reduce((amount, item) => amount + BigInt(item.acceptedTotal), 0n);
  const credited = (account?.credits ?? []).filter(item => item.campaignId === campaignId && (item.kind === 'withdrawal' || item.kind === 'refund')).reduce((amount, item) => amount + BigInt(item.available) + BigInt(item.pending) + BigInt(item.paid), 0n);
  return (accepted > credited ? accepted - credited : 0n).toString();
}
export function accountLabel(id: string): string { const name = id.split('.')[0]; return name === 'community' ? 'Community DAO' : name.charAt(0).toUpperCase() + name.slice(1); }
export function shortAccount(id: string): string { return id.length > 32 ? `${id.slice(0, 15)}…${id.slice(-13)}` : id; }
export function dateTime(value: string): string { return new Date(Number(value)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
export function utcTime(value: string): string { return new Date(Number(value)).toISOString().replace('T', ' ').replace('.000Z', ' UTC'); }
export function remaining(deadline: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Number(deadline) - now) / 1000));
  if (!seconds) return 'Ready to finalize';
  if (seconds < 60) return `${seconds}s remaining`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s remaining`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m remaining`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h remaining`;
}
