import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  atomic,
  checkedAdd,
  checkedSub,
  deriveLeg,
  isAccountId,
} from "../shared/amounts.ts";
import { canonicalTerms } from "../shared/terms.ts";
import type {
  Account,
  Accounting,
  Activity,
  Attempt,
  Campaign,
  CommandResult,
  Config,
  Credit,
  CreditKind,
  Custody,
  Envelope,
  Evidence,
  Page,
  Position,
  Proposal,
  PublishInput,
  Source,
  Terms,
} from "../shared/types.ts";
import { Store } from "./store.ts";

export const DAO = "community.alltogether.testnet";
export const ESCROW = "escrow.alltogether.testnet";
export const TOKEN = "testusd.alltogether.testnet";
export const ORGANIZER = "organizer.alltogether.testnet";
export const ALICE = "alice.alltogether.testnet";
export const BOB = "bob.alltogether.testnet";
export const BENEFICIARIES = [
  "venue.alltogether.testnet",
  "equipment.alltogether.testnet",
  "access.alltogether.testnet",
];
export interface Wallet {
  id: string;
  roles: string[];
  registered: boolean;
  balance: string;
}
export interface TransferResult {
  attemptId: string;
  success: boolean;
  errorCode?: string;
  executedAt: string;
  evidence: Evidence;
}
export interface HttpResult {
  status: number;
  body: Envelope<unknown>;
}
export class DomainError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  constructor(
    code: string,
    message: string,
    status = 409,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
const zeroAccounting = (): Accounting => ({
  acceptedInflows: "0",
  activePrincipal: "0",
  sponsorReserved: "0",
  failedPrincipalReserved: "0",
  availableCredits: "0",
  pendingTransfers: "0",
  confirmedPaid: "0",
});
const sum = (values: string[]) =>
  values.reduce((n, value) => checkedAdd(n, atomic(value)), 0n).toString();
const add = (a: string, b: string) =>
  checkedAdd(atomic(a), atomic(b)).toString();
const sub = (a: string, b: string) =>
  checkedSub(atomic(a), atomic(b)).toString();
function ensure(
  condition: unknown,
  code: string,
  message: string,
  status = 409,
  details?: Record<string, unknown>,
): asserts condition {
  if (!condition) throw new DomainError(code, message, status, details);
}

export class Domain {
  store: Store;
  clock: () => number;
  integrationPath: string;
  constructor(
    store: Store,
    options: { clock?: () => number; integrationPath?: string } = {},
  ) {
    this.store = store;
    this.clock = options.clock ?? Date.now;
    this.integrationPath =
      options.integrationPath ?? resolve("docs/integration-status.json");
  }
  now() {
    return Math.trunc(this.clock()).toString();
  }
  source(): Source {
    return {
      mode: "local",
      network: "local",
      observedAt: this.now(),
      stale: false,
    };
  }
  evidence(): Evidence {
    return { kind: "local", reference: `local-${this.store.next("receipt")}` };
  }
  wallet(id: string): Wallet {
    const value = this.store.object<Wallet>("accounts", id);
    ensure(value, "WRONG_ACTOR", "Select a known demo account.", 403);
    return value;
  }
  saveWallet(wallet: Wallet) {
    atomic(wallet.balance);
    this.store.run(
      "INSERT INTO accounts(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      wallet.id,
      JSON.stringify(wallet),
    );
  }
  saveCampaign(c: Campaign) {
    const bare = { ...c, credits: [], attempts: [] };
    this.store.run(
      "INSERT INTO campaigns(id,state,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,payload=excluded.payload",
      c.id,
      c.state,
      JSON.stringify(bare),
    );
  }
  campaign(id: string): Campaign {
    const c = this.store.object<Campaign>("campaigns", id);
    ensure(c, "NOT_FOUND", "Plan not found.", 404);
    return {
      ...c,
      credits: this.store.objects<Credit>(
        "credits",
        "WHERE campaign_id=? ORDER BY id",
        [id],
      ),
      attempts: this.store.objects<Attempt>(
        "attempts",
        "WHERE campaign_id=? ORDER BY CAST(id AS INTEGER) DESC LIMIT 50",
        [id],
      ),
      proposal: this.store.objects<Proposal>(
        "proposals",
        "WHERE campaign_id=? ORDER BY CAST(id AS INTEGER) DESC LIMIT 1",
        [id],
      )[0],
    };
  }
  /** Complete local history for explicit settlement exports; ordinary views stay bounded. */
  attemptHistory(campaignId: string): Attempt[] {
    this.campaign(campaignId);
    return this.store.objects<Attempt>(
      "attempts",
      "WHERE campaign_id=? ORDER BY CAST(id AS INTEGER)",
      [campaignId],
    );
  }
  saveCredit(c: Credit) {
    this.store.run(
      "INSERT INTO credits(id,campaign_id,owner,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      c.id,
      c.campaignId,
      c.owner,
      JSON.stringify(c),
    );
  }
  credit(id: string) {
    const c = this.store.object<Credit>("credits", id);
    ensure(
      c,
      "NOT_FOUND",
      "No payable credit exists. A full budget alone does not create a payment right.",
      404,
    );
    return c;
  }
  saveAttempt(a: Attempt) {
    this.store.run(
      "INSERT INTO attempts(id,campaign_id,credit_id,status,payload) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload",
      a.id,
      a.campaignId,
      a.creditId,
      a.status,
      JSON.stringify(a),
    );
  }
  position(campaignId: string, accountId: string, legId: number): Position {
    const r = this.store.get<{ payload: string }>(
      "SELECT payload FROM positions WHERE campaign_id=? AND account_id=? AND leg_id=?",
      campaignId,
      accountId,
      legId,
    );
    return r
      ? (JSON.parse(r.payload) as Position)
      : {
          campaignId,
          accountId,
          legId,
          active: "0",
          acceptedTotal: "0",
          refundConsumed: false,
        };
  }
  savePosition(p: Position) {
    this.store.run(
      "INSERT INTO positions(campaign_id,account_id,leg_id,payload) VALUES(?,?,?,?) ON CONFLICT(campaign_id,account_id,leg_id) DO UPDATE SET payload=excluded.payload",
      p.campaignId,
      p.accountId,
      p.legId,
      JSON.stringify(p),
    );
  }
  custodyRow() {
    return this.store.get<{ balance: string; fixture_issued: string }>(
      "SELECT balance,fixture_issued FROM custody WHERE id=1",
    )!;
  }
  setCustody(balance: string) {
    atomic(balance);
    this.store.run("UPDATE custody SET balance=? WHERE id=1", balance);
  }
  emit(
    campaignId: string | null,
    actor: string,
    kind: string,
    detail: string,
    evidence: Evidence,
    extra: Partial<Activity> = {},
  ) {
    const result = this.store.run(
      "INSERT INTO events(campaign_id,payload) VALUES(?,?)",
      campaignId,
      "{}",
    );
    const activity: Activity = {
      id: result.lastInsertRowid.toString(),
      v: 1,
      campaignId: campaignId ?? "",
      actor,
      kind,
      at: this.now(),
      detail,
      evidence,
      fixture: campaignId ? this.campaign(campaignId).fixture : true,
      ...extra,
    };
    this.store.run(
      "UPDATE events SET payload=? WHERE id=?",
      JSON.stringify(activity),
      activity.id,
    );
    return activity;
  }
  account(id: string): Account {
    const w = this.wallet(id);
    const positions = this.store
      .objects<Position>("positions", "WHERE account_id=?", [id])
      .map((p) =>
        this.campaign(p.campaignId).state === "Open"
          ? p
          : { ...p, active: "0" },
      );
    return {
      ...w,
      positions,
      credits: this.store.objects<Credit>(
        "credits",
        "WHERE owner=? ORDER BY id",
        [id],
      ),
    };
  }
  config(): Config {
    let integration: Config["integration"] = {
      sourceWritten: false,
      unitTested: false,
      wasmBuilt: false,
      sandboxVerified: false,
      deployedTestnet: false,
      liveFlowVerified: false,
      detail:
        "Local ledger is implemented. No verified blockchain integration is configured.",
    };
    try {
      const candidate = JSON.parse(readFileSync(this.integrationPath, "utf8"));
      integration = { ...integration, ...candidate };
    } catch {
      /* Evidence defaults are deliberately false. */
    }
    return {
      mode: "local",
      network: "local",
      serverNowMs: this.now(),
      daoId: DAO,
      tokenId: TOKEN,
      escrowId: ESCROW,
      tokenDecimals: 6,
      tokenSymbol: "testUSD",
      capabilities: {
        reads: true,
        publish: true,
        contribute: true,
        claims: true,
        demoControls: true,
        proposalExport: true,
        walletSubmission: false,
      },
      integration,
      accounts: this.store
        .objects<Wallet>("accounts", "ORDER BY id")
        .map(({ id, roles }) => ({ id, roles })),
    };
  }
  listCampaigns(
    options: { state?: string; cursor?: string; limit?: number } = {},
  ): Page<Campaign> {
    const limit = Math.min(20, Math.max(1, options.limit ?? 20));
    const rows = this.store.all<{ id: string }>(
      "SELECT id FROM campaigns WHERE CAST(id AS INTEGER)>? AND (? IS NULL OR state=?) ORDER BY CAST(id AS INTEGER) LIMIT ?",
      options.cursor ?? "0",
      options.state ?? null,
      options.state ?? null,
      limit + 1,
    );
    return {
      items: rows.slice(0, limit).map((r) => this.campaign(r.id)),
      ...(rows.length > limit ? { nextCursor: rows[limit - 1].id } : {}),
    };
  }
  activity(
    campaignId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Page<Activity> {
    this.campaign(campaignId);
    const limit = Math.min(50, Math.max(1, options.limit ?? 50));
    const rows = this.store.objects<Activity>(
      "events",
      "WHERE campaign_id=? AND id>? ORDER BY id LIMIT ?",
      [campaignId, options.cursor ?? "0", limit + 1],
    );
    return {
      items: rows.slice(0, limit),
      ...(rows.length > limit ? { nextCursor: rows[limit - 1].id } : {}),
    };
  }
  command(
    actor: string,
    key: string,
    fingerprint: string,
    operation: () => unknown,
    status = 200,
  ): HttpResult {
    return this.store.transaction(() => {
      this.wallet(actor);
      const prior = this.store.get<{
        fingerprint: string;
        status: number;
        response_json: string;
      }>(
        "SELECT fingerprint,status,response_json FROM idempotency WHERE actor=? AND key=?",
        actor,
        key,
      );
      if (prior) {
        ensure(
          prior.fingerprint === fingerprint,
          "IDEMPOTENCY_CONFLICT",
          "This request key was already used for different content.",
        );
        return { status: prior.status, body: JSON.parse(prior.response_json) };
      }
      this.store.db.exec("SAVEPOINT command");
      let result: HttpResult;
      try {
        const data = operation();
        this.assertInvariants();
        this.store.db.exec("RELEASE command");
        result = { status, body: { ok: true, data, source: this.source() } };
      } catch (error) {
        this.store.db.exec("ROLLBACK TO command");
        this.store.db.exec("RELEASE command");
        if (!(error instanceof DomainError)) throw error;
        result = {
          status: error.status,
          body: {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
              retryable: false,
              ...(error.details ? { details: error.details } : {}),
            },
            source: this.source(),
          },
        };
      }
      this.store.run(
        "INSERT INTO idempotency(actor,key,fingerprint,status,response_json) VALUES(?,?,?,?,?)",
        actor,
        key,
        fingerprint,
        result.status,
        JSON.stringify(result.body),
      );
      return result;
    });
  }
  validateAmount(value: unknown, positive = true): string {
    try {
      ensure(
        typeof value === "string" && value.length <= 39,
        "VALIDATION_ERROR",
        "Amount must be an integer string within u128.",
        400,
      );
      const n = atomic(value);
      ensure(
        !positive || n > 0n,
        "VALIDATION_ERROR",
        "Amount must be positive.",
        400,
      );
      return n.toString();
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        "VALIDATION_ERROR",
        "Amount must be a canonical unsigned u128 integer.",
        400,
      );
    }
  }
  text(value: unknown, label: string, max: number, min = 1): string {
    ensure(
      typeof value === "string",
      "VALIDATION_ERROR",
      `${label} must be text.`,
      400,
    );
    const text = value.trim().normalize("NFC");
    const length = Array.from(text).length;
    ensure(
      length >= min &&
        length <= max &&
        !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text),
      "VALIDATION_ERROR",
      `${label} must contain ${min}–${max} characters.`,
      400,
    );
    return text;
  }
  publish(actor: string, input: PublishInput, fixture = false): CommandResult {
    ensure(
      input && typeof input === "object",
      "VALIDATION_ERROR",
      "A plan is required.",
      400,
    );
    const title = this.text(input.title, "Title", 80),
      summary = this.text(input.summary, "Summary", 500),
      detail = this.text(input.detail, "Description", 2000, 0);
    ensure(
      typeof input.deadlineMs === "string" &&
        input.deadlineMs.length <= 20 &&
        /^(0|[1-9]\d*)$/.test(input.deadlineMs),
      "VALIDATION_ERROR",
      "Deadline must be milliseconds.",
      400,
    );
    const deadline = BigInt(input.deadlineMs),
      now = BigInt(this.now());
    ensure(
      deadline > now &&
        deadline <= now + 365n * 24n * 60n * 60n * 1000n &&
        deadline <= (1n << 64n) - 1n,
      "VALIDATION_ERROR",
      "Choose a future deadline within 365 days.",
      400,
    );
    ensure(
      Array.isArray(input.legs) &&
        input.legs.length >= 1 &&
        input.legs.length <= 3,
      "VALIDATION_ERROR",
      "A plan needs one to three budgets.",
      400,
    );
    const legs = input.legs.map((leg, index) => {
      ensure(
        leg && typeof leg === "object" && !Array.isArray(leg),
        "VALIDATION_ERROR",
        "Each budget must be an object.",
        400,
      );
      const budget = this.validateAmount(leg.budget),
        declaredSponsorCap = this.validateAmount(leg.declaredSponsorCap);
      let derived;
      try {
        derived = deriveLeg(budget, declaredSponsorCap);
      } catch {
        throw new DomainError(
          "VALIDATION_ERROR",
          "Budget must be at least two base units and match cap no larger than the budget.",
          400,
        );
      }
      ensure(
        typeof leg.beneficiary === "string" && isAccountId(leg.beneficiary),
        "VALIDATION_ERROR",
        "Use a valid NEAR-style beneficiary account ID.",
        400,
      );
      ensure(
        leg.beneficiary !== ESCROW,
        "VALIDATION_ERROR",
        `Budget ${index + 1} cannot use the escrow as its beneficiary: a token transfer to the escrow itself cannot pay this entitlement.`,
        400,
      );
      return {
        legId: index,
        title: this.text(leg.title, "Budget name", 60),
        purpose: this.text(leg.purpose, "Budget purpose", 240, 0),
        beneficiary: leg.beneficiary,
        budget,
        declaredSponsorCap,
        ...derived,
      };
    });
    try {
      sum(legs.map((l) => l.budget));
    } catch {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Total plan budget exceeds u128.",
        400,
      );
    }
    // Finish validation before allocating an ID or creating any beneficiary wallet.
    const id = this.store.next("campaign");
    for (const leg of legs) {
      if (!this.store.object("accounts", leg.beneficiary))
        this.saveWallet({id:leg.beneficiary,roles:["beneficiary"],registered:false,balance:"0"});
    }
    const terms: Terms = {
      schemaVersion: 1,
      domain: "alltogether/local/v1",
      escrowId: ESCROW,
      campaignId: id,
      organizer: actor,
      title,
      summary,
      detail,
      daoId: DAO,
      tokenId: TOKEN,
      tokenDecimals: 6,
      tokenSymbol: "testUSD",
      deadlineMs: deadline.toString(),
      participantLimit: 128,
      matchRule: "one-to-one-capped-v1",
      settlementRule: "all-legs-v1",
      legs,
    };
    const c: Campaign = {
      id,
      terms,
      termsHash: createHash("sha256")
        .update(canonicalTerms(terms))
        .digest("hex"),
      state: "AwaitingFunding",
      createdAt: this.now(),
      legs: legs.map((l) => ({
        legId: l.legId,
        active: "0",
        provisionalMatch: "0",
      })),
      accounting: zeroAccounting(),
      participantCount: 0,
      credits: [],
      attempts: [],
      fixture,
    };
    this.saveCampaign(c);
    const evidence = this.evidence();
    this.emit(
      id,
      actor,
      "campaign_published",
      "Immutable plan terms published.",
      evidence,
    );
    return { campaign: this.campaign(id), evidence };
  }
  createProposal(actor: string, id: string): CommandResult {
    const c = this.campaign(id);
    ensure(
      c.terms.organizer === actor,
      "WRONG_ACTOR",
      "Only the organizer can request sponsorship.",
      403,
    );
    ensure(
      c.state === "AwaitingFunding",
      "INVALID_STATE",
      "This plan is not awaiting sponsorship.",
    );
    ensure(
      BigInt(this.now()) < BigInt(c.terms.deadlineMs),
      "DEADLINE_REACHED",
      "The plan has closed.",
    );
    ensure(
      !c.proposal || c.proposal.status === "Rejected",
      "INVALID_STATE",
      "A sponsorship request already exists.",
    );
    const evidence = this.evidence();
    const p: Proposal = {
      id: this.store.next("proposal"),
      campaignId: id,
      daoId: DAO,
      status: "InProgress",
      termsHash: c.termsHash,
      observedAt: this.now(),
    };
    this.store.run(
      "INSERT INTO proposals(id,campaign_id,payload) VALUES(?,?,?)",
      p.id,
      id,
      JSON.stringify(p),
    );
    this.emit(
      id,
      actor,
      "sponsor_proposed",
      "Local demo sponsorship request created; no funds have moved.",
      evidence,
    );
    return { campaign: this.campaign(id), proposal: p, evidence };
  }
  decideProposal(actor: string, id: string, decision: unknown): CommandResult {
    ensure(
      actor === DAO,
      "WRONG_ACTOR",
      "Switch to the demo DAO to review proposals.",
      403,
    );
    ensure(
      decision === "Approved" || decision === "Rejected",
      "VALIDATION_ERROR",
      "Choose Approved or Rejected.",
      400,
    );
    const p = this.store.object<Proposal>("proposals", id);
    ensure(p, "NOT_FOUND", "Proposal not found.", 404);
    ensure(
      p.status === "InProgress",
      "INVALID_STATE",
      "This proposal has already been decided.",
    );
    const c = this.campaign(p.campaignId);
    ensure(
      BigInt(this.now()) < BigInt(c.terms.deadlineMs),
      "DEADLINE_REACHED",
      "The plan has closed.",
    );
    p.status = decision;
    p.observedAt = this.now();
    this.store.run(
      "UPDATE proposals SET payload=? WHERE id=?",
      JSON.stringify(p),
      id,
    );
    const evidence = this.evidence();
    this.emit(
      c.id,
      actor,
      "proposal_decided",
      `${decision} in the local DAO simulator. Approval is not funding.`,
      evidence,
    );
    return { campaign: this.campaign(c.id), proposal: p, evidence };
  }
  fundSponsor(
    actor: string,
    id: string,
    amountInput: unknown,
    hash: unknown,
  ): CommandResult {
    ensure(
      actor === DAO,
      "WRONG_ACTOR",
      "Only the configured demo DAO can fund this reserve.",
      403,
    );
    const c = this.campaign(id);
    this.beforeClose(c);
    ensure(
      c.state === "AwaitingFunding",
      "INVALID_STATE",
      "Sponsor reserve has already been accepted or the plan is terminal.",
    );
    ensure(
      c.proposal?.status === "Approved",
      "INVALID_STATE",
      "Approve the sponsorship request first.",
    );
    ensure(
      hash === c.termsHash,
      "HASH_MISMATCH",
      "Published terms do not match.",
    );
    const amount = this.validateAmount(amountInput),
      required = sum(c.terms.legs.map((l) => l.sponsorAllocation));
    ensure(
      amount === required,
      "VALIDATION_ERROR",
      "Fund the exact effective matching reserve.",
      400,
      { required },
    );
    this.acceptInflow(c, actor, amount);
    c.accounting.sponsorReserved = amount;
    c.state = "Open";
    const evidence = this.evidence();
    c.sponsorEvidence = evidence;
    this.saveCampaign(c);
    const p = c.proposal!;
    p.executionEvidence = evidence;
    p.observedAt = this.now();
    this.store.run(
      "UPDATE proposals SET payload=? WHERE id=?",
      JSON.stringify(p),
      p.id,
    );
    this.emit(
      id,
      actor,
      "sponsor_received",
      "Exact campaign-specific matching reserve received. Contributions are open.",
      evidence,
      { amount },
    );
    return { campaign: this.campaign(id), evidence };
  }
  beforeClose(c: Campaign) {
    ensure(
      BigInt(this.now()) < BigInt(c.terms.deadlineMs),
      "DEADLINE_REACHED",
      "The deadline has passed. No new contribution or removal is allowed.",
    );
  }
  open(c: Campaign) {
    ensure(
      c.state === "Open",
      "NOT_FUNDED",
      "This plan is not open for contributions.",
    );
    this.beforeClose(c);
  }
  leg(c: Campaign, value: unknown) {
    ensure(
      Number.isInteger(value) &&
        typeof value === "number" &&
        value >= 0 &&
        value < c.terms.legs.length,
      "VALIDATION_ERROR",
      "Choose a valid budget.",
      400,
    );
    return c.terms.legs[value];
  }
  acceptInflow(c: Campaign, actor: string, amount: string) {
    const w = this.wallet(actor);
    ensure(
      atomic(w.balance) >= atomic(amount),
      "INSUFFICIENT_BALANCE",
      "The demo wallet does not have enough testUSD.",
    );
    w.balance = sub(w.balance, amount);
    this.saveWallet(w);
    const custody = this.custodyRow();
    this.setCustody(add(custody.balance, amount));
    c.accounting.acceptedInflows = add(c.accounting.acceptedInflows, amount);
  }
  pledge(
    actor: string,
    id: string,
    legId: unknown,
    amountInput: unknown,
    hash: unknown,
  ): CommandResult {
    const c = this.campaign(id);
    this.open(c);
    ensure(
      hash === c.termsHash,
      "HASH_MISMATCH",
      "Published terms do not match.",
    );
    const leg = this.leg(c, legId),
      funding = c.legs[leg.legId],
      amount = this.validateAmount(amountInput),
      remaining = sub(leg.communityTarget, funding.active);
    ensure(
      atomic(amount) <= atomic(remaining),
      "LEG_FULL",
      "This contribution would overfill the budget; nothing was debited.",
      409,
      { remaining },
    );
    const admitted = this.store.get(
      "SELECT account_id FROM admissions WHERE campaign_id=? AND account_id=?",
      id,
      actor,
    );
    if (!admitted) {
      ensure(
        c.participantCount < 128,
        "PARTICIPANT_LIMIT",
        "This plan has reached its lifetime participant limit.",
      );
      this.store.run(
        "INSERT INTO admissions(campaign_id,account_id) VALUES(?,?)",
        id,
        actor,
      );
      c.participantCount++;
    }
    this.acceptInflow(c, actor, amount);
    const p = this.position(id, actor, leg.legId);
    p.active = add(p.active, amount);
    p.acceptedTotal = add(p.acceptedTotal, amount);
    this.savePosition(p);
    funding.active = add(funding.active, amount);
    funding.provisionalMatch = (
      atomic(funding.active) < atomic(leg.sponsorAllocation)
        ? atomic(funding.active)
        : atomic(leg.sponsorAllocation)
    ).toString();
    c.accounting.activePrincipal = add(c.accounting.activePrincipal, amount);
    this.saveCampaign(c);
    const evidence = this.evidence();
    this.emit(
      id,
      actor,
      "pledge_received",
      "Contribution accepted only for the selected budget.",
      evidence,
      { legId: leg.legId, amount },
    );
    return {
      campaign: this.campaign(id),
      account: this.account(actor),
      evidence,
    };
  }
  addCredit(
    c: Campaign,
    kind: CreditKind,
    owner: string,
    amount: string,
    legId?: number,
  ): Credit {
    const id = `${c.id}:${kind}:${owner}:${legId ?? "-"}`;
    const value = this.store.object<Credit>("credits", id) ?? {
      id,
      campaignId: c.id,
      kind,
      owner,
      recipient: owner,
      ...(legId !== undefined ? { legId } : {}),
      available: "0",
      pending: "0",
      paid: "0",
    };
    value.available = add(value.available, amount);
    this.saveCredit(value);
    c.accounting.availableCredits = add(c.accounting.availableCredits, amount);
    return value;
  }
  withdraw(
    actor: string,
    id: string,
    legId: unknown,
    amountInput: unknown,
  ): CommandResult {
    const c = this.campaign(id);
    this.open(c);
    const leg = this.leg(c, legId),
      amount = this.validateAmount(amountInput),
      p = this.position(id, actor, leg.legId);
    ensure(
      atomic(p.active) >= atomic(amount),
      "INSUFFICIENT_BALANCE",
      "You cannot remove more than your active contribution.",
    );
    p.active = sub(p.active, amount);
    this.savePosition(p);
    const funding = c.legs[leg.legId];
    funding.active = sub(funding.active, amount);
    funding.provisionalMatch = (
      atomic(funding.active) < atomic(leg.sponsorAllocation)
        ? atomic(funding.active)
        : atomic(leg.sponsorAllocation)
    ).toString();
    c.accounting.activePrincipal = sub(c.accounting.activePrincipal, amount);
    const credit = this.addCredit(c, "withdrawal", actor, amount);
    this.saveCampaign(c);
    const evidence = this.evidence();
    this.emit(
      id,
      actor,
      "pledge_removed",
      "Removed from funding immediately. Claim the separate withdrawal credit to receive the tokens.",
      evidence,
      { amount, legId: leg.legId, creditId: credit.id },
    );
    return { campaign: this.campaign(id), credit, evidence };
  }
  finalize(actor: string, id: string): CommandResult {
    const c = this.campaign(id);
    ensure(
      BigInt(this.now()) >= BigInt(c.terms.deadlineMs),
      "DEADLINE_NOT_REACHED",
      "The common deadline has not arrived.",
    );
    const evidence = this.evidence();
    if (c.state === "Succeeded" || c.state === "Failed")
      return { campaign: c, evidence };
    const succeeded =
      c.state === "Open" &&
      c.terms.legs.every((l) => c.legs[l.legId].active === l.communityTarget);
    for (const f of c.legs) f.closingActive = f.active;
    if (succeeded) {
      c.state = "Succeeded";
      for (const leg of c.terms.legs)
        this.addCredit(
          c,
          "beneficiary",
          leg.beneficiary,
          leg.budget,
          leg.legId,
        );
      c.accounting.activePrincipal = "0";
      c.accounting.sponsorReserved = "0";
    } else {
      c.state = "Failed";
      c.failureReason = c.sponsorEvidence
        ? "INCOMPLETE_BUDGETS"
        : "SPONSOR_NOT_FUNDED";
      c.accounting.failedPrincipalReserved = c.accounting.activePrincipal;
      c.accounting.activePrincipal = "0";
      if (c.accounting.sponsorReserved !== "0")
        this.addCredit(c, "sponsor_refund", DAO, c.accounting.sponsorReserved);
      c.accounting.sponsorReserved = "0";
    }
    c.finalizedAt = this.now();
    this.saveCampaign(c);
    this.emit(
      id,
      actor,
      "campaign_finalized",
      succeeded
        ? "Every required budget funded. All beneficiary entitlements were allocated together."
        : "One or more requirements were missing. No beneficiary entitlement exists; refunds are available.",
      evidence,
    );
    return { campaign: this.campaign(id), evidence };
  }
  materializeRefund(actor: string, id: string): CommandResult {
    const c = this.campaign(id);
    ensure(
      c.state === "Failed",
      "INVALID_STATE",
      "Contributor refunds are available only for failed plans.",
    );
    let total = "0";
    for (const leg of c.terms.legs) {
      const p = this.position(id, actor, leg.legId);
      if (!p.refundConsumed && p.active !== "0") {
        total = add(total, p.active);
        p.refundConsumed = true;
        this.savePosition(p);
      }
    }
    let credit = this.store.object<Credit>(
      "credits",
      `${id}:refund:${actor}:-`,
    );
    if (total !== "0") {
      c.accounting.failedPrincipalReserved = sub(
        c.accounting.failedPrincipalReserved,
        total,
      );
      credit = this.addCredit(c, "refund", actor, total);
      this.saveCampaign(c);
    }
    const evidence = this.evidence();
    this.emit(
      id,
      actor,
      "refund_materialized",
      total === "0"
        ? "No additional principal remains to refund."
        : "Your active principal became a fixed refund credit.",
      evidence,
      { amount: total, creditId: credit?.id },
    );
    return {
      campaign: this.campaign(id),
      ...(credit ? { credit } : {}),
      evidence,
    };
  }
  claim(actor: string, creditId: string): CommandResult {
    const credit = this.credit(creditId);
    ensure(
      credit.owner === actor ||
        credit.kind === "beneficiary" ||
        credit.kind === "sponsor_refund",
      "NOT_CREDIT_OWNER",
      "Only the owner may trigger this contributor credit.",
      403,
    );
    ensure(
      !credit.pendingAttemptId && credit.pending === "0",
      "TRANSFER_PENDING",
      "A transfer is already pending for this credit.",
    );
    ensure(
      atomic(credit.available) > 0n,
      "NO_AVAILABLE_CREDIT",
      "No available amount remains to claim.",
    );
    const c = this.campaign(credit.campaignId),
      amount = credit.available,
      evidence = this.evidence();
    const attempt: Attempt = {
      id: this.store.next("attempt"),
      campaignId: c.id,
      creditId,
      recipient: credit.recipient,
      amount,
      status: "Pending",
      createdAt: this.now(),
      evidence,
    };
    credit.available = "0";
    credit.pending = amount;
    credit.pendingAttemptId = attempt.id;
    this.saveCredit(credit);
    this.saveAttempt(attempt);
    c.accounting.availableCredits = sub(c.accounting.availableCredits, amount);
    c.accounting.pendingTransfers = add(c.accounting.pendingTransfers, amount);
    this.saveCampaign(c);
    this.emit(
      c.id,
      actor,
      "transfer_pending",
      "Transfer reserved durably. Closing this page will not duplicate it.",
      evidence,
      { amount, creditId, attemptId: attempt.id },
    );
    return { campaign: this.campaign(c.id), credit, attempt, evidence };
  }
  registerToken(actor: string, accountId: unknown): CommandResult {
    ensure(
      typeof accountId === "string" && isAccountId(accountId),
      "VALIDATION_ERROR",
      "Invalid account.",
      400,
    );
    ensure(
      actor === accountId ||
        (actor === DAO &&
          this.store
            .objects<Campaign>("campaigns")
            .some((c) =>
              c.terms.legs.some((l) => l.beneficiary === accountId),
            )),
      "WRONG_ACTOR",
      "Select that demo account, or use the DAO to register a campaign beneficiary.",
      403,
    );
    const w = this.wallet(accountId);
    w.registered = true;
    this.saveWallet(w);
    const evidence = this.evidence();
    this.emit(
      null,
      actor,
      "token_registered",
      `${accountId} is registered with the local test token.`,
      evidence,
    );
    return { account: this.account(accountId), evidence };
  }
  executeAttempt(id: string) {
    return this.store.transaction(() => {
      const a = this.store.object<Attempt>("attempts", id);
      if (!a || a.status !== "Pending") return;
      const existing = this.store.get<{ payload: string }>(
        "SELECT payload FROM transfer_results WHERE attempt_id=?",
        id,
      );
      if (existing) return JSON.parse(existing.payload) as TransferResult;
      const w = this.wallet(a.recipient),
        custody = this.custodyRow();
      const result: TransferResult = {
        attemptId: id,
        success: w.registered && atomic(custody.balance) >= atomic(a.amount),
        executedAt: this.now(),
        evidence: this.evidence(),
      };
      if (!w.registered) result.errorCode = "TOKEN_NOT_REGISTERED";
      else if (atomic(custody.balance) < atomic(a.amount))
        result.errorCode = "INSUFFICIENT_CUSTODY";
      if (result.success) {
        this.setCustody(sub(custody.balance, a.amount));
        w.balance = add(w.balance, a.amount);
        this.saveWallet(w);
      }
      this.store.run(
        "INSERT INTO transfer_results(attempt_id,payload) VALUES(?,?)",
        id,
        JSON.stringify(result),
      );
      this.assertInvariants();
      return result;
    });
  }
  resolveAttempt(id: string) {
    return this.store.transaction(() => {
      const a = this.store.object<Attempt>("attempts", id);
      if (!a || a.status !== "Pending") return;
      const row = this.store.get<{ payload: string }>(
        "SELECT payload FROM transfer_results WHERE attempt_id=?",
        id,
      );
      if (!row) return;
      const result = JSON.parse(row.payload) as TransferResult,
        c = this.campaign(a.campaignId),
        credit = this.credit(a.creditId);
      ensure(
        credit.pendingAttemptId === id && credit.pending === a.amount,
        "INVARIANT_FAILURE",
        "Pending credit does not match its attempt.",
        500,
      );
      credit.pending = "0";
      delete credit.pendingAttemptId;
      c.accounting.pendingTransfers = sub(
        c.accounting.pendingTransfers,
        a.amount,
      );
      if (result.success) {
        credit.paid = add(credit.paid, a.amount);
        c.accounting.confirmedPaid = add(c.accounting.confirmedPaid, a.amount);
        a.status = "Succeeded";
      } else {
        credit.available = add(credit.available, a.amount);
        c.accounting.availableCredits = add(
          c.accounting.availableCredits,
          a.amount,
        );
        a.status = "Failed";
        a.errorCode = result.errorCode;
      }
      a.resolvedAt = this.now();
      a.resultEvidence = result.evidence;
      this.saveCredit(credit);
      this.saveCampaign(c);
      this.saveAttempt(a);
      this.emit(
        c.id,
        a.recipient,
        result.success ? "transfer_paid" : "transfer_failed",
        result.success
          ? "The fixed recipient received the local tokens."
          : "Transfer failed. Its exact credit was restored; funding totals and outcome did not change.",
        result.evidence,
        { amount: a.amount, creditId: credit.id, attemptId: id },
      );
      this.assertInvariants();
      return a;
    });
  }
  processPending(limit = 50) {
    const ids = this.store.all<{ id: string }>(
      "SELECT id FROM attempts WHERE status=? ORDER BY CAST(id AS INTEGER) LIMIT ?",
      "Pending",
      limit,
    );
    for (const { id } of ids) {
      this.executeAttempt(id);
      this.resolveAttempt(id);
    }
    return ids.length;
  }
  accounting(campaignId?: string): Accounting {
    const rows = campaignId
      ? [this.campaign(campaignId)]
      : this.store.objects<Campaign>("campaigns");
    const result = zeroAccounting();
    for (const c of rows)
      for (const key of Object.keys(result) as (keyof Accounting)[])
        result[key] = add(result[key], c.accounting[key]);
    return result;
  }
  pendingHealth() {
    const pending=this.store.objects<Attempt>('attempts','WHERE status=?',['Pending']);
    const oldest=pending.reduce<bigint|null>((old,p)=>old===null||BigInt(p.createdAt)<old?BigInt(p.createdAt):old,null);
    const now=BigInt(this.now());
    return {count:pending.length,oldestCreatedAt:oldest?.toString()??null,oldestAgeMs:oldest===null?null:(now>oldest?now-oldest:0n).toString()};
  }
  custody(campaignId?: string): Custody {
    const global = this.accounting(),
      accounting = campaignId ? this.campaign(campaignId).accounting : global;
    const pendingResults = this.store.objects<TransferResult>(
      "transfer_results",
      "WHERE attempt_id IN (SELECT id FROM attempts WHERE status=?)",
      ["Pending"],
    );
    const executed = sum(
      pendingResults
        .filter((r) => r.success)
        .map(
          (r) => this.store.object<Attempt>("attempts", r.attemptId)!.amount,
        ),
    );
    const actual = this.custodyRow().balance;
    const liabilities = sum([
      global.activePrincipal,
      global.sponsorReserved,
      global.failedPrincipalReserved,
      global.availableCredits,
      global.pendingTransfers,
    ]);
    const expected = sub(liabilities, executed);
    const surplus =
      atomic(actual) >= atomic(expected) ? sub(actual, expected) : "0";
    const book =
      Object.values(accounting).every((v) => /^(0|[1-9]\d*)$/.test(v)) &&
      atomic(sub(accounting.acceptedInflows, accounting.confirmedPaid)) ===
        atomic(
          sum([
            accounting.activePrincipal,
            accounting.sponsorReserved,
            accounting.failedPrincipalReserved,
            accounting.availableCredits,
            accounting.pendingTransfers,
          ]),
        );
    return {
      accounting,
      observedTokenBalance: actual,
      observedAt: this.now(),
      transferExecutedAwaitingResolution: executed,
      unallocatedSurplus: surplus,
      bookReconciled: book,
      tokenReconciliation:
        atomic(actual) !== atomic(expected)
          ? "Mismatch"
          : executed !== "0"
            ? "InFlight"
            : "Matched",
    };
  }
  assertInvariants() {
    for (const c of this.store.objects<Campaign>("campaigns")) {
      ensure(
        createHash("sha256").update(canonicalTerms(c.terms)).digest("hex") === c.termsHash,
        "INVARIANT_FAILURE",
        "Immutable terms no longer match their published hash.",
        500,
      );
      const requiredReserve = sum(c.terms.legs.map((leg) => leg.sponsorAllocation));
      ensure(
        c.state === "Open"
          ? c.accounting.sponsorReserved === requiredReserve && Boolean(c.sponsorEvidence)
          : c.accounting.sponsorReserved === "0",
        "INVARIANT_FAILURE",
        "Sponsor reserve does not match campaign state.",
        500,
      );
      const positions = this.store.objects<Position>(
          "positions",
          "WHERE campaign_id=?",
          [c.id],
        ),
        credits = this.store.objects<Credit>("credits", "WHERE campaign_id=?", [
          c.id,
        ]),
        attempts = this.store.objects<Attempt>(
          "attempts",
          "WHERE campaign_id=? AND status=?",
          [c.id, "Pending"],
        );
      const active =
        c.state === "Open" ? sum(positions.map((p) => p.active)) : "0";
      const failed =
        c.state === "Failed"
          ? sum(positions.filter((p) => !p.refundConsumed).map((p) => p.active))
          : "0";
      if (c.state === "Succeeded") {
        for (const leg of c.terms.legs) {
          const credit = credits.find((value) => value.kind === "beneficiary" && value.legId === leg.legId);
          ensure(
            credit && credit.owner === leg.beneficiary && sum([credit.available, credit.pending, credit.paid]) === leg.budget,
            "INVARIANT_FAILURE",
            "A successful budget does not have its exact fixed beneficiary entitlement.",
            500,
          );
        }
      }
      ensure(
        active === c.accounting.activePrincipal &&
          failed === c.accounting.failedPrincipalReserved,
        "INVARIANT_FAILURE",
        "Underlying contribution categories do not reconcile.",
        500,
      );
      ensure(
        sum(credits.map((v) => v.available)) ===
          c.accounting.availableCredits &&
          sum(credits.map((v) => v.pending)) ===
            c.accounting.pendingTransfers &&
          sum(credits.map((v) => v.paid)) === c.accounting.confirmedPaid,
        "INVARIANT_FAILURE",
        "Credit categories do not reconcile.",
        500,
      );
      ensure(
        sum(attempts.map((a) => a.amount)) === c.accounting.pendingTransfers,
        "INVARIANT_FAILURE",
        "Pending attempts do not reconcile.",
        500,
      );
      for (const credit of credits) {
        const linked = attempts.filter((a) => a.creditId === credit.id);
        ensure(
          linked.length < 2 &&
            (credit.pending === "0"
              ? linked.length === 0
              : linked.length === 1 &&
                linked[0].id === credit.pendingAttemptId &&
                linked[0].amount === credit.pending),
          "INVARIANT_FAILURE",
          "A credit has inconsistent pending payment.",
          500,
        );
        ensure(
          credit.recipient === credit.owner,
          "INVARIANT_FAILURE",
          "Credit recipient changed.",
          500,
        );
        ensure(
          credit.kind !== "beneficiary" || c.state === "Succeeded",
          "INVARIANT_FAILURE",
          "Beneficiary credit exists without collective success.",
          500,
        );
      }
      for (const leg of c.terms.legs) {
        const value = sum(
          positions.filter((p) => p.legId === leg.legId).map((p) => p.active),
        );
        ensure(
          value === c.legs[leg.legId].active &&
            atomic(value) <= atomic(leg.communityTarget),
          "INVARIANT_FAILURE",
          "Budget principal does not reconcile.",
          500,
        );
      }
      const count = this.store.get<{ n: number }>(
        "SELECT COUNT(*) n FROM admissions WHERE campaign_id=?",
        c.id,
      )!.n;
      ensure(
        count === c.participantCount && count <= 128,
        "INVARIANT_FAILURE",
        "Admission count is inconsistent.",
        500,
      );
      const a = c.accounting;
      ensure(
        sub(a.acceptedInflows, a.confirmedPaid) ===
          sum([
            a.activePrincipal,
            a.sponsorReserved,
            a.failedPrincipalReserved,
            a.availableCredits,
            a.pendingTransfers,
          ]),
        "INVARIANT_FAILURE",
        "Campaign liabilities do not conserve funds.",
        500,
      );
    }
    const custody = this.custodyRow();
    const wallets = sum(
      this.store.objects<Wallet>("accounts").map((a) => a.balance),
    );
    ensure(
      add(wallets, custody.balance) === custody.fixture_issued,
      "INVARIANT_FAILURE",
      "Local token supply does not reconcile.",
      500,
    );
    ensure(
      this.custody().tokenReconciliation !== "Mismatch",
      "INVARIANT_FAILURE",
      "Observed custody does not reconcile.",
      500,
    );
    return true;
  }
  seedAccounts() {
    return this.store.transaction(() => {
      if (this.store.get("SELECT value FROM meta WHERE key=?", "seed:accounts"))
        return false;
      const wallets: Wallet[] = [
        { id: DAO, roles: ["dao"], registered: true, balance: "10000000000" },
        { id: ORGANIZER, roles: ["organizer"], registered: true, balance: "0" },
        {
          id: ALICE,
          roles: ["contributor"],
          registered: true,
          balance: "5000000000",
        },
        {
          id: BOB,
          roles: ["contributor"],
          registered: true,
          balance: "5000000000",
        },
        ...BENEFICIARIES.map((id, index) => ({
          id,
          roles: ["beneficiary"],
          registered: index !== 1,
          balance: "0",
        })),
      ];
      for (const w of wallets) this.saveWallet(w);
      this.store.run(
        "UPDATE custody SET fixture_issued=? WHERE id=1",
        sum(wallets.map((w) => w.balance)),
      );
      this.store.run(
        "INSERT INTO meta(key,value) VALUES(?,?)",
        "seed:accounts",
        "true",
      );
      this.emit(
        null,
        ORGANIZER,
        "fixture_issuance",
        "One-time local fixture issuance: 20,000 testUSD. These are not blockchain tokens.",
        this.evidence(),
      );
      this.assertInvariants();
      return true;
    });
  }
  canonicalInput(deadlineMs: string): PublishInput {
    return {
      title: "An accessible maker day",
      summary: "Three essentials. One shared commitment.",
      detail:
        "Fund the venue, equipment and accessibility together. Funding does not guarantee supplier delivery.",
      deadlineMs,
      legs: [
        {
          title: "Venue",
          purpose: "An accessible room for the community.",
          beneficiary: BENEFICIARIES[0],
          budget: "600000000",
          declaredSponsorCap: "200000000",
        },
        {
          title: "Equipment",
          purpose: "Tools and shared workshop materials.",
          beneficiary: BENEFICIARIES[1],
          budget: "250000000",
          declaredSponsorCap: "125000000",
        },
        {
          title: "Accessibility",
          purpose: "Access support so everyone can take part.",
          beneficiary: BENEFICIARIES[2],
          budget: "150000000",
          declaredSponsorCap: "75000000",
        },
      ],
    };
  }
  seedWalkthrough(actor: string) {
    ensure(
      actor === ORGANIZER || actor === DAO,
      "WRONG_ACTOR",
      "Use the organizer or DAO demo account to load examples.",
      403,
    );
    const marker = this.store.get<{ value: string }>(
      "SELECT value FROM meta WHERE key=?",
      "seed:walkthrough",
    );
    if (marker)
      return {
        campaignIds: JSON.parse(marker.value) as string[],
        seeded: false,
      };
    const realClock = this.clock,
      now = Number(this.now()),
      ids: string[] = [];
    try {
      for (const success of [false, true]) {
        this.clock = () => now - 300000;
        const input = this.canonicalInput((now - 120000).toString());
        input.title = success
          ? "Seeded example · every budget funded"
          : "Seeded example · one essential missing";
        const c = this.publish(ORGANIZER, input, true).campaign!;
        ids.push(c.id);
        const p = this.createProposal(ORGANIZER, c.id).proposal!;
        this.decideProposal(DAO, p.id, "Approved");
        this.fundSponsor(DAO, c.id, "400000000", c.termsHash);
        for (const [legId, amount] of [
          [0, "400000000"],
          [1, "125000000"],
          [2, success ? "75000000" : "50000000"],
        ] as const)
          this.pledge(ALICE, c.id, legId, amount, c.termsHash);
        this.clock = () => now;
        this.finalize(ORGANIZER, c.id);
      }
      this.clock = realClock;
      const live = this.publish(
        ORGANIZER,
        this.canonicalInput((now + 180000).toString()),
        true,
      ).campaign!;
      ids.push(live.id);
      this.store.run(
        "INSERT INTO meta(key,value) VALUES(?,?)",
        "seed:walkthrough",
        JSON.stringify(ids),
      );
      this.assertInvariants();
      return { campaignIds: ids, seeded: true };
    } finally {
      this.clock = realClock;
    }
  }
}
