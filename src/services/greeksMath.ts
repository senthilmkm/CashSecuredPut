// Greeks & Probability Math Engine for CashSecuredProfit

/**
 * Cumulative Standard Normal Distribution Approximation (Abramowitz & Stegun formula 26.2.17)
 */
function cumulativeStdNormal(x: number): number {
  if (x < -6.0) return 0.0;
  if (x > 6.0) return 1.0;

  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c2 = 0.39894228;

  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const b = c2 * Math.exp((-x * x) / 2.0);
  let n = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
  n = 1.0 - b * n;

  if (x < 0.0) {
    n = 1.0 - n;
  }
  return n;
}

export interface CSPGreeksAndProbabilities {
  delta: number;                  // Put Delta (e.g., -0.25)
  absDelta: number;               // Absolute Delta (e.g., 0.25)
  probabilityOTM: number;         // Prob % of expiring OTM (Stock > Strike)
  probabilityAssignment: number;  // Prob % of getting assigned (Stock < Strike)
  probabilityOfProfit: number;   // Prob % of expiring above Breakeven (Stock > Strike - Premium)
  impliedVolEstimate: number;     // Estimated IV %
  thetaPerDay: number;            // Daily time decay rate ($ per share)
}

/**
 * Calculates option Delta and probabilities for Cash-Secured Puts
 */
export function calculateCSPGreeks(params: {
  stockPrice: number;
  strikePrice: number;
  premium: number;
  dte: number;
  riskFreeRate?: number; // Default 0.05 (5%)
  impliedVol?: number;   // Optional IV (e.g., 0.30 for 30%), default estimated if missing
}): CSPGreeksAndProbabilities {
  const {
    stockPrice,
    strikePrice,
    premium,
    dte,
    riskFreeRate = 0.05,
  } = params;

  const S = Math.max(0.01, stockPrice);
  const K = Math.max(0.01, strikePrice);
  const P = Math.max(0, premium);
  const T = Math.max(1, dte) / 365.0; // Time in years
  const r = riskFreeRate;

  // Estimate IV if not provided: rough approximation based on premium and DTE
  let iv = params.impliedVol;
  if (!iv || iv <= 0) {
    // Basic inversion heuristic: P ≈ S * IV * sqrt(T) * 0.4
    const approxIv = P / (S * Math.sqrt(T) * 0.4);
    iv = Math.min(1.5, Math.max(0.15, isNaN(approxIv) ? 0.30 : approxIv));
  }

  const sigma = iv;
  const sqrtT = Math.sqrt(T);

  // Black-Scholes d1 & d2
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2.0) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  // Put Delta: -N(-d1) = N(d1) - 1
  const putDelta = cumulativeStdNormal(d1) - 1.0;
  const absDelta = Math.abs(putDelta);

  // Probability of expiring OTM (S_T > K) ≈ N(d2)
  const probabilityOTM = Math.min(99.9, Math.max(0.1, cumulativeStdNormal(d2) * 100));
  const probabilityAssignment = 100.0 - probabilityOTM;

  // Breakeven price = Strike - Premium
  const breakeven = Math.max(0.01, K - P);
  const d2Breakeven = (Math.log(S / breakeven) + (r - (sigma * sigma) / 2.0) * T) / (sigma * sqrtT);
  const probabilityOfProfit = Math.min(99.9, Math.max(0.1, cumulativeStdNormal(d2Breakeven) * 100));

  // Theta approximation ($ per day per share)
  const thetaYearly = -(S * sigma * Math.exp((-d1 * d1) / 2.0)) / (2 * Math.sqrt(2 * Math.PI * T)) + r * K * Math.exp(-r * T) * cumulativeStdNormal(-d2);
  const thetaPerDay = Math.abs(thetaYearly / 365.0);

  return {
    delta: parseFloat(putDelta.toFixed(3)),
    absDelta: parseFloat(absDelta.toFixed(3)),
    probabilityOTM: parseFloat(probabilityOTM.toFixed(1)),
    probabilityAssignment: parseFloat(probabilityAssignment.toFixed(1)),
    probabilityOfProfit: parseFloat(probabilityOfProfit.toFixed(1)),
    impliedVolEstimate: parseFloat((sigma * 100).toFixed(1)),
    thetaPerDay: parseFloat(thetaPerDay.toFixed(3)),
  };
}
