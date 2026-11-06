import { randomUUID } from 'node:crypto';
const base = process.env.ALLTOGETHER_URL || 'http://127.0.0.1:8787';
const response = await fetch(`${base}/api/demo/seed`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-Actor': 'organizer.alltogether.testnet', 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({ scenario: process.argv[2] || 'walkthrough' }),
});
const result = await response.json();
if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
console.log(JSON.stringify({ mode: result.source.mode, ...result.data }, null, 2));
