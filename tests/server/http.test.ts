import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApplication } from "../../server/http.ts";
import {
  ORGANIZER,
  DAO,
  ALICE,
  BOB,
  BENEFICIARIES,
} from "../../server/domain.ts";
import { csvCell } from "../../server/export.ts";

test("HTTP idempotency, simultaneous final slot, origin guard and exports exercise the real ledger", async () => {
  let now = 1800000000000,
    seq = 0;
  const app = createApplication({
    dbPath: ":memory:",
    clock: () => now,
    worker: false,
    logger: () => {},
  });
  await new Promise<void>((resolve) =>
    app.server.listen(0, "127.0.0.1", resolve),
  );
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  async function post(
    path: string,
    body: unknown,
    actor = ORGANIZER,
    key = `request-${++seq}`,
    origin?: string,
  ) {
    const res = await fetch(base + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Demo-Actor": actor,
        "Idempotency-Key": key,
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  }
  try {
    const input = {
      title: "HTTP exact plan",
      summary: "An exact HTTP funding target",
      detail: "",
      deadlineMs: (now + 1000).toString(),
      legs: [
        {
          title: "Venue",
          purpose: "One exact target",
          beneficiary: BENEFICIARIES[0],
          budget: "101",
          declaredSponsorCap: "60",
        },
      ],
    };
    const created = await post(
      "/api/campaigns",
      input,
      ORGANIZER,
      "publish-key",
    );
    assert.equal(created.status, 201);
    const c = created.body.data.campaign;
    assert.deepEqual(
      await post("/api/campaigns", input, ORGANIZER, "publish-key"),
      created,
    );
    const conflict = await post(
      "/api/campaigns",
      { ...input, title: "Changed" },
      ORGANIZER,
      "publish-key",
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, "IDEMPOTENCY_CONFLICT");
    const proposal = await post(`/api/campaigns/${c.id}/sponsor-proposal`, {});
    assert.equal(proposal.status, 200);
    await post(
      `/api/demo/proposals/${proposal.body.data.proposal.id}/decision`,
      { decision: "Approved" },
      DAO,
    );
    assert.equal(app.domain.campaign(c.id).state, "AwaitingFunding");
    await post(
      `/api/demo/campaigns/${c.id}/fund`,
      { amount: "50", termsHash: c.termsHash },
      DAO,
    );
    const results = await Promise.all([
      post(
        `/api/campaigns/${c.id}/pledges`,
        { legId: 0, amount: "51", termsHash: c.termsHash },
        ALICE,
      ),
      post(
        `/api/campaigns/${c.id}/pledges`,
        { legId: 0, amount: "51", termsHash: c.termsHash },
        BOB,
      ),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(app.domain.campaign(c.id).legs[0].active, "51");
    const origin = await post(
      `/api/campaigns/${c.id}/finalize`,
      {},
      ORGANIZER,
      "foreign-origin",
      "https://attacker.example",
    );
    assert.equal(origin.status, 403);
    now += 1000;
    const finalized = await post(`/api/campaigns/${c.id}/finalize`, {}, BOB);
    assert.equal(finalized.body.data.campaign.state, "Succeeded");
    const exported = await fetch(
      base + `/api/campaigns/${c.id}/export?format=json`,
    );
    const record = (await exported.json()) as any;
    assert.equal(record.mode, "local");
    assert.equal(record.campaign.credits[0].available, "101");
    assert.ok(record.custody.bookReconciled);
    const csv = await (
      await fetch(base + `/api/campaigns/${c.id}/export?format=csv`)
    ).text();
    assert.match(csv, /local/);
    assert.match(csv, /terms_hash/);
    assert.equal(csvCell("=SUM(A1:A2)"), `"'=SUM(A1:A2)"`);
    assert.equal(csvCell("  =SUM(A1:A2)"), `"'  =SUM(A1:A2)"`);
    assert.equal((await fetch(base + "/api/no-such-route")).status, 404);
    assert.equal(app.domain.assertInvariants(), true);
  } finally {
    await app.close();
  }
});
