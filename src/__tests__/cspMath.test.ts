declare const process: any;
import { calculateCSPMetrics, calculateRollCSP, calculateCSPTimeDecay } from '../services/cspMath';
import { pruneHistoryByRetention } from '../services/storageUtils';

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

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}