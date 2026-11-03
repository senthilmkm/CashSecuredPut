/**
 * Earnings Risk Detection Service for Cash-Secured Puts
 *
 * Checks if a trade's expiration window spans an upcoming earnings announcement.
 * Selling CSPs into earnings poses catastrophic gap-down risk (the "earnings cliff").
 */

export interface EarningsRiskResult {
  hasEarningsRisk: boolean;
  earningsDate?: string; // YYYY-MM-DD
  daysUntilEarnings?: number;
  message?: string;
  isConfirmed?: boolean;
}

// Known earnings announcement calendar dates for top traded CSP tickers
const KNOWN_EARNINGS_CALENDAR: Record<string, string[]> = {
  NVDA: ['2026-11-18', '2027-02-25', '2027-05-20'],
  AAPL: ['2026-11-05', '2027-01-28', '2027-04-29'],
  TSLA: ['2026-10-21', '2027-01-20', '2027-04-21'],
  MSFT: ['2026-10-27', '2027-01-26', '2027-04-27'],
  AMZN: ['2026-10-29', '2027-01-28', '2027-04-29'],
  GOOGL: ['2026-10-28', '2027-02-02', '2027-04-27'],
  META: ['2026-10-28', '2027-01-27', '2027-04-28'],
  AMD: ['2026-11-03', '2027-01-26', '2027-04-27'],
  NFLX: ['2026-10-15', '2027-01-19', '2027-04-19'],
  PLTR: ['2026-11-02', '2027-02-08', '2027-05-03'],
  COIN: ['2026-10-30', '2027-02-18', '2027-05-13'],
  SOFI: ['2026-10-27', '2027-01-26', '2027-04-27'],
  INTC: ['2026-10-22', '2027-01-21', '2027-04-22'],
  BABA: ['2026-11-12', '2027-02-18', '2027-05-20'],
  DIS: ['2026-11-12', '2027-02-04', '2027-05-06'],
  UBER: ['2026-11-05', '2027-02-09', '2027-05-04'],
};

/**
 * Checks if the trade duration (from today until expirationDate) covers an earnings event.
 * @param symbol Stock ticker
 * @param expirationDateOrDte Expiration date in YYYY-MM-DD or DTE in days
 */
export function checkEarningsRisk(
  symbol: string,
  expirationDateOrDte: string | number
): EarningsRiskResult {
  const cleanSymbol = symbol.toUpperCase().trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let targetExpDate: Date;

  if (typeof expirationDateOrDte === 'number') {
    targetExpDate = new Date(today);
    targetExpDate.setDate(targetExpDate.getDate() + Math.max(1, expirationDateOrDte));
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(expirationDateOrDte)) {
    const [y, m, d] = expirationDateOrDte.split('-').map(Number);
    targetExpDate = new Date(y, m - 1, d);
  } else {
    const parsedDays = parseInt(expirationDateOrDte, 10);
    targetExpDate = new Date(today);
    targetExpDate.setDate(targetExpDate.getDate() + (isNaN(parsedDays) ? 30 : Math.max(1, parsedDays)));
  }

  // Check known dates
  const dates = KNOWN_EARNINGS_CALENDAR[cleanSymbol];
  if (dates && dates.length > 0) {
    for (const dStr of dates) {
      const [y, m, d] = dStr.split('-').map(Number);
      const eDate = new Date(y, m - 1, d);
      eDate.setHours(0, 0, 0, 0);

      // Check if earnings date falls between today and expiration date
      if (eDate >= today && eDate <= targetExpDate) {
        const daysDiff = Math.max(0, Math.round((eDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
        return {
          hasEarningsRisk: true,
          earningsDate: dStr,
          daysUntilEarnings: daysDiff,
          isConfirmed: true,
          message: `Earnings report scheduled on ${dStr} (${daysDiff === 0 ? 'Today' : `in ${daysDiff} days`}), before this option expires. High risk of binary price drop.`,
        };
      }
    }
  }

  return {
    hasEarningsRisk: false,
  };
}
