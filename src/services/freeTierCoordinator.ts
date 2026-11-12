import {
  ClaimOutcome,
  decideClaim,
  emptyFlags,
  flagsWithSlot,
  FreeSlot,
  mergeFlags,
  SlotFlags,
} from './freeTierQuota';
import { DeviceCheckClient } from './deviceCheckApi';

export const FREE_TRADE_USED_KEY = '@CashSecuredProfit:free_trade_used';
export const FREE_WHEEL_USED_KEY = '@CashSecuredProfit:free_wheel_used';

export interface QuotaStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export class FreeTierCoordinator {
  flags: SlotFlags = emptyFlags();
  deviceCheckAvailable = false;
  private synced = { trade: false, wheel: false };
  private chain: Promise<void> = Promise.resolve();
  private loaded: Promise<void>;
  private resolvePremiumReady: () => void = () => undefined;
  private premiumReady: Promise<void>;
  private premium = false;

  constructor(
    private storage: QuotaStorage,
    private api: DeviceCheckClient
  ) {
    this.premiumReady = new Promise((resolve) => {
      this.resolvePremiumReady = resolve;
    });
    this.loaded = this.enqueue(() => this.readStorage());
  }

  whenLoaded(): Promise<void> {
    return this.loaded;
  }

  setPremium(isPremium: boolean, premiumLoading: boolean) {
    this.premium = isPremium;
    if (!premiumLoading) {
      this.resolvePremiumReady();
    }
  }

  getFlags(): SlotFlags {
    return this.flags;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async persist(next: SlotFlags) {
    this.flags = mergeFlags(this.flags, next);
    if (this.flags.tradeUsed) {
      await this.storage.setItem(FREE_TRADE_USED_KEY, 'true');
    }
    if (this.flags.wheelUsed) {
      await this.storage.setItem(FREE_WHEEL_USED_KEY, 'true');
    }
  }

  private async readStorage() {
    try {
      const [trade, wheel] = await Promise.all([
        this.storage.getItem(FREE_TRADE_USED_KEY),
        this.storage.getItem(FREE_WHEEL_USED_KEY),
      ]);
      this.flags = { tradeUsed: trade === 'true', wheelUsed: wheel === 'true' };
    } catch {
      this.flags = emptyFlags();
    }

    try {
      this.deviceCheckAvailable = await this.api.available();
    } catch {
      this.deviceCheckAvailable = false;
    }

    if (!this.deviceCheckAvailable) {
      return;
    }

    try {
      const status = await this.api.status();
      if (status.kind === 'ok') {
        if (status.tradeUsed) {
          this.synced.trade = true;
        }
        if (status.wheelUsed) {
          this.synced.wheel = true;
        }
        const merged = mergeFlags(this.flags, status);
        if (merged.tradeUsed !== this.flags.tradeUsed || merged.wheelUsed !== this.flags.wheelUsed) {
          await this.persist(merged);
        }
      }
    } catch {
      // A failed status check does not turn DeviceCheck off. The next save still has to reserve the slot.
    }
  }

  private async claimUnlocked(slot: FreeSlot): Promise<ClaimOutcome> {
    const alreadyUsed = slot === 'trade' ? this.flags.tradeUsed : this.flags.wheelUsed;
    let serverResult = null;
    if (!this.premium && !alreadyUsed && this.deviceCheckAvailable) {
      try {
        serverResult = await this.api.claim(slot);
      } catch {
        serverResult = { kind: 'unavailable' as const };
      }
    }
    const outcome = decideClaim({
      isPremium: this.premium,
      flags: this.flags,
      slot,
      deviceCheckAvailable: this.deviceCheckAvailable,
      serverResult,
    });
    if (serverResult && serverResult.kind !== 'unavailable') {
      this.synced[slot] = true;
    }
    if (outcome.nextFlags.tradeUsed !== this.flags.tradeUsed || outcome.nextFlags.wheelUsed !== this.flags.wheelUsed) {
      await this.persist(outcome.nextFlags);
    }
    return outcome;
  }

  async claim(slot: FreeSlot): Promise<ClaimOutcome> {
    await this.premiumReady;
    await this.loaded;
    return this.enqueue(() => this.claimUnlocked(slot));
  }

  async noteExisting(slot: FreeSlot, existingCount: number): Promise<SlotFlags> {
    await this.premiumReady;
    await this.loaded;
    return this.enqueue(async () => {
      if (this.premium) {
        return this.flags;
      }
      const used = slot === 'trade' ? this.flags.tradeUsed : this.flags.wheelUsed;
      if (existingCount <= 0 && !used) {
        return this.flags;
      }
      if (!this.deviceCheckAvailable) {
        if (existingCount > 0 && !used) {
          await this.persist(flagsWithSlot(this.flags, slot, true));
        }
        return this.flags;
      }
      if (this.synced[slot]) {
        return this.flags;
      }
      let serverResult;
      try {
        serverResult = await this.api.claim(slot);
      } catch {
        serverResult = { kind: 'unavailable' as const };
      }
      if (serverResult.kind === 'unavailable') {
        if (existingCount > 0 && !used) {
          await this.persist(flagsWithSlot(this.flags, slot, true));
        }
        return this.flags;
      }
      this.synced[slot] = true;
      const outcome = decideClaim({
        isPremium: false,
        flags: this.flags,
        slot,
        deviceCheckAvailable: true,
        serverResult,
      });
      if (outcome.nextFlags.tradeUsed !== this.flags.tradeUsed || outcome.nextFlags.wheelUsed !== this.flags.wheelUsed) {
        await this.persist(outcome.nextFlags);
      }
      return this.flags;
    });
  }
}
