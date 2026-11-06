import test from 'node:test';
import assert from 'node:assert/strict';
import {createRpcTransport,RpcError} from '../../shared/rpc.ts';
test('RPC reads serialize and retry HTTP/JSON throttling with identical payloads and bounded waits',async()=>{
  const calls:string[]=[],pauses:number[]=[];let active=0,max=0;
  const rpc=createRpcTransport({pause:async ms=>{pauses.push(ms);},fetcher:(async(_url,init)=>{
    active++;max=Math.max(max,active);calls.push(String(init?.body));await Promise.resolve();active--;
    if(calls.length===1)return new Response('busy',{status:429,headers:{'Retry-After':'1'}});
    if(calls.length===2)return Response.json({error:{code:-429,message:'rate limit'}});
    return Response.json({result:{ok:true}});
  }) as typeof fetch});
  const results=await Promise.all([rpc('query',{x:1}),rpc('block',{finality:'final'})]);
  assert.equal(max,1);assert.equal(calls.length,4);assert.equal(calls[0],calls[1]);assert.equal(calls[1],calls[2]);
  assert.deepEqual(pauses,[250,1000,1000,250]);assert.deepEqual(results,[{ok:true},{ok:true}]);
});
test('RPC has bounded failure, preserves contract errors and refuses arbitrary providers or writes',async()=>{
  assert.throws(()=>createRpcTransport({endpoint:'http://127.0.0.1:1'}),/fixed public testnet/);
  let attempts=0;const throttled=createRpcTransport({pause:async()=>{},fetcher:(async()=>{attempts++;return Response.json({error:{code:-429}});}) as typeof fetch});
  await assert.rejects(()=>throttled('query',{}),/rate limited/);assert.equal(attempts,4);
  await assert.rejects(()=>throttled('broadcast_tx_commit',{}),/read-only/);assert.equal(attempts,4);
  const error=createRpcTransport({pause:async()=>{},fetcher:(async()=>Response.json({error:{code:-32000,data:'MethodNotFound'}})) as typeof fetch});
  await assert.rejects(()=>error('query',{}),e=>e instanceof RpcError&&JSON.stringify(e.remote).includes('MethodNotFound'));
});
