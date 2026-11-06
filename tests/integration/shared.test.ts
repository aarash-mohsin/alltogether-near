import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atomic, checkedAdd, deriveLeg, parseDisplayAmount, formatAmount, U128_MAX } from '../../shared/amounts.ts';

test('money conserves exact base units and odd capped matching', () => {
  assert.equal(parseDisplayAmount('1000.000001'), '1000000001');
  assert.equal(formatAmount('1000000001'), '1000.000001');
  assert.deepEqual(deriveLeg('101', '60'), { sponsorAllocation: '50', communityTarget: '51' });
  assert.deepEqual(deriveLeg('600000000', '200000000'), { sponsorAllocation: '200000000', communityTarget: '400000000' });
  for (const value of ['1e3', '-1', '1,000', '0.0000001']) assert.throws(() => parseDisplayAmount(value));
  assert.throws(() => atomic((U128_MAX + 1n).toString()));
  assert.throws(() => checkedAdd(U128_MAX, 1n));
});
