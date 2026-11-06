import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from 'near-api-js';
import { rpc, state, receipt, record } from './near/common.mjs';
const dedicated = JSON.parse(readFileSync(new URL('../.secrets/contracts-root.json', import.meta.url), 'utf8'));
const council = JSON.parse(readFileSync(new URL('../.secrets/demo-root.json', import.meta.url), 'utf8'));
const dao = JSON.parse(readFileSync(new URL('../docs/testnet-dao.json', import.meta.url), 'utf8'));
const provider = new JsonRpcProvider({ url: dao.rpc });
const owner = new Account(dedicated.accountId, provider, KeyPairSigner.fromSecretKey(dedicated.privateKey));
const councilAccount = new Account(council.accountId, provider, KeyPairSigner.fromSecretKey(council.privateKey));
const config = { network: 'testnet', rpc: dao.rpc, daoId: dao.daoId, escrowId: `escrow.${dedicated.accountId}`, tokenId: `testusd.${dedicated.accountId}` };
if ((await rpc('status', [], config)).chain_id !== 'testnet') throw new Error('Only testnet is allowed.');
// Transfer only once; keys/accounts are generated exclusively for this testnet exercise.
const topupFile = new URL('../docs/testnet-native-topup.json', import.meta.url);
if (!existsSync(topupFile)) {
  const outcome = await councilAccount.transfer({ receiverId: dedicated.accountId, amount: 2000000000000000000000000n });
  writeFileSync(topupFile, JSON.stringify({ network: 'testnet', from: council.accountId, to: dedicated.accountId, ...receipt(outcome) }, null, 2));
}
for (const [label, near] of [['escrow', '3'], ['testusd', '1.8'], ['venue', '0.05'], ['equipment', '0.05'], ['access', '0.05']]) {
  const file = new URL(`../.secrets/${label}.json`, import.meta.url);
  let credentials;
  if (existsSync(file)) credentials = JSON.parse(readFileSync(file, 'utf8'));
  else {
    const key = KeyPair.fromRandom('ed25519');
    credentials = { purpose: 'AllTogether generated testnet child only', accountId: `${label}.${dedicated.accountId}`, publicKey: key.getPublicKey().toString(), privateKey: key.toString() };
    writeFileSync(file, JSON.stringify(credentials, null, 2), { mode: 0o600, flag: 'wx' });
  }
  try { await state(credentials.accountId, config); }
  catch (error) {
    if (!String(error.message).includes('UNKNOWN_ACCOUNT')) throw error;
    const [whole, fraction = ''] = near.split('.');
    const amount = BigInt(whole) * 10n ** 24n + BigInt(fraction.padEnd(24, '0') || '0');
    const created = await owner.signAndSendTransaction({ receiverId: credentials.accountId,
      actions: (await import('near-api-js')).actions ? [
        (await import('near-api-js')).actions.createAccount(),
        (await import('near-api-js')).actions.transfer(amount),
        (await import('near-api-js')).actions.addFullAccessKey(KeyPair.fromString(credentials.privateKey).getPublicKey()),
      ] : [], waitUntil: 'FINAL' });
    record(`testnet-create-${label}.json`, { accountId: credentials.accountId, ...receipt(created) });
  }
  console.log(`Confirmed dedicated testnet account ${credentials.accountId}`);
}
const publicDeployment = { ...config, ownerId: dedicated.accountId, councilId: council.accountId,
  beneficiaries: ['venue', 'equipment', 'access'].map(label => `${label}.${dedicated.accountId}`) };
record('testnet-config.json', publicDeployment);
for (const [target, label] of [['token', 'testusd'], ['escrow', 'escrow']]) {
  const current = await state(`${label}.${dedicated.accountId}`, config);
  if (current.code_hash !== '11111111111111111111111111111111') { console.log(`${target} already deployed; preserving state.`); continue; }
  const outcome = spawnSync(process.execPath, ['scripts/near/deploy.mjs', target], { stdio: 'inherit', env: {
    ...process.env, NEAR_NETWORK: 'testnet', NEAR_RPC_URL: config.rpc, NEAR_DAO_ID: config.daoId,
    NEAR_TOKEN_ID: config.tokenId, NEAR_ESCROW_ID: config.escrowId,
    NEAR_TOKEN_OWNER_ID: dedicated.accountId, NEAR_DEPLOY_KEY_FILE: `.secrets/${label}.json`,
  } });
  if (outcome.status !== 0) throw new Error(`${target} deployment stopped; inspect the actual error above.`);
}
console.log('Dedicated testnet token and escrow deployment complete. Public configuration: docs/testnet-config.json');
