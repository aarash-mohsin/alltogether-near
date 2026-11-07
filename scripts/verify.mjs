// npm run verify: read the live AllTogether deployment over public NEAR testnet RPC and print one PASS/FAIL line per check.
// Read-only: no wallet, no keys. The same code (shared/live.ts) runs in the browser on the hosted page.
import {readFileSync} from 'node:fs';
import {readLive,runChecks} from '../shared/live.ts';
const json=process.argv.includes('--json');
const config=JSON.parse(readFileSync('docs/testnet-config.json','utf8'));
const load=path=>{try{return new Uint8Array(readFileSync(path));}catch{return null;}};
const state=await readLive();
const checks=await runChecks(state,{escrowWasm:load(config.artifacts.escrow.path),tokenWasm:load(config.artifacts.token.path),wasm_source:'this repository'});
const failed=checks.filter(c=>c.status==='FAIL').length,passed=checks.filter(c=>c.status==='PASS').length;
if(json)console.log(JSON.stringify({observed_at:state.observed_at,passed,failed,checks},null,2));
else{
  console.log(`AllTogether live checks, ${state.observed_at}`);
  console.log(`escrow escrow.at-rel-owner-mw4f9xmq.testnet · DAO ${state.escrow.config.dao_id} · ${state.plans.length} plans · ${state.events.length} events\n`);
  for(const c of checks){console.log(`${c.status.padEnd(4)}  ${c.title}`);console.log(`      ${c.detail}`);for(const tx of c.txs.slice(0,3))console.log(`      tx ${tx}`);}
  console.log(`\n${passed} passed, ${failed} failed`);
}
process.exit(failed?1:0);
