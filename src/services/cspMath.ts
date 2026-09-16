// Cash-Secured Put (CSP) Scoring & Calculations Service

export interface CSPTradeMetrics {
  collateralRequired: number;       // Strike Price * 100 * Contracts
  netPremium: number;               // Total Premium collected - Commissions
  returnOnCapitalPercent: number;  // ROC % (Net Premium / Collateral Required) * 100
  effectiveCostBasis: number;       // Strike Price - Premium per share
  effectiveDiscountPercent: number; // Discount from stock price if assigned (%)
  annualizedApr: number;            // APR %
  annualizedApy: number;            // APY %
  safetyCushionPercent: number;     // Buffer % (Current Stock - Strike) / Current Stock * 100
  isITM: boolean;                   // In-The-Money flag (Strike > Stock Price)
  score: number;                    // Health Score (0 to 100)
  recommendationTitle: string;
  recommendationDesc: string;
  recommendationType: 'success' | 'warning' | 'danger';
  treasuryBenchmarkYield: number;   // e.g., 5.0% risk-free rate comparison
  yieldSpread: number;              // APR - Treasury Benchmark
}

export function calculateCSPMetrics(params: {
  stockPrice: number;       // Current Stock Price
  strikePrice: number;      // Put Strike Price
  premium: number;          // Premium collected per share
  contracts: number;        // Number of put contracts (1 contract = 100 shares)
  dte: number;              // Days to Expiration
  commissions?: number;     // Optional transaction fees
  treasuryRate?: number;    // Risk-free rate benchmark (default 5.0%)
}): CSPTradeMetrics {
  const {
    stockPrice,
    strikePrice,
    premium,
    contracts,
    dte = 1,
    commissions = 0,
    treasuryRate = 5.0,
  } = params;

  // Sanitize & validate inputs to prevent edge case crashes or NaNs
  const validStock = Math.max(0, isNaN(stockPrice) ? 0 : stockPrice);
  const validStrike = Math.max(0, isNaN(strikePrice) ? 0 : strikePrice);
  const validPremium = Math.max(0, isNaN(premium) ? 0 : premium);
  const validContracts = Math.max(1, isNaN(contracts) || contracts <= 0 ? 1 : Math.floor(contracts));
  const validDte = Math.max(1, isNaN(dte) || dte <= 0 ? 1 : dte);
  const validCommissions = Math.max(0, isNaN(commissions) ? 0 : commissions);

  const totalShares = validContracts * 100;
  const collateralRequired = validStrike * totalShares;
  const grossPremium = validPremium * totalShares;
  const netPremium = Math.max(0, grossPremium - validCommissions);

  // Default invalid fallback
  if (validStock <= 0 || validStrike <= 0 || validPremium <= 0 || collateralRequired <= 0) {
    return {
      collateralRequired: 0,
      netPremium: 0,
      returnOnCapitalPercent: 0,
      effectiveCostBasis: 0,
      effectiveDiscountPercent: 0,
      annualizedApr: 0,
      annualizedApy: 0,
      safetyCushionPercent: 0,
      isITM: false,
      score: 0,
      recommendationTitle: 'Invalid Trade Parameters',
      recommendationDesc: 'Please enter valid stock price, strike price, and premium metrics.',
      recommendationType: 'danger',
      treasuryBenchmarkYield: treasuryRate,
      yieldSpread: 0,
    };
  }

  // 1. Return on Capital (ROC)
  const returnOnCapitalPercent = (netPremium / collateralRequired) * 100;

  // 2. Effective Cost Basis if Assigned
  const effectiveCostBasis = Math.max(0, validStrike - validPremium);
  
  // 3. Discount from current stock price if assigned (%)
  const effectiveDiscountPercent = validStock > 0
    ? ((validStock - effectiveCostBasis) / validStock) * 100
    : 0;

  // 4. Annualized APR & APY
  const annualizedApr = returnOnCapitalPercent * (365 / validDte);
  
  // Compounded APY
  const aprFraction = returnOnCapitalPercent / 100;
  const periodsPerYear = 365 / validDte;
  const annualizedApy = (1 + aprFraction > 0) ? (Math.pow(1 + aprFraction, periodsPerYear) - 1) * 100 : 0;

  // 5. Safety Cushion (Distance from current stock price to strike)
  // Positive % means stock is above strike (OTM - Safe)
  // Negative % means stock is below strike (ITM - High Assignment Risk)
  const safetyCushionPercent = ((validStock - validStrike) / validStock) * 100;
  const isITM = validStrike > validStock;

  // 6. Yield Spread vs Treasury Benchmark
  const yieldSpread = annualizedApr - treasuryRate;

  // 7. Health Scorecard Logic (0 to 100 Score)
  let score = 0;

  // Metric A: Annualized APR (up to 40 pts)
  if (annualizedApr >= 30) {
    score += 40;
  } else if (annualizedApr >= 15) {
    score += 25 + (annualizedApr - 15) * 1.0;
  } else if (annualizedApr >= 5) {
    score += 10 + (annualizedApr - 5) * 1.5;
  } else {
    score += Math.max(0, annualizedApr * 2);
  }

  // Metric B: Safety Cushion / Buffer (up to 40 pts)
  if (safetyCushionPercent >= 10) {
    score += 40;
  } else if (safetyCushionPercent >= 5) {
    score += 25 + (safetyCushionPercent - 5) * 3;
  } else if (safetyCushionPercent > 0) {
    score += safetyCushionPercent * 5;
  } else {
    // ITM Penalty
    score = Math.max(0, score - 30);
  }

  // Metric C: Yield Spread vs Treasury Benchmark (up to 20 pts)
  if (yieldSpread >= 20) {
    score += 20;
  } else if (yieldSpread >= 10) {
    score += 12 + (yieldSpread - 10) * 0.8;
  } else if (yieldSpread > 0) {
    score += yieldSpread * 1.2;
  }

  // DTE Edge Case Check: Excessive DTE penalty (> 90 days reduces capital flexibility)
  if (validDte > 90) {
    score = Math.max(0, score - 10);
  }

  score = Math.min(100, Math.max(0, Math.round(score)));

  // Recommendations
  let recommendationTitle = 'Viable CSP Income Trade';
  let recommendationDesc = 'Moderate return and safety cushion. Suitable for standard income generation.';
  let recommendationType: 'success' | 'warning' | 'danger' = 'warning';

  if (isITM) {
    recommendationTitle = 'In-The-Money (High Assignment Risk)';
    recommendationDesc = `The Strike ($${validStrike.toFixed(2)}) is higher than current stock price ($${validStock.toFixed(2)}). High likelihood of assignment at net cost basis of $${effectiveCostBasis.toFixed(2)}.`;
    recommendationType = 'danger';
  } else if (score >= 70) {
    recommendationTitle = 'Prime Cash-Secured Put Opportunity';
    recommendationType = 'success';
    recommendationDesc = `Excellent risk-reward! Offers a strong safety cushion of ${safetyCushionPercent.toFixed(1)}% with an annualized return of ${annualizedApr.toFixed(1)}% APR (${yieldSpread.toFixed(1)}% above Treasury yield).`;
  } else if (score >= 40) {
    recommendationTitle = 'Viable CSP Income Trade';
    recommendationType = 'warning';
    recommendationDesc = `Moderate return (${annualizedApr.toFixed(1)}% APR) with a ${safetyCushionPercent.toFixed(1)}% safety buffer. Good entry target if you wish to buy the stock at a discount.`;
  } else {
    recommendationTitle = 'Avoid or Re-evaluate Strike';
    recommendationType = 'danger';
    if (annualizedApr < treasuryRate) {
      recommendationDesc = `Annualized APR (${annualizedApr.toFixed(1)}%) is lower than the risk-free Treasury yield (${treasuryRate}%). Capital is inefficiently locked up for low yield.`;
    } else {
      recommendationDesc = `Thin safety cushion (${safetyCushionPercent.toFixed(1)}%). High risk of early assignment if stock drops slightly.`;
    }
  }

  return {
    collateralRequired,
    netPremium,
    returnOnCapitalPercent: parseFloat(returnOnCapitalPercent.toFixed(2)),
    effectiveCostBasis: parseFloat(effectiveCostBasis.toFixed(2)),
    effectiveDiscountPercent: parseFloat(effectiveDiscountPercent.toFixed(2)),
    annualizedApr: parseFloat(annualizedApr.toFixed(2)),
    annualizedApy: parseFloat(annualizedApy.toFixed(2)),
    safetyCushionPercent: parseFloat(safetyCushionPercent.toFixed(2)),
    isITM,
    score,
    recommendationTitle,
    recommendationDesc,
    recommendationType,
    treasuryBenchmarkYield: treasuryRate,
    yieldSpread: parseFloat(yieldSpread.toFixed(2)),
  };
}

/**
 * Calculates a Roll Down & Out simulation for a CSP trade.
 * When a stock drops, a trader closes the existing put for a debit and sells a new put for a credit.
 */
export interface RollSimulationResult {
  closeDebitTotal: number;
  newCreditTotal: number;
  netCreditOrDebit: number;       // Positive = Net Credit collected, Negative = Net Debit paid
  newCollateralRequired: number;
  collateralDifference: number;   // Difference in cash collateral locked
  newEffectiveCostBasis: number;
  isNetCredit: boolean;
}

export function calculateRollCSP(params: {
  currentStrike: number;
  currentContracts: number;
  closeCostPerContract: number;   // Cost per share to buy back existing put
  newStrike: number;
  newPremiumPerContract: number;  // Premium per share collected for new put
  newContracts?: number;
}): RollSimulationResult {
  const {
    currentStrike,
    currentContracts,
    closeCostPerContract,
    newStrike,
    newPremiumPerContract,
    newContracts = currentContracts,
  } = params;

  const validCurrentContracts = Math.max(1, currentContracts);
  const validNewContracts = Math.max(1, newContracts);

  const closeDebitTotal = closeCostPerContract * 100 * validCurrentContracts;
  const newCreditTotal = newPremiumPerContract * 100 * validNewContracts;
  const netCreditOrDebit = newCreditTotal - closeDebitTotal;

  const currentCollateral = currentStrike * 100 * validCurrentContracts;
  const newCollateralRequired = newStrike * 100 * validNewContracts;
  const collateralDifference = newCollateralRequired - currentCollateral;

  // New effective cost basis = New Strike - (New Premium - Close Cost)
  const netPerSharePremium = newPremiumPerContract - closeCostPerContract;
  const newEffectiveCostBasis = Math.max(0, newStrike - netPerSharePremium);

  return {
    closeDebitTotal: parseFloat(closeDebitTotal.toFixed(2)),
    newCreditTotal: parseFloat(newCreditTotal.toFixed(2)),
    netCreditOrDebit: parseFloat(netCreditOrDebit.toFixed(2)),
    newCollateralRequired: parseFloat(newCollateralRequired.toFixed(2)),
    collateralDifference: parseFloat(collateralDifference.toFixed(2)),
    newEffectiveCostBasis: parseFloat(newEffectiveCostBasis.toFixed(2)),
    isNetCredit: netCreditOrDebit >= 0,
  };
}

/**
 * Simulates option price decay (Theta decay) over time
 */
export function calculateCSPTimeDecay(params: {
  premium: number;
  dte: number;
  intervals?: number;
}): { day: number; value: number }[] {
  const { premium, dte, intervals = 10 } = params;
  const series: { day: number; value: number }[] = [];
  const validDte = Math.max(1, dte);

  for (let i = 0; i <= intervals; i++) {
    const fraction = i / intervals;
    const currentDay = Math.round(fraction * validDte);
    const timeRemainingFraction = 1 - fraction;
    // Square root decay approximation
    const decayedValue = premium * Math.sqrt(timeRemainingFraction);
    
    series.push({
      day: currentDay,
      value: parseFloat(decayedValue.toFixed(4)),
    });
  }

  return series;
}
