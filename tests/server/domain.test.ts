import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store.ts";
import {
  Domain,
  DAO,
  ORGANIZER,
  ALICE,
  BOB,
  BENEFICIARIES,
  ESCROW,
} from "../../server/domain.ts";
import { campaignCsv, settlementRecord } from "../../server/export.ts";
import type {
  Campaign,
  CommandResult,
  Envelope,
  PublishInput,
} from "../../shared/types.ts";

function harness(path = ":memory:") {
  let now = 1800000000000,
    sequence = 0;
  const store = new Store(path),
    domain = new Domain(store, { clock: () => now });
  domain.seedAccounts();
  function act<T = CommandResult>(actor: string, operation: () => T): T {
    sequence++;
    const response = domain.command(
      actor,
      `test-key-${sequence}`,
      `fingerprint-${sequence}`,
      operation,
    ).body as Envelope<T>;
    if (!response.ok)
      throw Object.assign(new Error(response.error.message), {
        code: response.error.code,
      });
    return response.data;
  }
  function plan(input?: PublishInput): Campaign {
    const c = act(ORGANIZER, () =>
      domain.publish(
        ORGANIZER,
        input ?? domain.canonicalInput((now + 1000).toString()),
      ),
    ).campaign!;
    const proposal = act(ORGANIZER, () =>
      domain.createProposal(ORGANIZER, c.id),
    ).proposal!;
    act(DAO, () => domain.decideProposal(DAO, proposal.id, "Approved"));
    act(DAO, () =>
      domain.fundSponsor(
        DAO,
        c.id,
        c.terms.legs
          .reduce((n, l) => n + BigInt(l.sponsorAllocation), 0n)
          .toString(),
        c.termsHash,
      ),
    );
    return domain.campaign(c.id);
  }
  function fill(c: Campaign, access = "75000000") {
    for (const [leg, amount] of [
      [0, "400000000"],
      [1, "125000000"],
      [2, access],
    ] as const)
      act(ALICE, () => domain.pledge(ALICE, c.id, leg, amount, c.termsHash));
  }
  return {
    store,
    domain,
    act,
    plan,
    fill,
    advance: (amount = 1000) => {
      now += amount;
    },
    time: () => now,
  };
}

test('escrow beneficiary is rejected before IDs or wallets change; ordinary duplicate recipients keep separate entitlements',()=>{
  const h=harness();try{
    const input=h.domain.canonicalInput((h.time()+1000).toString());input.legs[0].beneficiary='new-beneficiary.testnet';input.legs[1].beneficiary=ESCROW;
    const wallets=h.store.objects('accounts');
    assert.throws(()=>h.domain.publish(ORGANIZER,input),/cannot use the escrow/);
    assert.equal(h.store.object('accounts','new-beneficiary.testnet'),undefined);
    assert.deepEqual(h.store.objects('accounts'),wallets);assert.equal(h.store.get('SELECT value FROM meta WHERE key=?','sequence:campaign'),undefined);
    const valid=h.domain.canonicalInput((h.time()+1000).toString());for(const leg of valid.legs)leg.beneficiary=BENEFICIARIES[0];
    const campaign=h.plan(valid);assert.equal(campaign.id,'1');h.fill(campaign);h.advance();h.act(BOB,()=>h.domain.finalize(BOB,campaign.id));
    const credits=h.domain.campaign(campaign.id).credits.filter(c=>c.kind==='beneficiary');assert.equal(credits.length,3);assert.equal(new Set(credits.map(c=>c.id)).size,3);assert.ok(credits.every(c=>c.recipient===BENEFICIARIES[0]));assert.deepEqual(credits.map(c=>c.available).sort(),['150000000','250000000','600000000']);assert.equal(h.domain.assertInvariants(),true);
  }finally{h.store.close();}
});

test('pending health retains age through delivered-but-unresolved boundary and clears only on resolution',()=>{
  const h=harness();try{const c=h.plan();h.act(ALICE,()=>h.domain.pledge(ALICE,c.id,0,'1',c.termsHash));const credit=h.act(ALICE,()=>h.domain.withdraw(ALICE,c.id,0,'1')).credit!;const attempt=h.act(ALICE,()=>h.domain.claim(ALICE,credit.id)).attempt!;assert.equal(h.domain.pendingHealth().count,1);assert.equal(h.domain.pendingHealth().oldestAgeMs,'0');h.advance(200);assert.equal(h.domain.pendingHealth().oldestAgeMs,'200');h.domain.executeAttempt(attempt.id);assert.equal(h.domain.pendingHealth().count,1);h.domain.resolveAttempt(attempt.id);assert.deepEqual(h.domain.pendingHealth(),{count:0,oldestCreatedAt:null,oldestAgeMs:null});assert.equal(h.domain.assertInvariants(),true);}finally{h.store.close();}
});

test("one missing leg prevents all beneficiary payments and all principal refunds exactly", () => {
  const h = harness();
  try {
    const c = h.plan();
    h.fill(c, "50000000");
    assert.throws(
      () =>
        h.act(ALICE, () =>
          h.domain.claim(ALICE, `${c.id}:beneficiary:${BENEFICIARIES[0]}:0`),
        ),
      { code: "NOT_FOUND" },
    );
    h.advance();
    h.act(BOB, () => h.domain.finalize(BOB, c.id));
    const failed = h.domain.campaign(c.id);
    assert.equal(failed.state, "Failed");
    assert.equal(
      failed.credits.filter((v) => v.kind === "beneficiary").length,
      0,
    );
    assert.equal(failed.accounting.failedPrincipalReserved, "575000000");
    const refund = h.act(ALICE, () =>
      h.domain.materializeRefund(ALICE, c.id),
    ).credit!;
    assert.equal(refund.available, "575000000");
    h.act(ALICE, () => h.domain.materializeRefund(ALICE, c.id));
    assert.equal(h.domain.credit(refund.id).available, "575000000");
    h.act(ALICE, () => h.domain.claim(ALICE, refund.id));
    h.act(BOB, () => h.domain.claim(BOB, `${c.id}:sponsor_refund:${DAO}:-`));
    h.domain.processPending();
    assert.equal(h.domain.wallet(ALICE).balance, "5000000000");
    assert.equal(h.domain.wallet(DAO).balance, "10000000000");
    assert.equal(h.domain.custody().observedTokenBalance, "0");
    assert.equal(h.domain.assertInvariants(), true);
  } finally {
    h.store.close();
  }
});

test("all beneficiary rights allocate together; missing registration fails and retries without affecting others", () => {
  const h = harness();
  try {
    const c = h.plan();
    h.fill(c);
    h.advance();
    h.act(BOB, () => h.domain.finalize(BOB, c.id));
    const succeeded = h.domain.campaign(c.id);
    assert.equal(succeeded.state, "Succeeded");
    assert.deepEqual(
      succeeded.credits.map((v) => v.available).sort(),
      ["150000000", "250000000", "600000000"].sort(),
    );
    for (const credit of succeeded.credits)
      h.act(BOB, () => h.domain.claim(BOB, credit.id));
    h.domain.processPending();
    const equipment = h.domain.credit(
      `${c.id}:beneficiary:${BENEFICIARIES[1]}:1`,
    );
    assert.equal(equipment.available, "250000000");
    assert.equal(equipment.pending, "0");
    assert.equal(h.domain.wallet(BENEFICIARIES[0]).balance, "600000000");
    assert.equal(h.domain.wallet(BENEFICIARIES[2]).balance, "150000000");
    h.act(BENEFICIARIES[1], () =>
      h.domain.registerToken(BENEFICIARIES[1], BENEFICIARIES[1]),
    );
    h.act(BOB, () => h.domain.claim(BOB, equipment.id));
    h.domain.processPending();
    h.domain.processPending();
    assert.equal(h.domain.wallet(BENEFICIARIES[1]).balance, "250000000");
    assert.equal(h.domain.credit(equipment.id).paid, "250000000");
    assert.equal(h.domain.custody().observedTokenBalance, "0");
    assert.throws(() => h.act(BOB, () => h.domain.claim(BOB, equipment.id)), {
      code: "NO_AVAILABLE_CREDIT",
    });
  } finally {
    h.store.close();
  }
});

test("late failed withdrawal callback restores credit, never a pledge or finalization result", () => {
  const h = harness();
  try {
    const c = h.plan();
    h.fill(c);
    const credit = h.act(ALICE, () =>
      h.domain.withdraw(ALICE, c.id, 0, "20000000"),
    ).credit!;
    const attempt = h.act(ALICE, () =>
      h.domain.claim(ALICE, credit.id),
    ).attempt!;
    h.store.transaction(() => {
      const w = h.domain.wallet(ALICE);
      w.registered = false;
      h.domain.saveWallet(w);
    });
    h.advance();
    h.act(BOB, () => h.domain.finalize(BOB, c.id));
    h.domain.executeAttempt(attempt.id);
    h.domain.resolveAttempt(attempt.id);
    assert.equal(h.domain.campaign(c.id).state, "Failed");
    assert.equal(h.domain.campaign(c.id).legs[0].active, "380000000");
    assert.equal(h.domain.credit(credit.id).available, "20000000");
    assert.equal(
      h.act(ALICE, () => h.domain.materializeRefund(ALICE, c.id)).credit!
        .available,
      "580000000",
    );
    assert.equal(h.domain.assertInvariants(), true);
  } finally {
    h.store.close();
  }
});

test("new withdrawal credit while a payment is pending survives additive failure restoration", () => {
  const h = harness();
  try {
    const c = h.plan();
    h.act(ALICE, () =>
      h.domain.pledge(ALICE, c.id, 0, "100000000", c.termsHash),
    );
    const credit = h.act(ALICE, () =>
      h.domain.withdraw(ALICE, c.id, 0, "20000000"),
    ).credit!;
    const a = h.act(ALICE, () => h.domain.claim(ALICE, credit.id)).attempt!;
    h.act(ALICE, () => h.domain.withdraw(ALICE, c.id, 0, "10000000"));
    h.store.transaction(() => {
      const w = h.domain.wallet(ALICE);
      w.registered = false;
      h.domain.saveWallet(w);
    });
    h.domain.executeAttempt(a.id);
    h.domain.resolveAttempt(a.id);
    assert.equal(h.domain.credit(credit.id).available, "30000000");
    assert.equal(h.domain.campaign(c.id).legs[0].active, "70000000");
    assert.equal(h.domain.assertInvariants(), true);
  } finally {
    h.store.close();
  }
});

for (const crashStage of ["reserved", "executed", "resolved"] as const)
  test(`restart after ${crashStage} transfer boundary cannot pay twice`, () => {
    const dir = mkdtempSync(join(tmpdir(), "alltogether-crash-")),
      path = join(dir, "ledger.sqlite");
    const h = harness(path);
    let second: Store | undefined;
    try {
      const c = h.plan();
      h.act(ALICE, () =>
        h.domain.pledge(ALICE, c.id, 0, "100000000", c.termsHash),
      );
      const credit = h.act(ALICE, () =>
        h.domain.withdraw(ALICE, c.id, 0, "100000000"),
      ).credit!;
      const a = h.act(ALICE, () => h.domain.claim(ALICE, credit.id)).attempt!;
      if (crashStage !== "reserved") h.domain.executeAttempt(a.id);
      if (crashStage === "executed")
        assert.equal(h.domain.custody().tokenReconciliation, "InFlight");
      if (crashStage === "resolved") h.domain.resolveAttempt(a.id);
      h.store.close();
      second = new Store(path);
      const recovered = new Domain(second, { clock: () => h.time() });
      assert.equal(recovered.seedAccounts(), false);
      recovered.processPending();
      recovered.processPending();
      assert.equal(recovered.wallet(ALICE).balance, "5000000000");
      assert.equal(recovered.credit(credit.id).paid, "100000000");
      assert.equal(recovered.credit(credit.id).available, "0");
      assert.equal(recovered.assertInvariants(), true);
    } finally {
      h.store.close();
      second?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

test("deadline equality, overfill, sponsor authorization and immutable odd-unit match conserve funds", () => {
  const h = harness();
  try {
    const input: PublishInput = {
      title: "Odd units",
      summary: "Exact whole base units",
      detail: "",
      deadlineMs: (h.time() + 1000).toString(),
      legs: [
        {
          title: "Single necessity",
          purpose: "Exact units",
          beneficiary: BENEFICIARIES[0],
          budget: "101",
          declaredSponsorCap: "60",
        },
      ],
    };
    const c = h.plan(input);
    assert.equal(c.terms.legs[0].sponsorAllocation, "50");
    assert.equal(c.terms.legs[0].communityTarget, "51");
    assert.throws(
      () =>
        h.act(ALICE, () =>
          h.domain.fundSponsor(ALICE, c.id, "50", c.termsHash),
        ),
      { code: "WRONG_ACTOR" },
    );
    assert.throws(
      () =>
        h.act(ALICE, () => h.domain.pledge(ALICE, c.id, 0, "52", c.termsHash)),
      { code: "LEG_FULL" },
    );
    assert.equal(h.domain.wallet(ALICE).balance, "5000000000");
    h.act(ALICE, () => h.domain.pledge(ALICE, c.id, 0, "51", c.termsHash));
    assert.throws(() => h.act(BOB, () => h.domain.finalize(BOB, c.id)), {
      code: "DEADLINE_NOT_REACHED",
    });
    h.advance();
    assert.throws(
      () => h.act(ALICE, () => h.domain.withdraw(ALICE, c.id, 0, "1")),
      { code: "DEADLINE_REACHED" },
    );
    h.act(BOB, () => h.domain.finalize(BOB, c.id));
    h.act(BOB, () => h.domain.finalize(BOB, c.id));
    assert.equal(h.domain.campaign(c.id).credits[0].available, "101");
    assert.equal(h.domain.campaign(c.id).termsHash, c.termsHash);
  } finally {
    h.store.close();
  }
});

test("walkthrough fixture seeding is explicit, durable and idempotent", () => {
  const h = harness();
  try {
    const seeded = h.act(ORGANIZER, () => h.domain.seedWalkthrough(ORGANIZER));
    assert.equal(seeded.seeded, true);
    assert.equal(seeded.campaignIds.length, 3);
    const before = h.domain.wallet(ALICE).balance;
    const repeated = h.act(ORGANIZER, () =>
      h.domain.seedWalkthrough(ORGANIZER),
    );
    assert.equal(repeated.seeded, false);
    assert.equal(h.domain.wallet(ALICE).balance, before);
    assert.deepEqual(
      seeded.campaignIds.map((id) => h.domain.campaign(id).state),
      ["Failed", "Succeeded", "AwaitingFunding"],
    );
    assert.ok(seeded.campaignIds.every((id) => h.domain.campaign(id).fixture));
    assert.equal(h.domain.assertInvariants(), true);
  } finally {
    h.store.close();
  }
});

test("lifetime admission cap remains after withdrawal and failed new admission is fully rolled back", () => {
  const h = harness();
  try {
    const c = h.plan({
      title: "Bounded participation",
      summary: "Lifetime participation remains bounded",
      detail: "",
      deadlineMs: (h.time() + 1000).toString(),
      legs: [
        {
          title: "Venue",
          purpose: "A bounded plan",
          beneficiary: BENEFICIARIES[0],
          budget: "1000",
          declaredSponsorCap: "100",
        },
      ],
    });
    h.store.transaction(() => {
      for (let i = 0; i < 129; i++)
        h.domain.saveWallet({
          id: `person-${i}.alltogether.testnet`,
          roles: ["contributor"],
          registered: true,
          balance: "100",
        });
      const current = h.domain.custodyRow();
      h.store.run(
        "UPDATE custody SET fixture_issued=? WHERE id=1",
        (BigInt(current.fixture_issued) + 12900n).toString(),
      );
    });
    for (let i = 0; i < 128; i++) {
      const actor = `person-${i}.alltogether.testnet`;
      h.act(actor, () => h.domain.pledge(actor, c.id, 0, "1", c.termsHash));
    }
    const first = "person-0.alltogether.testnet";
    h.act(first, () => h.domain.withdraw(first, c.id, 0, "1"));
    assert.throws(
      () =>
        h.act("person-128.alltogether.testnet", () =>
          h.domain.pledge(
            "person-128.alltogether.testnet",
            c.id,
            0,
            "1",
            c.termsHash,
          ),
        ),
      { code: "PARTICIPANT_LIMIT" },
    );
    assert.equal(
      h.domain.wallet("person-128.alltogether.testnet").balance,
      "100",
    );
    assert.equal(h.domain.campaign(c.id).participantCount, 128);
    h.act(first, () => h.domain.pledge(first, c.id, 0, "1", c.termsHash));
    h.advance();
    h.act(BOB, () => h.domain.finalize(BOB, c.id));
    assert.equal(h.domain.assertInvariants(), true);
  } finally {
    h.store.close();
  }
});

test("generated interleavings across two plans conserve independent funding and claims", () => {
  const h = harness();
  try {
    const plans = [0, 1].map((index) =>
      h.plan({
        title: `Independent ${index}`,
        summary: "Independent earmarked budgets",
        detail: "",
        deadlineMs: (h.time() + 1000).toString(),
        legs: [
          {
            title: "Venue",
            purpose: "One necessary obligation",
            beneficiary: BENEFICIARIES[0],
            budget: "10000000",
            declaredSponsorCap: "2000000",
          },
        ],
      }),
    );
    let rng = 0x123456;
    for (let step = 0; step < 200; step++) {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      const c = plans[rng % 2],
        actor = rng & 4 ? ALICE : BOB;
      try {
        switch ((rng >>> 8) % 5) {
          case 0:
            h.act(actor, () =>
              h.domain.pledge(actor, c.id, 0, "100000", c.termsHash),
            );
            break;
          case 1:
            h.act(actor, () => h.domain.withdraw(actor, c.id, 0, "100000"));
            break;
          case 2:
            h.act(actor, () =>
              h.domain.claim(actor, `${c.id}:withdrawal:${actor}:-`),
            );
            break;
          case 3: {
            const pending = h.domain
              .campaign(c.id)
              .attempts.find((a) => a.status === "Pending");
            if (pending) h.domain.executeAttempt(pending.id);
            break;
          }
          case 4: {
            const pending = h.domain
              .campaign(c.id)
              .attempts.find((a) => a.status === "Pending");
            if (pending) h.domain.resolveAttempt(pending.id);
            break;
          }
        }
      } catch (error) {
        assert.ok(
          [
            "INSUFFICIENT_BALANCE",
            "NOT_FOUND",
            "TRANSFER_PENDING",
            "NO_AVAILABLE_CREDIT",
            "LEG_FULL",
          ].includes((error as Error & { code: string }).code),
        );
      }
      assert.equal(h.domain.assertInvariants(), true);
    }
    h.advance();
    for (const c of plans) {
      h.act(ORGANIZER, () => h.domain.finalize(ORGANIZER, c.id));
      for (const actor of [ALICE, BOB])
        h.act(actor, () => h.domain.materializeRefund(actor, c.id));
    }
    h.domain.processPending();
    assert.equal(h.domain.assertInvariants(), true);
    assert.notEqual(plans[0].termsHash, plans[1].termsHash);
  } finally {
    h.store.close();
  }
});

test("settlement exports retain every retry after the 50-attempt view limit", () => {
  const h = harness();
  try {
    const c = h.plan();
    h.act(ALICE, () => h.domain.pledge(ALICE, c.id, 0, "20000000", c.termsHash));
    const credit = h.act(ALICE, () => h.domain.withdraw(ALICE, c.id, 0, "20000000")).credit!;
    h.store.transaction(() => {
      const wallet = h.domain.wallet(ALICE);
      wallet.registered = false;
      h.domain.saveWallet(wallet);
    });
    for (let retry = 0; retry < 51; retry++) {
      h.act(ALICE, () => h.domain.claim(ALICE, credit.id));
      h.domain.processPending();
    }
    h.act(ALICE, () => h.domain.registerToken(ALICE, ALICE));
    h.act(ALICE, () => h.domain.claim(ALICE, credit.id));
    h.domain.processPending();

    const bounded = h.domain.campaign(c.id);
    const complete = h.domain.attemptHistory(c.id);
    assert.equal(bounded.attempts.length, 50);
    assert.equal(complete.length, 52);
    assert.equal(complete[0].status, "Failed");
    assert.equal(complete[51].status, "Succeeded");
    assert.equal(bounded.attempts.some(attempt => attempt.id === complete[0].id), false);

    const record = settlementRecord(h.domain, c.id);
    assert.deepEqual(record.campaign.attempts.map(attempt => attempt.id), complete.map(attempt => attempt.id));
    const csv = campaignCsv(h.domain, c.id);
    assert.equal(csv.split("\r\n").filter(row => row.includes(',"transfer",')).length, 52);
    assert.ok(csv.includes(complete[0].resultEvidence!.reference));
    assert.ok(csv.includes(complete[51].resultEvidence!.reference));
    assert.equal(h.domain.credit(credit.id).paid, "20000000");
    assert.equal(h.domain.assertInvariants(), true);
  } finally {
    h.store.close();
  }
});

test("publication limits match Rust Unicode-codepoint boundaries and reject empty summaries", () => {
  const h = harness();
  try {
    const valid = h.domain.canonicalInput((h.time() + 1000).toString());
    valid.title = "🛠".repeat(80);
    valid.summary = "界".repeat(500);
    valid.detail = "🧩".repeat(2000);
    valid.legs[0].title = "🔧".repeat(60);
    valid.legs[0].purpose = "界".repeat(240);
    const published = h.act(ORGANIZER, () => h.domain.publish(ORGANIZER, valid)).campaign!;
    assert.equal(Array.from(published.terms.title).length, 80);
    assert.equal(Array.from(published.terms.detail).length, 2000);

    const invalid = [
      { ...structuredClone(valid), title: "🛠".repeat(81) },
      { ...structuredClone(valid), summary: "界".repeat(501) },
      { ...structuredClone(valid), summary: "" },
      { ...structuredClone(valid), summary: "   " },
      { ...structuredClone(valid), detail: "🧩".repeat(2001) },
    ];
    const longLeg = structuredClone(valid);
    longLeg.legs[0].title = "🔧".repeat(61);
    const longPurpose = structuredClone(valid);
    longPurpose.legs[0].purpose = "界".repeat(241);
    invalid.push(longLeg, longPurpose);
    for (const input of invalid) {
      assert.throws(() => h.act(ORGANIZER, () => h.domain.publish(ORGANIZER, input)), { code: "VALIDATION_ERROR" });
    }
    const emptyOptional = structuredClone(valid);
    emptyOptional.detail = "";
    emptyOptional.legs[0].purpose = "";
    const optional = h.act(ORGANIZER, () => h.domain.publish(ORGANIZER, emptyOptional)).campaign!;
    assert.equal(optional.terms.detail, "");
    assert.equal(optional.terms.legs[0].purpose, "");
    assert.equal(h.domain.assertInvariants(), true);
  } finally {
    h.store.close();
  }
});
