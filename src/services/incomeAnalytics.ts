import { CSPTrade } from './storageUtils';

export interface MonthlyIncomeBucket {
  monthKey: string;      // e.g., '2026-11'
  monthLabel: string;    // e.g., 'Nov'
  fullLabel: string;     // e.g., 'Nov 2026'
  year: number;
  monthIndex: number;    // 0 to 11
  netIncome: number;     // Sum of realized gains/losses in dollars
  tradeCount: number;    // Total completed positions
  winCount: number;      // Positions expired worthless (100% win)
  assignedCount: number; // Positions assigned
  winRatePercent: number;// Percentage of winning trades
  trades: CSPTrade[];
}

export interface GoalPacingMetrics {
  totalYtd: number;          // Total realized income this calendar year
  annualGoal: number;        // User's annual target (default $5,000)
  percentOfGoal: number;     // % of annual goal reached
  runRateMonthly: number;    // Average income per active month
  projectedAnnual: number;   // Projected annual total based on velocity
  activeMonthCount: number;  // Number of months with activity
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Groups closed/archived trades into chronological monthly buckets.
 * Generates an unbroken timeline (e.g. last 6 months) even if some months have $0 income.
 */
export function groupTradesByMonth(history: CSPTrade[], monthsToShow: number = 6): MonthlyIncomeBucket[] {
  const now = new Date();
  const buckets: MonthlyIncomeBucket[] = [];

  // Generate target month keys in chronological order (oldest to newest)
  for (let i = monthsToShow - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const monthLabel = MONTH_NAMES[monthIndex];

    buckets.push({
      monthKey,
      monthLabel,
      fullLabel: `${monthLabel} ${year}`,
      year,
      monthIndex,
      netIncome: 0,
      tradeCount: 0,
      winCount: 0,
      assignedCount: 0,
      winRatePercent: 100,
      trades: [],
    });
  }

  const bucketMap = new Map<string, MonthlyIncomeBucket>();
  buckets.forEach((b) => bucketMap.set(b.monthKey, b));

  // Populate trade metrics into monthly buckets
  for (const trade of history) {
    if (!trade.createdAt) continue;
    const tradeDate = new Date(trade.createdAt);
    if (isNaN(tradeDate.getTime())) continue;

    const key = `${tradeDate.getFullYear()}-${String(tradeDate.getMonth() + 1).padStart(2, '0')}`;
    const bucket = bucketMap.get(key);

    if (bucket) {
      const prem = trade.cumulativePremium !== undefined ? trade.cumulativePremium : trade.premium;
      const tradeNetIncome = prem * 100 * trade.contracts - (trade.commissions || 0);

      bucket.netIncome = parseFloat((bucket.netIncome + tradeNetIncome).toFixed(2));
      bucket.tradeCount += 1;
      bucket.trades.push(trade);

      if (trade.status === 'expired_worthless') {
        bucket.winCount += 1;
      } else if (trade.status === 'assigned') {
        bucket.assignedCount += 1;
      }
    }
  }

  // Calculate final win rate percentages
  for (const bucket of buckets) {
    if (bucket.tradeCount > 0) {
      bucket.winRatePercent = Math.round((bucket.winCount / bucket.tradeCount) * 100);
    } else {
      bucket.winRatePercent = 100;
    }
  }

  return buckets;
}

/**
 * Calculates annual income pacing and goal velocity.
 */
export function calculateGoalPacing(buckets: MonthlyIncomeBucket[], annualGoal: number = 5000): GoalPacingMetrics {
  const currentYear = new Date().getFullYear();
  const ytdBuckets = buckets.filter((b) => b.year === currentYear);

  const totalYtd = parseFloat(ytdBuckets.reduce((sum, b) => sum + b.netIncome, 0).toFixed(2));
  const activeMonths = ytdBuckets.filter((b) => b.tradeCount > 0);
  const activeMonthCount = Math.max(1, activeMonths.length);

  const runRateMonthly = parseFloat((totalYtd / activeMonthCount).toFixed(2));
  const projectedAnnual = parseFloat((runRateMonthly * 12).toFixed(2));
  const safeGoal = Math.max(1, annualGoal);
  const percentOfGoal = Math.min(100, parseFloat(((totalYtd / safeGoal) * 100).toFixed(1)));

  return {
    totalYtd,
    annualGoal: safeGoal,
    percentOfGoal,
    runRateMonthly,
    projectedAnnual,
    activeMonthCount,
  };
}
