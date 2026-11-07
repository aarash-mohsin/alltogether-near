// Records the live state and history into site/public/snapshot.json, the hosted page's fallback
// when the public RPC or transaction API is unreachable. Read-only.
import {mkdirSync,writeFileSync} from 'node:fs';
import {readLive} from '../shared/live.ts';
const state=await readLive();
if(state.history_source==='unavailable')throw new Error(`History unavailable: ${state.history_error}`);
mkdirSync('site/public',{recursive:true});
writeFileSync('site/public/snapshot.json',JSON.stringify(state,null,1)+'\n');
console.log(`snapshot: ${state.plans.length} plans, ${state.events.length} events, observed ${state.observed_at}`);
