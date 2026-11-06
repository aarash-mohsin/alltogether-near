import type { Account, Activity, Campaign, CommandContext, CommandResult, Config, Custody, Envelope, Page, PublishInput } from './types.ts';

export interface AllTogetherClient {
  config(): Promise<Envelope<Config>>;
  campaigns(options?: { state?: string; cursor?: string; limit?: number }): Promise<Envelope<Page<Campaign>>>;
  campaign(id: string): Promise<Envelope<Campaign>>;
  account(id: string): Promise<Envelope<Account>>;
  custody(campaignId?: string): Promise<Envelope<Custody>>;
  activity(id: string, options?: { cursor?: string; limit?: number }): Promise<Envelope<Page<Activity>>>;
  publish(input: PublishInput, context: CommandContext): Promise<Envelope<CommandResult>>;
  proposal(id: string, context: CommandContext): Promise<Envelope<CommandResult>>;
  decideProposal(id: string, decision: 'Approved' | 'Rejected', context: CommandContext): Promise<Envelope<CommandResult>>;
  fundSponsor(id: string, amount: string, termsHash: string, context: CommandContext): Promise<Envelope<CommandResult>>;
  pledge(id: string, legId: number, amount: string, termsHash: string, context: CommandContext): Promise<Envelope<CommandResult>>;
  withdraw(id: string, legId: number, amount: string, context: CommandContext): Promise<Envelope<CommandResult>>;
  finalize(id: string, context: CommandContext): Promise<Envelope<CommandResult>>;
  materializeRefund(id: string, context: CommandContext): Promise<Envelope<CommandResult>>;
  claim(creditId: string, context: CommandContext): Promise<Envelope<CommandResult>>;
  registerToken(accountId: string, context: CommandContext): Promise<Envelope<CommandResult>>;
  seed(scenario: 'accounts' | 'walkthrough', context: CommandContext): Promise<Envelope<{campaignIds: string[];seeded: boolean}>>;
  exportCampaign(id: string, format: 'json' | 'csv'): Promise<Blob>;
}
