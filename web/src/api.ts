import type { AllTogetherClient } from '../../shared/client.ts';
import type { Account, Activity, Campaign, CommandContext, CommandResult, Config, Custody, Envelope, Page, PublishInput } from '../../shared/types.ts';
import {announceOperations,journal,type PendingOperation} from './operations.ts';

function query(options?: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options ?? {})) if (value !== undefined && value !== '') params.set(key, String(value));
  return params.size ? `?${params}` : '';
}

const inFlight=new Map<string,Promise<Envelope<unknown>>>();
async function execute<T>(path:string,context?:CommandContext,body?:unknown):Promise<Envelope<T>>{
  const operation=context?journal().begin(context.actor,path,body??{},context.idempotencyKey):undefined;
  if(operation)announceOperations();
  const response = await fetch(`/api${path}`, {
    method: context ? 'POST' : 'GET',
    headers: context ? { 'Content-Type': 'application/json', 'X-Demo-Actor': context.actor, 'Idempotency-Key': operation!.id } : { Accept: 'application/json' },
    body: context ? JSON.stringify(body ?? {}) : undefined,
    signal:AbortSignal.timeout(context?20000:12000),
  });
  const result = await response.json() as Envelope<T>;
  if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') throw new Error('The service returned an invalid response. Refresh before retrying.');
  if(operation&&(result.ok||response.status<500&&response.status!==408)){journal().resolve(operation.id,operation.actor);announceOperations();}
  return result;
}
async function request<T>(path:string,context?:CommandContext,body?:unknown):Promise<Envelope<T>>{if(!context)return execute<T>(path);const entry=journal().begin(context.actor,path,body??{},context.idempotencyKey),identity=entry.actor+':'+entry.id;const existing=inFlight.get(identity);if(existing)return existing as Promise<Envelope<T>>;const pending=execute<T>(path,{actor:entry.actor,idempotencyKey:entry.id},body);inFlight.set(identity,pending as Promise<Envelope<unknown>>);try{return await pending;}finally{inFlight.delete(identity);}}
export function pendingOperations(actor?:string){return journal().list(actor);}
export function resumeOperation(operation:PendingOperation):Promise<Envelope<CommandResult>>{return request(operation.path,{actor:operation.actor,idempotencyKey:operation.id},operation.body);}

export const api: AllTogetherClient = {
  config: () => request<Config>('/config'),
  campaigns: options => request<Page<Campaign>>(`/campaigns${query(options)}`),
  campaign: id => request<Campaign>(`/campaigns/${encodeURIComponent(id)}`),
  account: id => request<Account>(`/accounts/${encodeURIComponent(id)}`),
  custody: id => request<Custody>(id ? `/campaigns/${encodeURIComponent(id)}/custody` : '/custody'),
  activity: (id, options) => request<Page<Activity>>(`/campaigns/${encodeURIComponent(id)}/activity${query(options)}`),
  publish: (input: PublishInput, context) => request<CommandResult>('/campaigns', context, input),
  proposal: (id, context) => request<CommandResult>(`/campaigns/${encodeURIComponent(id)}/sponsor-proposal`, context),
  decideProposal: (id, decision, context) => request<CommandResult>(`/demo/proposals/${encodeURIComponent(id)}/decision`, context, { decision }),
  fundSponsor: (id, amount, termsHash, context) => request<CommandResult>(`/demo/campaigns/${encodeURIComponent(id)}/fund`, context, { amount, termsHash }),
  pledge: (id, legId, amount, termsHash, context) => request<CommandResult>(`/campaigns/${encodeURIComponent(id)}/pledges`, context, { legId, amount, termsHash }),
  withdraw: (id, legId, amount, context) => request<CommandResult>(`/campaigns/${encodeURIComponent(id)}/withdrawals`, context, { legId, amount }),
  finalize: (id, context) => request<CommandResult>(`/campaigns/${encodeURIComponent(id)}/finalize`, context),
  materializeRefund: (id, context) => request<CommandResult>(`/campaigns/${encodeURIComponent(id)}/refunds`, context),
  claim: (id, context) => request<CommandResult>(`/credits/${encodeURIComponent(id)}/claims`, context),
  registerToken: (accountId, context) => request<CommandResult>('/demo/register-token', context, { accountId }),
  seed: (scenario, context) => request<{ campaignIds: string[]; seeded: boolean }>('/demo/seed', context, { scenario }),
  exportCampaign: async (id, format) => {
    const response = await fetch(`/api/campaigns/${encodeURIComponent(id)}/export?format=${format}`,{signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error('The settlement record could not be downloaded.');
    return response.blob();
  },
};
