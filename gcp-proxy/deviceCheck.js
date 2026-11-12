const crypto = require('crypto');

const QUERY_URL = 'https://api.devicecheck.apple.com/v1/query_two_bits';
const UPDATE_URL = 'https://api.devicecheck.apple.com/v1/update_two_bits';

function base64url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function readConfig(env) {
  const keyId = env.DEVICECHECK_KEY_ID || '';
  const teamId = env.DEVICECHECK_TEAM_ID || '';
  const privateKey = env.DEVICECHECK_AUTH_KEY || '';
  if (!keyId || !teamId || !privateKey) {
    throw new Error('DeviceCheck is not configured');
  }
  return { keyId, teamId, privateKey };
}

function createDeviceCheckJwt({ teamId, keyId, privateKey, nowSeconds }) {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = base64url(JSON.stringify({ iss: teamId, iat: nowSeconds }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${unsigned}.${base64url(signature)}`;
}

function normalizeBits(body) {
  return { bit0: !!body?.bit0, bit1: !!body?.bit1 };
}

function planBitUpdate(current, slot) {
  const bit0 = !!current?.bit0;
  const bit1 = !!current?.bit1;
  if (slot !== 'trade' && slot !== 'wheel') {
    throw new Error('Invalid slot');
  }
  if ((slot === 'trade' && bit0) || (slot === 'wheel' && bit1)) {
    return { alreadyUsed: true, bit0, bit1 };
  }
  return {
    alreadyUsed: false,
    bit0: slot === 'trade' ? true : bit0,
    bit1: slot === 'wheel' ? true : bit1,
  };
}

function bitsNeedRepair(planned, verified) {
  return (!!planned.bit0 && !verified.bit0) || (!!planned.bit1 && !verified.bit1);
}

async function postApple(fetchImpl, url, jwt, body) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...body,
      transaction_id: crypto.randomUUID(),
      timestamp: Date.now(),
    }),
  });
  if (!response.ok && response.status !== 200) {
    const text = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(`DeviceCheck ${response.status} ${text}`.trim());
  }
  if (typeof response.json !== 'function') {
    return {};
  }
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function createAppleDeps(env, fetchImpl, nowSeconds) {
  const config = readConfig(env);
  const jwt = createDeviceCheckJwt({ ...config, nowSeconds: nowSeconds || Math.floor(Date.now() / 1000) });
  return {
    async queryBits(deviceToken) {
      const body = await postApple(fetchImpl, QUERY_URL, jwt, { device_token: deviceToken });
      return normalizeBits(body);
    },
    async updateBits(deviceToken, bits) {
      await postApple(fetchImpl, UPDATE_URL, jwt, {
        device_token: deviceToken,
        bit0: !!bits.bit0,
        bit1: !!bits.bit1,
      });
    },
  };
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body);
  }
  return {};
}

function normalizePath(path) {
  const raw = String(path || '').split('?')[0];
  return raw.replace(/\/$/, '') || '/';
}

function isFreeTierRoute(path) {
  const earlyPath = normalizePath(path);
  return earlyPath === '/free-tier/status' || earlyPath === '/free-tier/claim';
}

async function serveFreeTier(req, res, env, fetchImpl) {
  try {
    const deps = createAppleDeps(env, fetchImpl);
    await handleFreeTier(req, res, normalizePath(req.path || req.url), deps);
  } catch (error) {
    console.error('[DeviceCheck]', error && error.message ? error.message : 'unavailable');
    if (!res.headersSent) {
      res.status(503).json({ error: 'DeviceCheck is unavailable. Try again.' });
    }
  }
}

async function handleFreeTier(req, res, path, deps) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = readJsonBody(req);
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const deviceToken = body?.deviceToken;
  if (!deviceToken || typeof deviceToken !== 'string') {
    res.status(400).json({ error: 'Missing device token' });
    return;
  }

  if (path.endsWith('/claim') && body.slot !== 'trade' && body.slot !== 'wheel') {
    res.status(400).json({ error: 'Invalid slot' });
    return;
  }
  if (!path.endsWith('/status') && !path.endsWith('/claim')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  try {
    const current = await deps.queryBits(deviceToken);
    if (path.endsWith('/status')) {
      res.status(200).json({ ok: true, tradeUsed: current.bit0, wheelUsed: current.bit1 });
      return;
    }
    const slot = body.slot;
    const planned = planBitUpdate(current, slot);
    if (planned.alreadyUsed) {
      res.status(409).json({ ok: false, used: true, tradeUsed: current.bit0, wheelUsed: current.bit1 });
      return;
    }
    await deps.updateBits(deviceToken, planned);
    const verified = await deps.queryBits(deviceToken);
    const slotSet = slot === 'trade' ? verified.bit0 : verified.bit1;
    if (!slotSet) {
      res.status(503).json({ error: 'Could not reserve the free save. Try again.' });
      return;
    }
    if (bitsNeedRepair(planned, verified)) {
      await deps.updateBits(deviceToken, {
        bit0: verified.bit0 || planned.bit0,
        bit1: verified.bit1 || planned.bit1,
      });
    }
    res.status(200).json({
      ok: true,
      tradeUsed: slot === 'trade' || verified.bit0 || planned.bit0,
      wheelUsed: slot === 'wheel' || verified.bit1 || planned.bit1,
    });
  } catch (error) {
    console.error('[DeviceCheck]', error && error.message ? error.message : 'unavailable');
    res.status(503).json({ error: 'DeviceCheck is unavailable. Try again.' });
  }
}

module.exports = {
  base64url,
  readConfig,
  createDeviceCheckJwt,
  normalizeBits,
  planBitUpdate,
  bitsNeedRepair,
  postApple,
  createAppleDeps,
  readJsonBody,
  normalizePath,
  isFreeTierRoute,
  serveFreeTier,
  handleFreeTier,
};
