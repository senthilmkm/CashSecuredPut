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
}

export function pruneHistoryByRetention(historyList: CSPTrade[], maxDays: number): CSPTrade[] {
  if (maxDays >= 9999 || maxDays <= 0) return historyList;
  const cutoffMs = Date.now() - maxDays * 24 * 60 * 60 * 1000;
  return historyList.filter((t) => {
    const createdMs = new Date(t.createdAt).getTime();
    return isNaN(createdMs) || createdMs >= cutoffMs;
  });
}
