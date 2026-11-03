declare const process: any;
import { calculateCSPMetrics, calculateRollCSP, calculateCSPTimeDecay } from '../services/cspMath';
import { pruneHistoryByRetention, CSPTrade } from '../services/storageUtils';
import { checkEarningsRisk } from '../services/earningsService';
import { isCustomerEntitled } from '../services/entitlementUtils';

export function runCSPMathTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}`);
      failed++;
    }
  }

  console.log('\n--- Running CashSecuredProfit Math Unit Tests ---');

  // Test 1: Standard Out-of-the-Money CSP (1 Contract)
  const stdRes = calculateCSPMetrics({
    stockPrice: 150,
    strikePrice: 140,
    premium: 3.50,
    contracts: 1,
    dte: 30,
    commissions: 1.00,
  });
  assert(stdRes.collateralRequired === 14000, 'Collateral Required for 140 strike 1 contract = $14,000');
  assert(stdRes.netPremium === 349, 'Net Premium = $350 - $1 = $349');
  assert(stdRes.effectiveCostBasis === 136.50, 'Effective Cost Basis = 140 - 3.50 = $136.50');
  assert(stdRes.isITM === false, '140 Strike vs 150 Stock is OTM (isITM = false)');
  assert(stdRes.returnOnCapitalPercent > 2.0 && stdRes.returnOnCapitalPercent < 3.0, 'ROC % is ~2.49%');
  assert(stdRes.annualizedApr > 25, 'Annualized APR is > 25%');
  assert(stdRes.score >= 70, 'Score is 70+ for prime trade');

  // Test 2: Multi-Contract Premium & Collateral Scaling (2 & 5 Contracts)
  const multi2 = calculateCSPMetrics({
    stockPrice: 150,
    strikePrice: 140,
    premium: 3.50,
    contracts: 2,
    dte: 30,
    commissions: 2.00,
  });
  assert(multi2.collateralRequired === 28000, '2 contracts = $28,000 collateral');
  assert(multi2.netPremium === 698, '2 contracts net premium = $700 - $2 = $698');

  const multi5 = calculateCSPMetrics({
    stockPrice: 150,
    strikePrice: 140,
    premium: 3.50,
    contracts: 5,
    dte: 30,
    commissions: 5.00,
  });
  assert(multi5.collateralRequired === 70000, '5 contracts = $70,000 collateral');
  assert(multi5.netPremium === 1745, '5 contracts net premium = $1,750 - $5 = $1,745');
  assert(multi5.returnOnCapitalPercent === stdRes.returnOnCapitalPercent, 'ROC % is identical regardless of contract count');

  // Test 3: In-The-Money CSP (High Assignment Risk)
  const itmRes = calculateCSPMetrics({
    stockPrice: 130,
    strikePrice: 140,
    premium: 12.00,
    contracts: 2,
    dte: 15,
  });
  assert(itmRes.isITM === true, '140 Strike vs 130 Stock is ITM (isITM = true)');
  assert(itmRes.collateralRequired === 28000, '2 contracts 140 strike = $28,000 collateral');
  assert(itmRes.recommendationType === 'danger', 'ITM trade recommendation is danger');

  // Test 4: Zero / Invalid input & Edge Case NaN protection tests
  const invalidRes = calculateCSPMetrics({
    stockPrice: 0,
    strikePrice: 0,
    premium: 0,
    contracts: 0,
    dte: 0,
  });
  assert(invalidRes.score === 0, 'Zero stock/strike returns score 0 without NaN crash');
  assert(invalidRes.collateralRequired === 0, 'Zero collateral without crash');

  const negNetRes = calculateCSPMetrics({
    stockPrice: 100,
    strikePrice: 90,
    premium: 0.10,
    contracts: 1,
    dte: 30,
    commissions: 50.00, // High commission causing negative net income
  });
  assert(!isNaN(negNetRes.annualizedApy), 'Negative net income APY does not evaluate to NaN');

  const longDteRes = calculateCSPMetrics({
    stockPrice: 100,
    strikePrice: 90,
    premium: 2.00,
    contracts: 1,
    dte: 1000,
  });
  assert(longDteRes.score >= 0 && !isNaN(longDteRes.annualizedApr), 'Extreme DTE (1000 days) evaluates cleanly without NaN');

  // Test 5: Roll Down & Out Simulation
  const rollRes = calculateRollCSP({
    currentStrike: 140,
    currentContracts: 1,
    closeCostPerContract: 5.00,
    newStrike: 135,
    newPremiumPerContract: 7.50,
  });
  assert(rollRes.closeDebitTotal === 500, 'Close Debit = $500');
  assert(rollRes.newCreditTotal === 750, 'New Credit = $750');
  assert(rollRes.netCreditOrDebit === 250, 'Net Credit = $250');
  assert(rollRes.isNetCredit === true, 'Roll is Net Credit');

  // Test 5b: Roll with Initial Leg Premium (Cumulative Cost Basis)
  const rollWithInitial = calculateRollCSP({
    currentStrike: 140,
    currentContracts: 1,
    closeCostPerContract: 4.50,
    newStrike: 135,
    newPremiumPerContract: 6.20,
    originalPremiumPerShare: 5.00,
  });
  assert(rollWithInitial.netCreditOrDebit === 170, 'Net credit for roll with initial = $170');
  assert(rollWithInitial.newEffectiveCostBasis === 128.30, 'Cumulative cost basis incorporates initial premium = $128.30');

  // Test 6: Theta Decay Series
  const decaySeries = calculateCSPTimeDecay({ premium: 5.00, dte: 30 });
  assert(decaySeries.length === 11, 'Time decay returns 11 data points');
  assert(decaySeries[0].value === 5.00, 'Day 0 value is initial premium ($5.00)');
  assert(decaySeries[decaySeries.length - 1].value === 0, 'Final day value decays to 0');

  // Test 7: Greeks & Probability of Profit (POP) Math Engine
  assert(stdRes.greeks !== undefined, 'Greeks metrics attached to CSP metrics');
  if (stdRes.greeks) {
    assert(stdRes.greeks.delta < 0, 'Put delta is negative (e.g., -0.22)');
    assert(stdRes.greeks.probabilityOfProfit > 50, 'OTM CSP probability of profit is > 50%');
    assert(stdRes.greeks.probabilityAssignment < 50, 'OTM CSP assignment probability is < 50%');
    assert(!isNaN(stdRes.greeks.thetaPerDay), 'Daily theta decay is a valid number');
  }

  // Test 8: Data Retention Pruning
  const now = Date.now();
  const mockHistory: any[] = [
    { id: '1', ticker: 'AAPL', createdAt: new Date(now - 10 * 86400000).toISOString() }, // 10 days old
    { id: '2', ticker: 'NVDA', createdAt: new Date(now - 45 * 86400000).toISOString() }, // 45 days old
    { id: '3', ticker: 'TSLA', createdAt: new Date(now - 120 * 86400000).toISOString() }, // 120 days old
  ];

  const pruned30 = pruneHistoryByRetention(mockHistory, 30);
  assert(pruned30.length === 1 && pruned30[0].ticker === 'AAPL', 'Pruning to 30 days removes items > 30 days old');

  const pruned90 = pruneHistoryByRetention(mockHistory, 90);
  assert(pruned90.length === 2, 'Pruning to 90 days preserves AAPL and NVDA, removes TSLA');

  const prunedForever = pruneHistoryByRetention(mockHistory, 9999);
  assert(prunedForever.length === 3, 'Retention 9999 preserves all historical records indefinitely');

  // Test 9: Earnings Risk Detection
  const nvdaEarningsRisk = checkEarningsRisk('NVDA', 30);
  assert(nvdaEarningsRisk.hasEarningsRisk === true, 'NVDA 30 DTE detects upcoming earnings announcement');
  assert(nvdaEarningsRisk.earningsDate !== undefined, 'Earnings date returned for NVDA');

  const spyEarningsRisk = checkEarningsRisk('SPY', 30);
  assert(spyEarningsRisk.hasEarningsRisk === false, 'Index ETF SPY has no single-stock earnings risk');

  const earningsMetric = calculateCSPMetrics({
    stockPrice: 150,
    strikePrice: 140,
    premium: 4.50,
    contracts: 1,
    dte: 30,
    earningsDate: '2026-11-18',
  });
  assert(earningsMetric.score <= 60, 'Earnings risk caps score to maximum 60');
  assert(earningsMetric.recommendationType === 'warning', 'Earnings risk marks recommendation as warning');

  // Test 10: Explicit IV Pass-Through to Greeks
  const highIvMetric = calculateCSPMetrics({
    stockPrice: 150,
    strikePrice: 140,
    premium: 4.50,
    contracts: 1,
    dte: 30,
    impliedVol: 0.65, // 65% IV
  });
  assert(highIvMetric.greeks?.impliedVolEstimate === 65.0, 'Explicit IV 0.65 reflects as 65.0% in Greeks');

  // Test 11: RevenueCat Entitlement Matching Resilience
  assert(isCustomerEntitled({ entitlements: { active: { Premium: {} } } }) === true, 'Matches exact "Premium" entitlement');
  assert(isCustomerEntitled({ entitlements: { active: { premium: {} } } }) === true, 'Matches lowercase "premium" entitlement');
  assert(isCustomerEntitled({ entitlements: { active: { pro: {} } } }) === true, 'Matches "pro" entitlement alias');
  assert(isCustomerEntitled({ entitlements: { active: { csp_premium: {} } } }) === true, 'Matches "csp_premium" alias');
  assert(isCustomerEntitled({ entitlements: { active: { custom_any_tier: {} } } }) === true, 'Matches any active RevenueCat subscription key');
  assert(isCustomerEntitled({ entitlements: { active: {} } }) === false, 'Returns false for empty active entitlements');
  assert(isCustomerEntitled(null) === false, 'Returns false for null customerInfo safely');

  // Test 12: Roll P&L Accounting & Zero Double-Counting
  // User opens AAPL Put at $5.00 premium
  const originalTrade: CSPTrade = {
    id: 'trade_1',
    ticker: 'AAPL',
    stockPrice: 150,
    strikePrice: 140,
    premium: 5.00,
    contracts: 1,
    expirationDate: '2026-11-20',
    dte: 20,
    commissions: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  // User rolls position: buys to close at $3.30 debit, sells new at $5.00 credit
  const closeDebitPerShare = 3.30;
  const newStrike = 135;
  const newPremium = 5.00;
  const netCredit = newPremium - closeDebitPerShare; // +1.70
  const leg1Realized = parseFloat((originalTrade.premium - closeDebitPerShare).toFixed(2)); // +1.70
  const cumulativeCostBasisCredit = parseFloat((originalTrade.premium + netCredit).toFixed(2)); // 6.70

  assert(leg1Realized === 1.70, 'Leg 1 realized P&L is original premium minus close debit ($5.00 - $3.30 = +$1.70)');
  assert(cumulativeCostBasisCredit === 6.70, 'Total cumulative credit reducing cost basis is $6.70');

  // Archived trade in history:
  const archivedTrade: CSPTrade = {
    ...originalTrade,
    status: 'closed_early',
    cumulativePremium: leg1Realized,
  };

  // Rolled active trade:
  const rolledTrade: CSPTrade = {
    id: 'trade_2',
    ticker: 'AAPL',
    stockPrice: 150,
    strikePrice: newStrike,
    premium: newPremium,
    contracts: 1,
    expirationDate: '2026-12-20',
    dte: 50,
    commissions: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    rolledFromId: originalTrade.id,
    cumulativePremium: newPremium,
    cumulativeCostBasisCredit: cumulativeCostBasisCredit,
  };

  // Verify Active Trades calculations:
  const activeEffectiveBasis = rolledTrade.strikePrice - (rolledTrade.cumulativeCostBasisCredit || rolledTrade.premium);
  assert(activeEffectiveBasis === 128.30, 'Active rolled trade effective cost basis is $135 - $6.70 = $128.30');
  const activeOpenIncome = rolledTrade.premium * 100 * rolledTrade.contracts;
  assert(activeOpenIncome === 500, 'Active open trade premium income is exactly $500');

  // When rolled trade expires worthless in history:
  const expiredRolledTrade: CSPTrade = {
    ...rolledTrade,
    status: 'expired_worthless',
  };
  const mockFullHistory = [archivedTrade, expiredRolledTrade];
  const totalLifetimeIncome = mockFullHistory.reduce(
    (sum, t) => sum + ((t.cumulativePremium !== undefined ? t.cumulativePremium : t.premium) * 100 * t.contracts - t.commissions),
    0
  );
  assert(
    totalLifetimeIncome === 670,
    'Lifetime history income sums Leg 1 ($170) + Leg 2 ($500) = $670 exactly with zero double counting'
  );

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}