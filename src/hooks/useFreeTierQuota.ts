import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLiveDeviceCheckClient } from '../services/deviceCheckApi';
import { FreeTierCoordinator } from '../services/freeTierCoordinator';
import { FreeSlot, SlotFlags, emptyFlags } from '../services/freeTierQuota';

export function useFreeTierQuota(isPremium: boolean, premiumLoading: boolean) {
  const coordinatorRef = useRef<FreeTierCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = new FreeTierCoordinator(AsyncStorage, createLiveDeviceCheckClient({ platform: Platform.OS }));
  }
  const [flags, setFlags] = useState<SlotFlags>(emptyFlags());
  const [quotaReady, setQuotaReady] = useState(false);

  const refreshFlags = useCallback(() => {
    setFlags(coordinatorRef.current!.getFlags());
    setQuotaReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    coordinatorRef.current!.setPremium(isPremium, premiumLoading);
    coordinatorRef.current!.whenLoaded().then(() => {
      if (!cancelled) {
        refreshFlags();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isPremium, premiumLoading, refreshFlags]);

  const claimTradeSlot = useCallback(async () => {
    const outcome = await coordinatorRef.current!.claim('trade');
    refreshFlags();
    return outcome;
  }, [refreshFlags]);

  const claimWheelSlot = useCallback(async () => {
    const outcome = await coordinatorRef.current!.claim('wheel');
    refreshFlags();
    return outcome;
  }, [refreshFlags]);

  const noteExisting = useCallback(async (slot: FreeSlot, existingCount: number) => {
    await coordinatorRef.current!.noteExisting(slot, existingCount);
    refreshFlags();
  }, [refreshFlags]);

  return {
    tradeUsed: flags.tradeUsed,
    wheelUsed: flags.wheelUsed,
    quotaReady,
    claimTradeSlot,
    claimWheelSlot,
    noteExisting,
  };
}
