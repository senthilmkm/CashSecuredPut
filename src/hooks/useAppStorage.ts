import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkPremiumStatus } from '../services/purchases';
import { CSPTrade, pruneHistoryByRetention } from '../services/storageUtils';

export { CSPTrade, pruneHistoryByRetention };

const STORAGE_KEYS = {
  TRADES: '@CashSecuredProfit:trades',
  HISTORY: '@CashSecuredProfit:history',
  RETENTION_DAYS: '@CashSecuredProfit:retention_days',
  ALERT_THRESHOLD: '@CashSecuredProfit:alert_threshold',
  IS_PREMIUM: '@CashSecuredProfit:is_premium',
  FIRST_LAUNCH_DATE: '@CashSecuredProfit:first_launch_date',
  WHEEL: '@csp_wheel_positions_v1',
};

export const FREE_TIER_MAX_TRADES = 3;
export const TRIAL_DURATION_DAYS = 7;

export function useAppStorage() {
  const [trades, setTrades] = useState<CSPTrade[]>([]);
  const [history, setHistory] = useState<CSPTrade[]>([]);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [isTrialActive, setIsTrialActive] = useState<boolean>(true);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number>(7);
  const [loading, setLoading] = useState<boolean>(true);
  const [retentionDays, setRetentionDays] = useState<number>(90);
  const [expirationAlertThreshold, setExpirationAlertThreshold] = useState<number>(3);

  // Load storage & evaluate 7-Day Free App Trial
  const loadStorage = useCallback(async () => {
    try {
      setLoading(true);
      const [savedTrades, savedHistory, savedRetention, savedAlerts, premiumStatus, firstLaunch] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.TRADES),
        AsyncStorage.getItem(STORAGE_KEYS.HISTORY),
        AsyncStorage.getItem(STORAGE_KEYS.RETENTION_DAYS),
        AsyncStorage.getItem(STORAGE_KEYS.ALERT_THRESHOLD),
        checkPremiumStatus(),
        AsyncStorage.getItem(STORAGE_KEYS.FIRST_LAUNCH_DATE),
      ]);

      setIsTrialActive(false);
      setTrialDaysRemaining(0);

      let effectiveRetention = 90;
      if (savedRetention) {
        effectiveRetention = parseInt(savedRetention, 10);
        setRetentionDays(effectiveRetention);
      }
      if (savedAlerts) {
        setExpirationAlertThreshold(parseInt(savedAlerts, 10));
      }
      if (savedTrades) {
        try { setTrades(JSON.parse(savedTrades)); } catch (e) { setTrades([]); }
      }
      if (savedHistory) {
        try {
          const parsed = JSON.parse(savedHistory);
          const pruned = pruneHistoryByRetention(parsed, effectiveRetention);
          setHistory(pruned);
          if (pruned.length !== parsed.length) {
            await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(pruned));
          }
        } catch (e) {
          setHistory([]);
        }
      }
      setIsPremium(premiumStatus);
    } catch (error) {
      console.error('[useAppStorage] Error loading storage:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStorage();
  }, [loadStorage]);

  const refreshPremiumStatus = async (): Promise<boolean> => {
    const status = await checkPremiumStatus();
    setIsPremium(status);
    return status;
  };

  // Full Pro access is granted exclusively via verified Apple StoreKit / RevenueCat Premium entitlement!
  const hasProAccess = isPremium;

  /**
   * Adds a new trade to active trades portfolio.
   * Gated after 7-Day Trial expires AND Free Tier 3-trade limit reached!
   */
  const addTrade = async (newTradeData: Omit<CSPTrade, 'id' | 'createdAt' | 'status'>): Promise<{ success: boolean; paywallTriggered?: boolean }> => {
    if (!hasProAccess && trades.length >= FREE_TIER_MAX_TRADES) {
      return { success: false, paywallTriggered: true };
    }

    const newTrade: CSPTrade = {
      ...newTradeData,
      id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 6),
      status: 'active',
      createdAt: new Date().toISOString(),
      cumulativePremium: newTradeData.premium,
    };

    const updatedTrades = [newTrade, ...trades];
    setTrades(updatedTrades);
    await AsyncStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(updatedTrades));

    return { success: true };
  };

  const updateTradeStatus = async (tradeId: string, status: 'expired_worthless' | 'assigned' | 'closed_early') => {
    const targetTrade = trades.find((t: CSPTrade) => t.id === tradeId);
    if (!targetTrade) return;

    const updatedTarget: CSPTrade = { ...targetTrade, status };
    const updatedTrades = trades.filter((t: CSPTrade) => t.id !== tradeId);
    const updatedHistory = [updatedTarget, ...history];

    setTrades(updatedTrades);
    setHistory(updatedHistory);

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(updatedTrades)),
      AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updatedHistory)),
    ]);
  };

  const removeTrade = async (tradeId: string) => {
    const updatedTrades = trades.filter((t: CSPTrade) => t.id !== tradeId);
    setTrades(updatedTrades);
    await AsyncStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(updatedTrades));
  };

  const executeRoll = async (
    originalTradeId: string,
    rollDetails: {
      newStrike: number;
      newPremium: number;
      newExpirationDate: string;
      newDte: number;
      closeDebitPerShare: number;
    }
  ): Promise<{ success: boolean; paywallTriggered?: boolean }> => {
    if (!hasProAccess) {
      return { success: false, paywallTriggered: true };
    }

    const originalTrade = trades.find((t: CSPTrade) => t.id === originalTradeId);
    if (!originalTrade) return { success: false };

    const netCreditPerShare = rollDetails.newPremium - rollDetails.closeDebitPerShare;
    const previousCumulativeBasis = originalTrade.cumulativeCostBasisCredit || originalTrade.cumulativePremium || originalTrade.premium;
    const newCumulativeBasis = previousCumulativeBasis + netCreditPerShare;

    // Realized P&L on Leg 1 = initial premium received minus debit paid to buy back / close
    const leg1RealizedPremium = parseFloat((originalTrade.premium - rollDetails.closeDebitPerShare).toFixed(2));

    const archivedOriginal: CSPTrade = {
      ...originalTrade,
      status: 'closed_early',
      cumulativePremium: leg1RealizedPremium,
      notes: `${originalTrade.notes ? originalTrade.notes + ' • ' : ''}Rolled to ${rollDetails.newStrike} Strike (Closed @ $${rollDetails.closeDebitPerShare.toFixed(2)})`,
    };
    const updatedHistory = [archivedOriginal, ...history];

    const rolledTrade: CSPTrade = {
      id: Date.now().toString() + '_rolled_' + Math.random().toString(36).substring(2, 6),
      ticker: originalTrade.ticker,
      stockPrice: originalTrade.stockPrice,
      strikePrice: rollDetails.newStrike,
      premium: rollDetails.newPremium,
      contracts: originalTrade.contracts,
      expirationDate: rollDetails.newExpirationDate,
      dte: rollDetails.newDte,
      commissions: originalTrade.commissions,
      status: 'active',
      createdAt: new Date().toISOString(),
      rolledFromId: originalTrade.id,
      cumulativePremium: rollDetails.newPremium,
      cumulativeCostBasisCredit: parseFloat(newCumulativeBasis.toFixed(2)),
      notes: `Rolled from ${originalTrade.strikePrice} Strike on ${new Date().toLocaleDateString()}`,
    };

    const updatedTrades = [rolledTrade, ...trades.filter((t: CSPTrade) => t.id !== originalTradeId)];

    setTrades(updatedTrades);
    setHistory(updatedHistory);

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(updatedTrades)),
      AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updatedHistory)),
    ]);

    return { success: true };
  };

  const updateRetentionDays = async (days: number) => {
    setRetentionDays(days);
    await AsyncStorage.setItem(STORAGE_KEYS.RETENTION_DAYS, days.toString());
    const pruned = pruneHistoryByRetention(history, days);
    if (pruned.length !== history.length) {
      setHistory(pruned);
      await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(pruned));
    }
  };

  const updateExpirationAlertThreshold = async (days: number) => {
    setExpirationAlertThreshold(days);
    await AsyncStorage.setItem(STORAGE_KEYS.ALERT_THRESHOLD, days.toString());
  };

  const clearAllData = async () => {
    setTrades([]);
    setHistory([]);
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify([])),
      AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify([])),
      AsyncStorage.setItem(STORAGE_KEYS.WHEEL, JSON.stringify([])),
      AsyncStorage.setItem('@csp_wheel_initialized', 'true'),
    ]);
  };

  return {
    trades,
    history,
    isPremium,
    isTrialActive,
    trialDaysRemaining,
    hasProAccess,
    loading,
    retentionDays,
    expirationAlertThreshold,
    addTrade,
    updateTradeStatus,
    removeTrade,
    executeRoll,
    refreshPremiumStatus,
    updateRetentionDays,
    updateExpirationAlertThreshold,
    clearAllData,
  };
}