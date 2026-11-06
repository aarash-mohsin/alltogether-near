import { writeFileSync } from 'node:fs';
import { canonicalTerms, hashTerms } from '../shared/terms.ts';
const terms = {
  schemaVersion: 1, domain: 'alltogether/near-testnet/v1',
  escrowId: 'escrow.alltogether.testnet', campaignId: '42', organizer: 'organizer.alltogether.testnet',
  title: 'Café makers — 台北', summary: 'One small, exact shared commitment.', detail: 'Every essential budget must be ready.',
  daoId: 'community.alltogether.testnet', tokenId: 'testusd.alltogether.testnet', tokenDecimals: 6, tokenSymbol: 'testUSD',
  deadlineMs: '1800000000000', participantLimit: 128, matchRule: 'one-to-one-capped-v1', settlementRule: 'all-legs-v1',
  legs: [{ legId: 0, title: 'Accessibility', purpose: 'A funded ramp', beneficiary: 'access.alltogether.testnet',
    budget: '101', declaredSponsorCap: '60', sponsorAllocation: '50', communityTarget: '51' }],
};
writeFileSync(new URL('../shared/fixtures/terms-v1.json', import.meta.url), JSON.stringify({terms, canonical: canonicalTerms(terms), sha256: await hashTerms(terms)}, null, 2) + '\n');
