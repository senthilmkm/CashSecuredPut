declare function require(moduleName: string): any;
declare const Buffer: {
  from(value: string, encoding?: string): { toString(encoding?: string): string };
  isBuffer(value: unknown): boolean;
};
import {
  FREE_TIER_COPY,
  decideClaim,
  emptyFlags,
  flagsWithSlot,
  mergeFlags,
  shouldNoteExisting,
  slotIsUsed,
} from '../services/freeTierQuota';
import {
  createLiveDeviceCheckClient,
  defaultDeviceCheckLoader,
  loadDeviceCheckNative,
  parseFreeTierBody,
  readDeviceToken,
  requestFreeTier,
} from '../services/deviceCheckApi';
import { FREE_TRADE_USED_KEY, FreeTierCoordinator } from '../services/freeTierCoordinator';
import {
  base64url,
  bitsNeedRepair,
  createAppleDeps,
  createDeviceCheckJwt,
  handleFreeTier,
  isFreeTierRoute,
  normalizeBits,
  normalizePath,
  planBitUpdate,
  postApple,
  readConfig,
  readJsonBody,
  serveFreeTier,
} from '../../gcp-proxy/deviceCheck.js';

const crypto = require('crypto');

export function runFreeTierTests() {
  return runFreeTierTestsAsync();
}

async function runFreeTierTestsAsync() {
  let passed = 0;
  let failed = 0;
  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}`);
      failed++;
    }
  }

  console.log('\n--- Running Free Tier Reservation Tests ---');

  assert(FREE_TIER_COPY.summary.includes('1 saved trade') && FREE_TIER_COPY.summary.includes('1 saved wheel'), 'Free tier summary names both saved limits');
  assert(FREE_TIER_COPY.summary.includes('does not unlock another'), 'Free tier summary says deleting does not unlock another');
  assert(FREE_TIER_COPY.short.includes('3 newest'), 'Short free tier line names the history limit');
  assert(FREE_TIER_COPY.tradeEmptyUsed.includes('already been used'), 'Empty portfolio explains the used trade');
  assert(FREE_TIER_COPY.wheelEmptyUsed.includes('already been used'), 'Empty wheel list explains the used wheel');
  assert(slotIsUsed({ tradeUsed: true, wheelUsed: false }, 'trade') === true, 'Trade slot reads the trade flag');
  assert(slotIsUsed({ tradeUsed: false, wheelUsed: true }, 'wheel') === true, 'Wheel slot reads the wheel flag');
  assert(mergeFlags(emptyFlags(), null).tradeUsed === false, 'Missing remote flags stay unused');
  assert(mergeFlags({ tradeUsed: true, wheelUsed: false }, { tradeUsed: false, wheelUsed: true }).wheelUsed === true, 'Remote use is remembered');
  assert(mergeFlags({ tradeUsed: true, wheelUsed: false }, { tradeUsed: false }).tradeUsed === true, 'A remote false cannot clear a used trade');
  assert(flagsWithSlot(emptyFlags(), 'trade', true).tradeUsed === true, 'Trade flag can be set by itself');
  assert(flagsWithSlot({ tradeUsed: true, wheelUsed: false }, 'wheel', true).tradeUsed === true, 'Wheel flag keeps the trade flag');
  assert(shouldNoteExisting(false, 2) === true, 'Existing free saves are synced');
  assert(shouldNoteExisting(true, 2) === false, 'Pro saves are not marked as free use');
  assert(shouldNoteExisting(false, 0) === false, 'An empty free portfolio does not consume a slot by itself');

  const offline = decideClaim({ isPremium: false, flags: emptyFlags(), slot: 'wheel', deviceCheckAvailable: true, serverResult: { kind: 'unavailable' } });
  assert(offline.ok === false && offline.paywall === false && !!offline.message, 'A failed reservation does not burn the slot or open the paywall');
  const missingServer = decideClaim({ isPremium: false, flags: emptyFlags(), slot: 'trade', deviceCheckAvailable: true, serverResult: null });
  assert(missingServer.message === FREE_TIER_COPY.tradeOffline, 'Missing DeviceCheck result asks the user to reconnect');
  const used = decideClaim({
    isPremium: false,
    flags: emptyFlags(),
    slot: 'trade',
    deviceCheckAvailable: true,
    serverResult: { kind: 'used', tradeUsed: true, wheelUsed: true },
  });
  assert(used.paywall === true && used.nextFlags.wheelUsed === true, 'A used device keeps both slots');
  const reserved = decideClaim({
    isPremium: false,
    flags: { tradeUsed: false, wheelUsed: true },
    slot: 'trade',
    deviceCheckAvailable: true,
    serverResult: { kind: 'ok', tradeUsed: false, wheelUsed: false },
  });
  assert(reserved.ok === true && reserved.nextFlags.tradeUsed === true && reserved.nextFlags.wheelUsed === true, 'A new trade reservation keeps the wheel slot');

  assert(parseFreeTierBody(200, { tradeUsed: true }).kind === 'ok', 'HTTP 200 is a successful reservation');
  assert(parseFreeTierBody(409, {}).kind === 'used', 'HTTP 409 means the device already used the slot');
  assert(parseFreeTierBody(503, null).kind === 'unavailable', 'Any other status is unavailable');
  const emptyOk = parseFreeTierBody(200, null);
  assert(emptyOk.kind === 'ok' && emptyOk.tradeUsed === false, 'A 200 without flags does not invent usage');

  function memoryStorage() {
    const memory: Record<string, string> = {};
    return {
      memory,
      async getItem(key: string) {
        return memory[key] || null;
      },
      async setItem(key: string, value: string) {
        memory[key] = value;
      },
    };
  }

  async function coordinatorWith(api: any, premium = false) {
    const coord = new FreeTierCoordinator(memoryStorage(), api);
    coord.setPremium(premium, false);
    await coord.whenLoaded();
    return coord;
  }

    const localOnly = await coordinatorWith({
      available: async () => false,
      status: async () => { throw new Error('should not status'); },
      claim: async () => { throw new Error('should not claim'); },
    });
    const saved = await localOnly.claim('trade');
    assert(saved.ok === true && localOnly.getFlags().tradeUsed === true, 'Without DeviceCheck the first trade is stored locally');
    const blocked = await localOnly.claim('trade');
    assert(blocked.paywall === true, 'The local flag blocks a second trade without a server');
    const pro = await coordinatorWith({
      available: async () => true,
      status: async () => ({ kind: 'ok', tradeUsed: true, wheelUsed: false }),
      claim: async () => { throw new Error('pro should not claim'); },
    }, true);
    const proSave = await pro.claim('trade');
    assert(proSave.ok === true, 'Pro never waits on the free slot');

    let claimCalls = 0;
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const racing = new FreeTierCoordinator(memoryStorage(), {
      available: async () => true,
      status: async () => ({ kind: 'unavailable' }),
      claim: async () => {
        claimCalls += 1;
        if (claimCalls === 1) {
          await firstGate;
        }
        return { kind: 'ok', tradeUsed: true, wheelUsed: false };
      },
    });
    racing.setPremium(false, false);
    await racing.whenLoaded();
    const first = racing.claim('trade');
    const second = racing.claim('trade');
    for (let i = 0; i < 20 && claimCalls < 1; i += 1) {
      await Promise.resolve();
    }
    assert(claimCalls === 1, 'Two taps share one reservation');
    releaseFirst();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert(firstResult.ok === true && secondResult.paywall === true, 'The second tap sees the slot already reserved');

    const brokenStorage = new FreeTierCoordinator({
      getItem: async () => { throw new Error('disk'); },
      setItem: async () => undefined,
    }, {
      available: async () => { throw new Error('native'); },
      status: async () => ({ kind: 'unavailable' }),
      claim: async () => ({ kind: 'unavailable' }),
    });
    brokenStorage.setPremium(false, false);
    await brokenStorage.whenLoaded();
    assert(brokenStorage.getFlags().tradeUsed === false, 'Storage failure starts from an unused slot');

    const syncApi = {
      calls: 0,
      available: async () => false,
      status: async () => ({ kind: 'unavailable' }),
      claim: async () => {
        syncApi.calls += 1;
        return { kind: 'used', tradeUsed: true, wheelUsed: false };
      },
    };
    const existing = await coordinatorWith(syncApi);
    await existing.noteExisting('wheel', 0);
    assert(syncApi.calls === 0 && existing.getFlags().wheelUsed === false, 'An empty wheel list does not reserve a wheel');
    await existing.noteExisting('trade', 1);
    assert(existing.getFlags().tradeUsed === true, 'An existing trade reserves the local trade slot');

    const remote = await coordinatorWith({
      available: async () => true,
      status: async () => ({ kind: 'ok', tradeUsed: true, wheelUsed: false }),
      claim: async () => ({ kind: 'ok', tradeUsed: true, wheelUsed: false }),
    });
    assert(remote.getFlags().tradeUsed === true, 'A reinstall learns the used trade from DeviceCheck');
    const again = await remote.noteExisting('trade', 1);
    assert(again.tradeUsed === true, 'A synced device does not reserve twice');

    const flaky = {
      calls: 0,
      available: async () => true,
      status: async () => { throw new Error('offline'); },
      claim: async () => {
        flaky.calls += 1;
        return flaky.calls === 1
          ? { kind: 'unavailable' as const }
          : { kind: 'ok' as const, tradeUsed: false, wheelUsed: true };
      },
    };
    const retry = await coordinatorWith(flaky);
    assert(retry.deviceCheckAvailable === true, 'A failed status check keeps DeviceCheck required');
    await retry.noteExisting('wheel', 1);
    assert(retry.getFlags().wheelUsed === true && flaky.calls === 1, 'Offline existing data is remembered locally');
    await retry.noteExisting('wheel', 1);
    assert(flaky.calls === 2, 'The next launch retries the Apple reservation');

    const native = {
      supported: true,
      token: 'abc',
      async isSupported() { return this.supported; },
      async generateToken() { return this.token; },
    };
    assert(await readDeviceToken(null) === null, 'No native module means no token');
    assert(await readDeviceToken({ ...native, isSupported: async () => false, generateToken: async () => 'x' }) === null, 'Unsupported devices do not mint a token');
    assert(await readDeviceToken({ ...native, generateToken: async () => '' }) === null, 'An empty token is ignored');
    assert(await readDeviceToken({ ...native, generateToken: async () => { throw new Error('fail'); } }) === null, 'Token errors are ignored');
    assert(await readDeviceToken(native) === 'abc', 'A supported device returns its token');
    assert(loadDeviceCheckNative(() => native) === native, 'A loader can supply the native module');
    assert(loadDeviceCheckNative(() => { throw new Error('missing'); }) === null, 'A missing native module stays null');
    assert(loadDeviceCheckNative() === null, 'Node has no DeviceCheck module');

    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.endsWith('/status')) {
        return { status: 200, json: async () => ({ tradeUsed: false, wheelUsed: true }) };
      }
      if (url.includes('timeout')) {
        return new Promise(() => undefined);
      }
      return { status: 409, json: async () => { throw new Error('bad json'); } };
    };
    const status = await requestFreeTier({ fetchImpl: fetchImpl as any, baseUrl: 'https://proxy.example/', path: 'status', deviceToken: 't', timeoutMs: 50 });
    assert(status.kind === 'ok' && status.wheelUsed === true, 'Status reads the device bits');
    const claimed = await requestFreeTier({ fetchImpl: fetchImpl as any, baseUrl: 'https://proxy.example', path: 'claim', deviceToken: 't', slot: 'trade', timeoutMs: 50 });
    assert(claimed.kind === 'used', 'A claim conflict is treated as already used');
    const timed = await requestFreeTier({
      fetchImpl: (() => new Promise(() => undefined)) as any,
      baseUrl: 'https://proxy.example',
      path: 'claim',
      deviceToken: 't',
      slot: 'trade',
      timeoutMs: 5,
      schedule: (callback) => { callback(); return 1 as any; },
      cancel: () => undefined,
    });
    assert(timed.kind === 'unavailable', 'A timed out reservation does not grant the slot');
    const thrown = await requestFreeTier({
      fetchImpl: (async () => { throw new Error('network'); }) as any,
      baseUrl: 'https://proxy.example',
      path: 'status',
      deviceToken: 't',
      timeoutMs: 50,
    });
    assert(thrown.kind === 'unavailable', 'A network error does not grant the slot');

    const live = createLiveDeviceCheckClient({ platform: 'android', native, fetchImpl: fetchImpl as any, baseUrl: 'https://proxy.example' });
    assert(await live.available() === false, 'Android does not use DeviceCheck');
    const ios = createLiveDeviceCheckClient({
      platform: 'ios',
      native,
      fetchImpl: fetchImpl as any,
      baseUrl: 'https://proxy.example',
      timeoutMs: 50,
    });
    assert(await ios.available() === true, 'A supported iPhone can reserve a slot');
    const iosStatus = await ios.status();
    assert(iosStatus.kind === 'ok' && iosStatus.wheelUsed === true, 'The live client reads status');
    assert((await ios.claim('trade')).kind === 'used', 'The live client claims a slot');
    const brokenNative = createLiveDeviceCheckClient({
      platform: 'ios',
      native: { isSupported: async () => { throw new Error('nope'); }, generateToken: async () => 'x' },
      fetchImpl: fetchImpl as any,
    });
    assert(await brokenNative.available() === false, 'A broken DeviceCheck module is treated as unavailable');
    const noToken = createLiveDeviceCheckClient({
      platform: 'ios',
      native: { isSupported: async () => true, generateToken: async () => '' },
      fetchImpl: fetchImpl as any,
    });
    assert((await noToken.status()).kind === 'unavailable', 'Status without a token does not call Apple');
    assert((await noToken.claim('wheel')).kind === 'unavailable', 'Claim without a token does not call Apple');

    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const jwt = createDeviceCheckJwt({ teamId: 'TEAMID1234', keyId: 'KEYID12345', privateKey: pem, nowSeconds: 1700000000 });
    const [header, payload, signature] = jwt.split('.');
    const headerJson = JSON.parse(Buffer.from(header, 'base64url').toString());
    const payloadJson = JSON.parse(Buffer.from(payload, 'base64url').toString());
    assert(headerJson.kid === 'KEYID12345' && headerJson.alg === 'ES256', 'DeviceCheck JWT names the key');
    assert(payloadJson.iss === 'TEAMID1234' && payloadJson.iat === 1700000000, 'DeviceCheck JWT names the team');
    const verified = crypto.verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
    assert(verified === true, 'DeviceCheck JWT signature verifies');
    let configThrew = false;
    try { readConfig({}); } catch { configThrew = true; }
    assert(configThrew === true, 'Missing DeviceCheck config fails closed');
    assert(readConfig({ DEVICECHECK_KEY_ID: 'K', DEVICECHECK_TEAM_ID: 'T', DEVICECHECK_AUTH_KEY: pem }).keyId === 'K', 'DeviceCheck config reads the three values');
    assert(normalizeBits(null).bit0 === false && normalizeBits({ bit0: 1, bit1: 0 }).bit0 === true, 'Apple bits coerce to booleans');
    assert(planBitUpdate({ bit0: false, bit1: true }, 'trade').bit1 === true, 'Reserving a trade keeps the wheel bit');
    assert(planBitUpdate({ bit0: true, bit1: false }, 'trade').alreadyUsed === true, 'A set trade bit is already used');
    assert(planBitUpdate({ bit0: false, bit1: true }, 'wheel').alreadyUsed === true, 'A set wheel bit is already used');
    let invalidSlot = false;
    try { planBitUpdate({ bit0: false, bit1: false }, 'other'); } catch { invalidSlot = true; }
    assert(invalidSlot === true, 'An unknown slot is rejected');
    assert(bitsNeedRepair({ bit0: true, bit1: true }, { bit0: false, bit1: true }) === true, 'A dropped bit needs repair');
    assert(bitsNeedRepair({ bit0: true, bit1: false }, { bit0: true, bit1: false }) === false, 'Matching bits do not need repair');
    assert(readJsonBody({ body: { deviceToken: 't' } }).deviceToken === 't', 'Object bodies pass through');
    assert(readJsonBody({ body: '{"deviceToken":"s"}' }).deviceToken === 's', 'String bodies parse');
    assert(Object.keys(readJsonBody({ body: '' })).length === 0, 'An empty body is an empty object');
    let badJson = false;
    try { readJsonBody({ body: '{' }); } catch { badJson = true; }
    assert(badJson === true, 'Broken JSON is rejected');

    const appleCalls: any[] = [];
    const appleFetch = async (url: string, init: any) => {
      appleCalls.push({ url, body: JSON.parse(init.body) });
      if (url.includes('query')) {
        return { ok: true, status: 200, json: async () => ({ bit0: false, bit1: false }), text: async () => '' };
      }
      return { ok: false, status: 500, json: async () => ({}), text: async () => 'nope' };
    };
    let appleThrew = false;
    try {
      await postApple(appleFetch, 'https://api.devicecheck.apple.com/v1/update_two_bits', 'jwt', { device_token: 'tok', bit0: true, bit1: false });
    } catch { appleThrew = true; }
    assert(appleThrew === true && appleCalls[0].body.device_token === 'tok', 'Apple errors include the status and do not hide the request');
    const queryOk = await postApple(async () => ({ ok: true, status: 200, json: async () => { throw new Error('empty'); }, text: async () => '' }), 'https://example.test', 'jwt', { device_token: 'tok' });
    assert(JSON.stringify(queryOk) === '{}', 'An empty Apple body becomes an empty object');

    const deps = createAppleDeps({ DEVICECHECK_KEY_ID: 'KEYID12345', DEVICECHECK_TEAM_ID: 'TEAMID1234', DEVICECHECK_AUTH_KEY: pem }, async (url: string) => {
      if (url.includes('query')) {
        return { ok: true, status: 200, json: async () => ({ bit0: true, bit1: false }), text: async () => '' };
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    }, 1700000000);
    const bits = await deps.queryBits('device-token');
    assert(bits.bit0 === true, 'Query maps Apple bit0 to the trade slot');
    await deps.updateBits('device-token', { bit0: true, bit1: true });

    function mockRes() {
      const res: any = { statusCode: 0, body: null };
      res.status = (code: number) => { res.statusCode = code; return res; };
      res.json = (payload: any) => { res.body = payload; return res; };
      return res;
    }
    async function callTier(path: string, body: any, tierDeps: any, method = 'POST') {
      const res = mockRes();
      await handleFreeTier({ method, body }, res, path, tierDeps);
      return res;
    }
    const denied = await callTier('/free-tier/claim', { deviceToken: 't' }, { queryBits: async () => ({ bit0: false, bit1: false }) }, 'GET');
    assert(denied.statusCode === 405, 'Free tier routes accept POST only');
    const bad = await callTier('/free-tier/status', '{', { queryBits: async () => { throw new Error('no'); } });
    assert(bad.statusCode === 400, 'Broken free tier JSON is a 400');
    const missing = await callTier('/free-tier/status', {}, { queryBits: async () => { throw new Error('no'); } });
    assert(missing.statusCode === 400, 'A missing device token is a 400');
    const badSlot = await callTier('/free-tier/claim', { deviceToken: 't', slot: 'nope' }, { queryBits: async () => { throw new Error('no'); } });
    assert(badSlot.statusCode === 400, 'An unknown slot is a 400 before Apple is called');
    const unknown = await callTier('/free-tier/other', { deviceToken: 't' }, { queryBits: async () => { throw new Error('no'); } });
    assert(unknown.statusCode === 404, 'Unknown free tier paths are a 404');
    const statusRes = await callTier('/free-tier/status', { deviceToken: 't' }, { queryBits: async () => ({ bit0: false, bit1: true }) });
    assert(statusRes.statusCode === 200 && statusRes.body.wheelUsed === true, 'Status returns the saved wheel bit');
    const usedRes = await callTier('/free-tier/claim', { deviceToken: 't', slot: 'trade' }, { queryBits: async () => ({ bit0: true, bit1: false }), updateBits: async () => { throw new Error('should not update'); } });
    assert(usedRes.statusCode === 409, 'Claiming a used trade does not write the bits again');
    let updates = 0;
    const repair = await callTier('/free-tier/claim', { deviceToken: 't', slot: 'wheel' }, {
      queryBits: async () => updates === 0 ? { bit0: true, bit1: false } : { bit0: false, bit1: true },
      updateBits: async () => { updates += 1; },
    });
    assert(repair.statusCode === 200 && updates === 2, 'A dropped trade bit is repaired after a wheel reservation');
    const failedWrite = await callTier('/free-tier/claim', { deviceToken: 't', slot: 'trade' }, {
      queryBits: async () => ({ bit0: false, bit1: false }),
      updateBits: async () => undefined,
    });
    assert(failedWrite.statusCode === 503, 'A reservation that does not stick is retried by the app');
    const down = await callTier('/free-tier/status', { deviceToken: 't' }, { queryBits: async () => { throw new Error('apple down'); } });
    assert(down.statusCode === 503, 'Apple downtime returns 503');

    assert(shouldNoteExisting(true, 2) === false, 'Pro saves are not marked for a free slot');
    assert(shouldNoteExisting(false, 0) === false, 'An empty portfolio is not marked');
    assert(shouldNoteExisting(false, 1) === true, 'An existing free save is marked');
    assert(flagsWithSlot({ tradeUsed: false, wheelUsed: true }, 'trade', false).wheelUsed === true, 'A false trade update keeps the wheel');
    assert(mergeFlags({ tradeUsed: false, wheelUsed: true }, null).wheelUsed === true, 'A missing remote record keeps the local wheel');
    const wheelOffline = decideClaim({
      isPremium: false,
      flags: emptyFlags(),
      slot: 'wheel',
      deviceCheckAvailable: true,
      serverResult: { kind: 'unavailable' },
    });
    assert(wheelOffline.ok === false && wheelOffline.message === FREE_TIER_COPY.wheelOffline, 'A wheel reservation waits for a connection');
    const keptWheel = decideClaim({
      isPremium: false,
      flags: emptyFlags(),
      slot: 'wheel',
      deviceCheckAvailable: true,
      serverResult: { kind: 'ok', tradeUsed: true, wheelUsed: false },
    });
    assert(keptWheel.nextFlags.tradeUsed === true && keptWheel.nextFlags.wheelUsed === true, 'A wheel reservation keeps a used trade');

    const remembered = memoryStorage();
    remembered.memory[FREE_TRADE_USED_KEY] = 'true';
    const rememberedCoord = new FreeTierCoordinator(remembered, {
      available: async () => false,
      status: async () => ({ kind: 'unavailable' }),
      claim: async () => { throw new Error('no'); },
    });
    rememberedCoord.setPremium(false, false);
    await rememberedCoord.whenLoaded();
    assert(rememberedCoord.getFlags().tradeUsed === true, 'A saved trade flag is read back');
    await rememberedCoord.noteExisting('trade', 0);
    assert(rememberedCoord.getFlags().tradeUsed === true, 'An empty list does not refund a used trade');

    let statusWrites = 0;
    const quietStorage = memoryStorage();
    const originalSet = quietStorage.setItem.bind(quietStorage);
    quietStorage.setItem = async (key: string, value: string) => {
      statusWrites += 1;
      return originalSet(key, value);
    };
    const quiet = new FreeTierCoordinator(quietStorage, {
      available: async () => true,
      status: async () => ({ kind: 'ok', tradeUsed: false, wheelUsed: false }),
      claim: async () => ({ kind: 'ok', tradeUsed: false, wheelUsed: true }),
    });
    quiet.setPremium(false, false);
    await quiet.whenLoaded();
    assert(statusWrites === 0 && quiet.getFlags().tradeUsed === false, 'An unused device does not write a local flag');

    const ignoredStatus = await coordinatorWith({
      available: async () => true,
      status: async () => ({ kind: 'used', tradeUsed: true, wheelUsed: false }),
      claim: async () => { throw new Error('offline'); },
    });
    assert(ignoredStatus.getFlags().tradeUsed === false, 'A non-ok status does not mark the slot');
    const failedClaim = await ignoredStatus.claim('trade');
    assert(failedClaim.ok === false && failedClaim.paywall === false && ignoredStatus.getFlags().tradeUsed === false, 'A thrown reservation does not burn the slot');

    const proNotes = await coordinatorWith({
      available: async () => true,
      status: async () => ({ kind: 'ok', tradeUsed: false, wheelUsed: false }),
      claim: async () => { throw new Error('pro note'); },
    }, true);
    const proFlags = await proNotes.noteExisting('trade', 4);
    assert(proFlags.tradeUsed === false, 'Pro history does not reserve a free slot');

    let lateClaims = 0;
    const latePremium = new FreeTierCoordinator(memoryStorage(), {
      available: async () => true,
      status: async () => ({ kind: 'ok', tradeUsed: false, wheelUsed: false }),
      claim: async () => {
        lateClaims += 1;
        return { kind: 'ok', tradeUsed: true, wheelUsed: false };
      },
    });
    const lateNote = latePremium.noteExisting('wheel', 1);
    latePremium.setPremium(true, false);
    const lateFlags = await lateNote;
    assert(lateClaims === 0 && lateFlags.wheelUsed === false, 'A paying user is not charged while Pro status loads');

    const seeded = memoryStorage();
    seeded.memory[FREE_TRADE_USED_KEY] = 'true';
    let seededWrites = 0;
    const seededSet = seeded.setItem.bind(seeded);
    seeded.setItem = async (key: string, value: string) => {
      seededWrites += 1;
      return seededSet(key, value);
    };
    const seededCoord = new FreeTierCoordinator(seeded, {
      available: async () => true,
      status: async () => ({ kind: 'unavailable' }),
      claim: async () => ({ kind: 'ok', tradeUsed: true, wheelUsed: false }),
    });
    seededCoord.setPremium(false, false);
    await seededCoord.whenLoaded();
    await seededCoord.noteExisting('trade', 1);
    assert(seededWrites === 0 && seededCoord.getFlags().tradeUsed === true, 'Syncing a known trade does not write it twice');

    let diskWrites = 0;
    const diskCoord = new FreeTierCoordinator({
      getItem: async () => null,
      setItem: async () => {
        diskWrites += 1;
        throw new Error('full');
      },
    }, {
      available: async () => false,
      status: async () => ({ kind: 'unavailable' }),
      claim: async () => { throw new Error('no server'); },
    });
    diskCoord.setPremium(false, false);
    await diskCoord.whenLoaded();
    let firstRejected = false;
    try { await diskCoord.claim('trade'); } catch { firstRejected = true; }
    const secondAfterDisk = await diskCoord.claim('trade');
    assert(firstRejected && secondAfterDisk.paywall === true && diskWrites === 1, 'A failed local write does not let the next tap reserve twice');

    const flakyNote = await coordinatorWith({
      available: async () => true,
      status: async () => ({ kind: 'unavailable' }),
      claim: async () => { throw new Error('apple'); },
    });
    await flakyNote.noteExisting('wheel', 2);
    assert(flakyNote.getFlags().wheelUsed === true, 'A thrown sync still remembers the wheel locally');

    const originalAbort = globalThis.AbortController;
    delete (globalThis as { AbortController?: typeof AbortController }).AbortController;
    try {
      const noAbort = await requestFreeTier({
        fetchImpl: (async () => ({ status: 200, json: async () => ({ tradeUsed: true, wheelUsed: false }) })) as any,
        baseUrl: 'https://proxy.example',
        path: 'status',
        deviceToken: 't',
        timeoutMs: 1000,
        schedule: () => 1 as any,
        cancel: () => undefined,
      });
      assert(noAbort.kind === 'ok' && noAbort.tradeUsed === true, 'A reservation works without AbortController');
    } finally {
      globalThis.AbortController = originalAbort;
    }

    const fallbackClient = createLiveDeviceCheckClient();
    assert(await fallbackClient.available() === false, 'The default client stays off without DeviceCheck');
    const explicitNative = createLiveDeviceCheckClient({ native: null, baseUrl: 'https://proxy.example' });
    assert(await explicitNative.available() === false, 'A null native module stays off');
    assert(base64url(Buffer.from('ab+c/')) === base64url('ab+c/'), 'Buffer and text tokens use the same encoding');

    const noJson = await postApple(async () => ({ ok: true, status: 200 }), 'https://example.test', 'jwt', { device_token: 'tok' });
    assert(JSON.stringify(noJson) === '{}', 'An Apple response without JSON is empty');
    const oddOk = await postApple(async () => ({ ok: false, status: 200, json: async () => ({ bit0: true, bit1: false }) }), 'https://example.test', 'jwt', { device_token: 'tok' });
    assert(oddOk.bit0 === true, 'A 200 Apple response is accepted');
    let textless = false;
    try {
      await postApple(async () => ({ ok: false, status: 503 }), 'https://example.test', 'jwt', { device_token: 'tok' });
    } catch (error: any) {
      textless = String(error.message).includes('503');
    }
    assert(textless === true, 'An Apple error without a body still reports the status');

    const timedDeps = createAppleDeps({ DEVICECHECK_KEY_ID: 'KEYID12345', DEVICECHECK_TEAM_ID: 'TEAMID1234', DEVICECHECK_AUTH_KEY: pem }, async () => ({ ok: true, status: 200, json: async () => ({ bit0: false, bit1: true }) }));
    const timedBits = await timedDeps.queryBits('device-token');
    assert(timedBits.bit1 === true, 'DeviceCheck accepts the current time when no clock is injected');

    const numericToken = await callTier('/free-tier/status', { deviceToken: 12 }, { queryBits: async () => { throw new Error('no'); } });
    assert(numericToken.statusCode === 400, 'A non-string device token is a 400');
    assert(Object.keys(readJsonBody({ body: '   ' })).length === 0, 'A blank body is an empty object');
    assert(Object.keys(readJsonBody({})).length === 0, 'A missing body is an empty object');

    let cleanUpdates = 0;
    const clean = await callTier('/free-tier/claim', { deviceToken: 't', slot: 'trade' }, {
      queryBits: async () => cleanUpdates === 0 ? { bit0: false, bit1: false } : { bit0: true, bit1: false },
      updateBits: async () => { cleanUpdates += 1; },
    });
    assert(clean.statusCode === 200 && clean.body.tradeUsed === true && cleanUpdates === 1, 'A trade reservation that sticks is not rewritten');

    const usedWheel = await callTier('/free-tier/claim', { deviceToken: 't', slot: 'wheel' }, {
      queryBits: async () => ({ bit0: false, bit1: true }),
      updateBits: async () => { throw new Error('should not update'); },
    });
    assert(usedWheel.statusCode === 409, 'Claiming a used wheel does not write the bits again');

    assert(isFreeTierRoute('/free-tier/status/') === true, 'Status route ignores a trailing slash');
    assert(isFreeTierRoute('/free-tier/claim?x=1') === true, 'Claim route ignores a query string');
    assert(isFreeTierRoute('/quotes') === false, 'Quote route is not a free tier route');
    assert(isFreeTierRoute(undefined) === false, 'A missing path is not a free tier route');
    assert(normalizePath('') === '/', 'An empty path stays the root');

    const unconfigured = mockRes();
    await serveFreeTier({ method: 'POST', path: '/free-tier/status', body: { deviceToken: 't' } }, unconfigured, {}, async () => { throw new Error('no'); });
    assert(unconfigured.statusCode === 503, 'Missing DeviceCheck config returns 503');
    const alreadySent = mockRes();
    alreadySent.headersSent = true;
    await serveFreeTier({ method: 'POST', path: '/free-tier/status', body: { deviceToken: 't' } }, alreadySent, {}, async () => { throw new Error('no'); });
    assert(alreadySent.statusCode === 0, 'A response that already started is left alone');

    const served = mockRes();
    await serveFreeTier(
      { method: 'POST', url: '/free-tier/status?x=1', body: { deviceToken: 't' } },
      served,
      { DEVICECHECK_KEY_ID: 'KEYID12345', DEVICECHECK_TEAM_ID: 'TEAMID1234', DEVICECHECK_AUTH_KEY: pem },
      async () => ({ ok: true, status: 200, json: async () => ({ bit0: true, bit1: false }) })
    );
    assert(served.statusCode === 200 && served.body.tradeUsed === true, 'The free tier route returns the trade bit');

    assert(bitsNeedRepair({ bit0: true, bit1: true }, { bit0: true, bit1: false }) === true, 'A dropped wheel bit needs repair');
    let wheelRepairs = 0;
    const droppedWheel = await callTier('/free-tier/claim', { deviceToken: 't', slot: 'trade' }, {
      queryBits: async () => wheelRepairs === 0 ? { bit0: false, bit1: true } : { bit0: true, bit1: false },
      updateBits: async (token: string, bits: { bit0: boolean; bit1: boolean }) => {
        wheelRepairs += 1;
        if (wheelRepairs === 2) {
          assert(bits.bit0 === true && bits.bit1 === true, 'Repair writes both planned bits');
        }
      },
    });
    assert(droppedWheel.statusCode === 200 && wheelRepairs === 2, 'A dropped wheel bit is repaired after a trade reservation');

    const wheelKnown = await coordinatorWith({
      available: async () => true,
      status: async () => ({ kind: 'ok', tradeUsed: false, wheelUsed: true }),
      claim: async () => { throw new Error('already synced'); },
    });
    assert(wheelKnown.getFlags().wheelUsed === true, 'A reinstall learns the used wheel from DeviceCheck');
    await wheelKnown.noteExisting('wheel', 1);

    const freshWheel = await coordinatorWith({
      available: async () => true,
      status: async () => ({ kind: 'ok', tradeUsed: false, wheelUsed: false }),
      claim: async () => ({ kind: 'ok', tradeUsed: false, wheelUsed: true }),
    });
    const notedWheel = await freshWheel.noteExisting('wheel', 1);
    assert(notedWheel.wheelUsed === true, 'An existing wheel is reserved on the device');

    const partial = createLiveDeviceCheckClient({ platform: '', fetchImpl: fetchImpl as any });
    assert(await partial.available() === false, 'An unknown platform does not reserve a slot');

    const firstWheel = await localOnly.claim('wheel');
    assert(firstWheel.ok === true && localOnly.getFlags().wheelUsed === true, 'Without DeviceCheck the first wheel is stored locally');
    const secondWheel = await localOnly.claim('wheel');
    assert(secondWheel.paywall === true, 'The local flag blocks a second wheel without a server');
    let nativeLoaderMissing = false;
    try { defaultDeviceCheckLoader(); } catch { nativeLoaderMissing = true; }
    assert(nativeLoaderMissing === true, 'Node cannot load the iOS DeviceCheck module');

  console.log(`\nFree tier results: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}
