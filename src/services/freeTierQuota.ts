export type FreeSlot = 'trade' | 'wheel';

export interface SlotFlags {
  tradeUsed: boolean;
  wheelUsed: boolean;
}

export type ServerClaimResult =
  | { kind: 'ok'; tradeUsed: boolean; wheelUsed: boolean }
  | { kind: 'used'; tradeUsed: boolean; wheelUsed: boolean }
  | { kind: 'unavailable' };

export interface ClaimOutcome {
  ok: boolean;
  paywall: boolean;
  message?: string;
  nextFlags: SlotFlags;
}

export const FREE_TIER_COPY = {
  summary:
    'Free tier includes 1 saved trade and 1 saved wheel on this device, and shows your 3 most recent closed trades. Deleting them does not unlock another.',
  short:
    'Free tier: 1 saved trade, 1 saved wheel, and your 3 newest closed trades on this device.',
  settingsFree:
    'Free tier: 1 saved trade, 1 saved wheel, and your 3 newest closed trades. Deleting them does not unlock another.',
  tradeTitle: 'Free tier: 1 saved trade used',
  tradeBody:
    'Free tier includes 1 saved trade on this device. Deleting or closing it does not unlock another. Upgrade to Pro for unlimited trades.',
  wheelTitle: 'Free tier: 1 saved wheel used',
  wheelBody:
    'Free tier includes 1 saved wheel on this device. Deleting it does not unlock another. Upgrade to Pro for unlimited wheels.',
  tradeOffline:
    'Connect to the internet once to reserve your free saved trade on this device, then try again.',
  wheelOffline:
    'Connect to the internet once to reserve your free saved wheel on this device, then try again.',
  calculatorNote:
    'Free tier includes 1 saved trade on this device. Deleting it does not unlock another.',
  historyLocked:
    'Free tier shows your 3 most recent closed trades. Upgrade to Pro for complete lifetime trade journaling and PDF/CSV exports.',
  clearData:
    'This will permanently delete all active trades and trade history from your device. This action cannot be undone. Your free saved-trade and saved-wheel allowance stays used.',
  tradeEmptyUsed:
    'Your free trade has already been used on this device. Upgrade to Pro to save another.',
  wheelEmptyUsed:
    'Your free wheel has already been used on this device. Upgrade to Pro to start another.',
  wheelEmptyOpen:
    'Start a Cash-Secured Put, track assignments, and automatically record Covered Calls to continuously lower your stock cost basis.',
};

export function emptyFlags(): SlotFlags {
  return { tradeUsed: false, wheelUsed: false };
}

export function slotIsUsed(flags: SlotFlags, slot: FreeSlot): boolean {
  return slot === 'trade' ? flags.tradeUsed : flags.wheelUsed;
}

export function mergeFlags(local: SlotFlags, remote?: Partial<SlotFlags> | null): SlotFlags {
  return {
    tradeUsed: local.tradeUsed || !!remote?.tradeUsed,
    wheelUsed: local.wheelUsed || !!remote?.wheelUsed,
  };
}

export function flagsWithSlot(flags: SlotFlags, slot: FreeSlot, used: boolean): SlotFlags {
  if (slot === 'trade') {
    return { tradeUsed: flags.tradeUsed || used, wheelUsed: flags.wheelUsed };
  }
  return { tradeUsed: flags.tradeUsed, wheelUsed: flags.wheelUsed || used };
}

export function decideClaim(input: {
  isPremium: boolean;
  flags: SlotFlags;
  slot: FreeSlot;
  deviceCheckAvailable: boolean;
  serverResult: ServerClaimResult | null;
}): ClaimOutcome {
  const { flags, slot } = input;
  if (input.isPremium) {
    return { ok: true, paywall: false, nextFlags: flags };
  }
  if (slotIsUsed(flags, slot)) {
    return { ok: false, paywall: true, nextFlags: flags };
  }
  if (!input.deviceCheckAvailable) {
    return { ok: true, paywall: false, nextFlags: flagsWithSlot(flags, slot, true) };
  }
  if (!input.serverResult || input.serverResult.kind === 'unavailable') {
    return {
      ok: false,
      paywall: false,
      message: slot === 'trade' ? FREE_TIER_COPY.tradeOffline : FREE_TIER_COPY.wheelOffline,
      nextFlags: flags,
    };
  }
  const nextFlags = mergeFlags(flags, {
    tradeUsed: input.serverResult.tradeUsed || slot === 'trade',
    wheelUsed: input.serverResult.wheelUsed || slot === 'wheel',
  });
  if (input.serverResult.kind === 'used') {
    return { ok: false, paywall: true, nextFlags };
  }
  return { ok: true, paywall: false, nextFlags };
}

export function shouldNoteExisting(isPremium: boolean, existingCount: number): boolean {
  return !isPremium && existingCount > 0;
}
