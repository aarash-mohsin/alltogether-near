import type { Domain } from './domain.ts';
export interface WorkerHealth {enabled:boolean;running:boolean;startedAt:string;lastPollAt:string|null;lastSuccessfulPollAt:string|null;lastError:string|null;lastProcessedCount:number;}
export type WorkerHandle=(()=>void)&{health:()=>WorkerHealth};
export function startWorker(domain:Pick<Domain,'processPending'>,intervalMs=300):WorkerHandle {
  const state:WorkerHealth={enabled:true,running:false,startedAt:Date.now().toString(),lastPollAt:null,lastSuccessfulPollAt:null,lastError:null,lastProcessedCount:0};
  const sweep=()=>{if(state.running||!state.enabled)return;state.running=true;state.lastPollAt=Date.now().toString();try{state.lastProcessedCount=domain.processPending();state.lastSuccessfulPollAt=Date.now().toString();state.lastError=null;}catch(error){state.lastError=error instanceof Error?error.message:'Unknown transfer failure';console.error(JSON.stringify({event:'worker_error',message:state.lastError}));}finally{state.running=false;}};
  sweep();const timer=setInterval(sweep,intervalMs);timer.unref();
  const stop=(()=>{state.enabled=false;clearInterval(timer);}) as WorkerHandle;
  stop.health=()=>({...state});return stop;
}
