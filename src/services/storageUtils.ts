export interface CSPTrade {
  id: string;
  ticker: string;
  stockPrice: number;
  strikePrice: number;
  premium: number;
  contracts: number;
  expirationDate: string;
  dte: number;
  commissions: number;
  notes?: string;
  status: 'active' | 'expired_worthless' | 'assigned' | 'closed_early';
  createdAt: string;
  rolledFromId?: string;
  cumulativePremium?: number;
  cumulativeCostBasisCredit?: number;
}

export function pruneHistoryByRetention(historyList: CSPTrade[], maxDays: number): CSPTrade[] {
  if (maxDays >= 9999 || maxDays <= 0) return historyList;
  const cutoffMs = Date.now() - maxDays * 24 * 60 * 60 * 1000;
  return historyList.filter((t) => {
    const createdMs = new Date(t.createdAt).getTime();
    return isNaN(createdMs) || createdMs >= cutoffMs;
  });
}

export const FREE_TIER_MAX_TRADES = 1;
export const FREE_TIER_MAX_HISTORY = 3;
export const STORAGE_KEY_ONBOARDING = '@csp_onboarding_completed_v1';

/**
 * Pure helper to determine if onboarding should be displayed.
 * - If user explicitly completed onboarding, return false.
 * - If user already has active trades or history (existing user updating app), return false to avoid ambushing.
 * - Otherwise (fresh install or reset), return true.
 */
export function shouldShowOnboarding(
  onboardingSavedValue: string | null,
  activeTradesCount: number,
  historyTradesCount: number
): boolean {
  if (onboardingSavedValue === 'true') {
    return false;
  }
  if (activeTradesCount > 0 || historyTradesCount > 0) {
    return false;
  }
  return true;
}

