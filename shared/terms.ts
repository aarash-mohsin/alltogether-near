import type { Terms } from './types.ts';

export function canonicalTerms(terms: Terms): string {
  return JSON.stringify([
    'alltogether-terms-v1', terms.schemaVersion, terms.domain,
    terms.escrowId, terms.campaignId, terms.organizer, terms.title, terms.summary,
    terms.detail, terms.daoId, terms.tokenId, terms.tokenDecimals, terms.tokenSymbol,
    terms.deadlineMs, terms.participantLimit, terms.matchRule, terms.settlementRule,
    terms.legs.map(leg => [leg.legId, leg.title, leg.purpose, leg.beneficiary, leg.budget,
      leg.declaredSponsorCap, leg.sponsorAllocation, leg.communityTarget]),
  ]);
}

export async function hashTerms(terms: Terms): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalTerms(terms));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
