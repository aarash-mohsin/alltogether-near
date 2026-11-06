import type { Campaign } from "../shared/types.ts";
import { Domain } from "./domain.ts";

export function settlementRecord(domain: Domain, id: string) {
  const view = domain.campaign(id);
  const campaign = { ...view, attempts: domain.attemptHistory(id) };
  return {
    schemaVersion: 1,
    mode: "local",
    network: "local",
    notice:
      "Persistent local demo ledger. These are not blockchain transactions or redeemable dollars.",
    generatedAt: domain.now(),
    token: {
      id: campaign.terms.tokenId,
      symbol: campaign.terms.tokenSymbol,
      decimals: campaign.terms.tokenDecimals,
    },
    termsHash: campaign.termsHash,
    campaign,
    custody: domain.custody(id),
    activity: domain.store.objects(
      "events",
      "WHERE campaign_id=? ORDER BY id",
      [id],
    ),
  };
}
export function csvCell(value: unknown): string {
  let text = value === undefined || value === null ? "" : String(value);
  if (/^\s*[=+\-@]|^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function campaignCsv(domain: Domain, id: string): string {
  const c: Campaign = domain.campaign(id);
  const rows: unknown[][] = [
    [
      "mode",
      "network",
      "campaign_id",
      "terms_hash",
      "generated_at_ms",
      "token",
      "decimals",
      "kind",
      "owner_or_beneficiary",
      "leg",
      "available_or_active_atomic",
      "pending_atomic",
      "paid_atomic",
      "state_or_status",
      "reference",
    ],
  ];
  const common = [
    "local",
    "local",
    id,
    c.termsHash,
    domain.now(),
    c.terms.tokenId,
    c.terms.tokenDecimals,
  ];
  for (const leg of c.terms.legs)
    rows.push([
      ...common,
      "budget",
      leg.beneficiary,
      leg.title,
      c.legs[leg.legId].closingActive ?? c.legs[leg.legId].active,
      "0",
      "0",
      c.state,
      c.sponsorEvidence?.reference ?? "",
    ]);
  for (const credit of c.credits)
    rows.push([
      ...common,
      credit.kind,
      credit.recipient,
      credit.legId ?? "",
      credit.available,
      credit.pending,
      credit.paid,
      c.state,
      credit.id,
    ]);
  for (const attempt of domain.attemptHistory(id))
    rows.push([
      ...common,
      "transfer",
      attempt.recipient,
      "",
      attempt.amount,
      "",
      "",
      attempt.status,
      attempt.resultEvidence?.reference ?? attempt.evidence.reference,
    ]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
