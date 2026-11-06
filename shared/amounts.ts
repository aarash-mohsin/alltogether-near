export const U128_MAX = (1n << 128n) - 1n;

export function atomic(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('Amount must be an unsigned integer string.');
  const amount = BigInt(value);
  if (amount > U128_MAX) throw new Error('Amount exceeds u128.');
  return amount;
}

export function checkedAdd(a: bigint, b: bigint): bigint {
  const value = a + b;
  if (a < 0n || b < 0n || value > U128_MAX) throw new Error('Amount overflow.');
  return value;
}

export function checkedSub(a: bigint, b: bigint): bigint {
  if (b < 0n || a < b || a > U128_MAX) throw new Error('Insufficient amount.');
  return a - b;
}

export function parseDisplayAmount(text: string, decimals = 6): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 24) throw new Error('Invalid token decimals.');
  const value = text.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) throw new Error('Enter a positive decimal amount without commas or exponents.');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const amount = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (amount > U128_MAX) throw new Error('Amount exceeds u128.');
  return amount.toString();
}

export function formatAmount(value: string, decimals = 6): string {
  const amount = atomic(value);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 24) throw new Error('Invalid token decimals.');
  const factor = 10n ** BigInt(decimals);
  const whole = (amount / factor).toString();
  const fraction = decimals ? (amount % factor).toString().padStart(decimals, '0').replace(/0+$/, '') : '';
  return fraction ? `${whole}.${fraction}` : whole;
}

export function deriveLeg(budget: string, declaredSponsorCap: string): { sponsorAllocation: string; communityTarget: string } {
  const total = atomic(budget);
  const cap = atomic(declaredSponsorCap);
  if (total < 2n || cap === 0n || cap > total) throw new Error('Budget must be at least two base units and match cap must be positive and no larger than the budget.');
  const sponsor = cap < total / 2n ? cap : total / 2n;
  return { sponsorAllocation: sponsor.toString(), communityTarget: (total - sponsor).toString() };
}

export function isAccountId(value: string): boolean {
  return value.length >= 2 && value.length <= 64 && /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/.test(value);
}
