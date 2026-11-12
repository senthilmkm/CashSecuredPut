import { BROKER_CONFIG } from '../config/broker';
import { FreeSlot, ServerClaimResult } from './freeTierQuota';

export interface DeviceCheckNative {
  isSupported(): Promise<boolean>;
  generateToken(): Promise<string>;
}

export interface DeviceCheckClient {
  available(): Promise<boolean>;
  status(): Promise<ServerClaimResult>;
  claim(slot: FreeSlot): Promise<ServerClaimResult>;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  status: number;
  json(): Promise<any>;
}>;

export function parseFreeTierBody(status: number, body: any): ServerClaimResult {
  const tradeUsed = !!body?.tradeUsed;
  const wheelUsed = !!body?.wheelUsed;
  if (status === 200) {
    return { kind: 'ok', tradeUsed, wheelUsed };
  }
  if (status === 409) {
    return { kind: 'used', tradeUsed, wheelUsed };
  }
  return { kind: 'unavailable' };
}

export async function readDeviceToken(native: DeviceCheckNative | null): Promise<string | null> {
  if (!native) {
    return null;
  }
  try {
    const supported = await native.isSupported();
    if (!supported) {
      return null;
    }
    const token = await native.generateToken();
    if (!token) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function defaultDeviceCheckLoader(): DeviceCheckNative {
  const { requireNativeModule } = require('expo-modules-core');
  return requireNativeModule('DeviceCheck');
}

export function loadDeviceCheckNative(loader: () => DeviceCheckNative = defaultDeviceCheckLoader): DeviceCheckNative | null {
  try {
    return loader();
  } catch {
    return null;
  }
}

export async function requestFreeTier(input: {
  fetchImpl: FetchLike;
  baseUrl: string;
  path: 'status' | 'claim';
  deviceToken: string;
  slot?: FreeSlot;
  timeoutMs: number;
  schedule?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}): Promise<ServerClaimResult> {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const schedule = input.schedule || setTimeout;
  const cancel = input.cancel || clearTimeout;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ServerClaimResult>((resolve) => {
    timer = schedule(() => {
      if (controller) {
        controller.abort();
      }
      resolve({ kind: 'unavailable' });
    }, input.timeoutMs);
  });
  try {
    const result = await Promise.race([
      (async () => {
        const response = await input.fetchImpl(`${input.baseUrl.replace(/\/$/, '')}/free-tier/${input.path}`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceToken: input.deviceToken,
            slot: input.slot,
          }),
          signal: controller ? controller.signal : undefined,
        });
        let body: any = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        return parseFreeTierBody(response.status, body);
      })(),
      timeout,
    ]);
    return result;
  } catch {
    return { kind: 'unavailable' };
  } finally {
    if (timer) {
      cancel(timer);
    }
  }
}

export function createLiveDeviceCheckClient(deps?: {
  platform?: string;
  native?: DeviceCheckNative | null;
  fetchImpl?: FetchLike;
  baseUrl?: string;
  timeoutMs?: number;
}): DeviceCheckClient {
  const platform = deps?.platform || 'ios';
  const native = deps && 'native' in deps ? deps.native || null : loadDeviceCheckNative();
  const fetchImpl = deps?.fetchImpl || (fetch as unknown as FetchLike);
  const baseUrl = deps?.baseUrl || BROKER_CONFIG.PROXY_URL;
  const timeoutMs = deps?.timeoutMs || 12000;

  return {
    async available() {
      if (platform !== 'ios' || !native) {
        return false;
      }
      try {
        return await native.isSupported();
      } catch {
        return false;
      }
    },
    async status() {
      const token = await readDeviceToken(native);
      if (!token) {
        return { kind: 'unavailable' };
      }
      return requestFreeTier({ fetchImpl, baseUrl, path: 'status', deviceToken: token, timeoutMs });
    },
    async claim(slot: FreeSlot) {
      const token = await readDeviceToken(native);
      if (!token) {
        return { kind: 'unavailable' };
      }
      return requestFreeTier({ fetchImpl, baseUrl, path: 'claim', deviceToken: token, slot, timeoutMs });
    },
  };
}
