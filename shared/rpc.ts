// Explicitly approved public testnet providers. This is not a user-supplied URL.
export const TESTNET_RPC = 'https://testnet-rpc.intea.rs';
export const TESTNET_RPCS: readonly string[] = [TESTNET_RPC, 'https://test.rpc.fastnear.com'];
export class RpcError extends Error {
  remote: unknown;
  constructor(remote: unknown) { super('The public testnet RPC returned an error.'); this.remote=remote; }
}
export function createRpcTransport(options: { endpoint?: string; fetcher?: typeof fetch; pause?: (ms:number)=>Promise<void>; spacingMs?:number } = {}) {
  const endpoint = options.endpoint ?? TESTNET_RPC;
  if (!TESTNET_RPCS.includes(endpoint)) throw new Error('Only the fixed public testnet sources are supported.');
  const fetcher = options.fetcher ?? fetch;
  const pause = options.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let tail: Promise<unknown> = Promise.resolve(), queued = 0;
  return async (method:string, params:unknown):Promise<any> => {
    if(!['status','block','query','gas_price','tx'].includes(method)) throw new Error('This transport permits read-only RPC methods.');
    if (queued >= 128) throw new Error('The public testnet read queue is full. Retry shortly.');
    queued++;
    const task = tail.then(async () => {
      // Serialize reads and pace all attempts, including retries. No signed writes use this transport.
      const payload = JSON.stringify({jsonrpc:'2.0',id:'alltogether-read-only',method,params});
      let retryAfter=0;
      for (let attempt=0; attempt<4; attempt++) {
        await pause(attempt ? Math.max(retryAfter,Math.min(4000, 500 * 2 ** (attempt-1))) : options.spacingMs ?? 250);
        let response:Response;
        try { response = await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:payload,signal:AbortSignal.timeout(8000),redirect:'error'}); }
        catch(error) { if(attempt<3) continue; throw error; }
        const raw = await response.text();
        const wait=Number(response.headers.get('Retry-After'));
        retryAfter=Number.isFinite(wait)&&wait>0?Math.min(10_000,wait*1000):0;
        if(raw.length>8*1024*1024) throw new Error('The RPC response exceeded its bound.');
        let body:any; try {body=JSON.parse(raw);} catch { if((response.status===429||response.status>=500)&&attempt<3) continue; throw new Error('The RPC returned invalid JSON.'); }
        if(response.status===429||response.status>=500||body?.error?.code===-429) {
          if(attempt<3) continue;
          throw new Error('The public testnet RPC is rate limited or unavailable. Keep pending operations and retry later.');
        }
        if(!response.ok) throw new Error('The public testnet RPC is unavailable.');
        if(body?.error) throw new RpcError(body.error);
        if(body?.result===undefined) throw new Error('The RPC returned no result.');
        return body.result;
      }
    });
    tail=task.catch(()=>{});
    try{return await task;}finally{queued--;}
  };
}
