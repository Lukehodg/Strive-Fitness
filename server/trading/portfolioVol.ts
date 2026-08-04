// Portfolio-level volatility targeting — size the BOOK, not each trade.
//
// WHAT WAS MISSING. sizing.computeVolatilityMultiplier already targets
// volatility, but PER SYMBOL: each position is scaled so that position has the
// intended risk. That is not the same as the account having the intended risk.
// Three crypto positions each sized to 0.4% daily vol is not a 0.4% book — the
// pairs move together, so the aggregate lands nearer 1.0-1.2%. The account
// takes triple the risk that every individual sizing decision believed it was
// taking, and nothing in the system noticed, because nothing was looking at the
// aggregate.
//
// maxCorrelatedExposurePct in portfolio.ts caps correlated NOTIONAL, which is
// related but blunter: it treats a placid large-cap and a violent small-cap as
// the same risk per dollar. Volatility is the thing actually being budgeted, so
// budget it directly.
//
// THIS ONLY EVER SCALES DOWN. Like the confidence governor, it is a ceiling on
// aggregate risk, never a licence to size past the per-trade limits. Portfolio
// vol targeting that scales UP would let a quiet market talk the engine into
// leverage precisely before volatility returns, which is the classic way a
// vol-targeting book blows up.

/** One held position's contribution to portfolio risk. */
export interface RiskLeg {
  symbol: string;
  /** Position value as a fraction of equity. */
  weight: number;
  /** Per-bar return standard deviation for this symbol. */
  vol: number;
}

export interface VolTargetResult {
  /** Scale to apply to the candidate's notional, in [0, 1]. */
  multiplier: number;
  /** Portfolio vol if the candidate were taken at full requested size. */
  projectedVol: number;
  /** Portfolio vol of what is already held. */
  currentVol: number;
  reason: string;
}

/** Standard deviation of a return series. */
export function volatilityOf(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, v) => a + v, 0) / returns.length;
  const varr = returns.reduce((a, v) => a + (v - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(varr);
}

/**
 * Volatility of a portfolio of weighted legs.
 *
 *   sigma_p = sqrt( sum_i sum_j w_i w_j sigma_i sigma_j rho_ij )
 *
 * `corr(a, b)` supplies pairwise correlation; it must return 1 for a == b.
 * Unknown pairs should return 1 (assume they move together) — the conservative
 * reading, since underestimating correlation is what makes a book look
 * diversified when it isn't.
 */
export function portfolioVolatility(
  legs: RiskLeg[],
  corr: (a: string, b: string) => number,
): number {
  let variance = 0;
  for (const i of legs) {
    for (const j of legs) {
      const rho = i.symbol === j.symbol ? 1 : corr(i.symbol, j.symbol);
      variance += i.weight * j.weight * i.vol * j.vol * rho;
    }
  }
  return Math.sqrt(Math.max(0, variance));
}

/**
 * How much of a candidate position the portfolio's volatility budget allows.
 *
 * Portfolio variance is a quadratic in the candidate's weight w:
 *
 *   sigma_p(w)^2 = a*w^2 + b*w + c
 *     a = sigma_c^2
 *     b = 2 * sigma_c * sum_i (w_i * sigma_i * rho_ic)
 *     c = variance of what is already held
 *
 * Solving sigma_p(w) = target for the positive root gives the largest weight
 * that keeps the book inside its budget, exactly — no iteration needed.
 */
export function volTargetMultiplier(
  held: RiskLeg[],
  candidate: RiskLeg,
  targetPortfolioVol: number,
  corr: (a: string, b: string) => number,
): VolTargetResult {
  const currentVol = portfolioVolatility(held, corr);
  const projectedVol = portfolioVolatility([...held, candidate], corr);

  // Disabled, or nothing measurable to work with: don't interfere.
  if (!(targetPortfolioVol > 0) || !(candidate.vol > 0) || !(candidate.weight > 0)) {
    return { multiplier: 1, projectedVol, currentVol, reason: "vol targeting inactive" };
  }
  if (projectedVol <= targetPortfolioVol) {
    return {
      multiplier: 1,
      projectedVol,
      currentVol,
      reason: `book vol ${(projectedVol * 100).toFixed(2)}% within ${(targetPortfolioVol * 100).toFixed(2)}% budget`,
    };
  }
  // Already over budget before adding anything: take nothing more.
  if (currentVol >= targetPortfolioVol) {
    return {
      multiplier: 0,
      projectedVol,
      currentVol,
      reason: `book vol ${(currentVol * 100).toFixed(2)}% already at the ${(targetPortfolioVol * 100).toFixed(2)}% budget`,
    };
  }

  const a = candidate.vol ** 2;
  let b = 0;
  for (const leg of held) {
    b += leg.weight * leg.vol * corr(leg.symbol, candidate.symbol);
  }
  b *= 2 * candidate.vol;
  const c = currentVol ** 2 - targetPortfolioVol ** 2; // < 0 here

  // a > 0 and c < 0, so the discriminant is positive and exactly one root is
  // positive — no ambiguity about which to take.
  const disc = b * b - 4 * a * c;
  const w = (-b + Math.sqrt(disc)) / (2 * a);
  const multiplier = Math.max(0, Math.min(1, w / candidate.weight));

  return {
    multiplier,
    projectedVol,
    currentVol,
    reason:
      `book vol would be ${(projectedVol * 100).toFixed(2)}% vs ${(targetPortfolioVol * 100).toFixed(2)}% budget — ` +
      `sized to ${(multiplier * 100).toFixed(0)}%`,
  };
}

/**
 * The correlation lookup the engine needs, built from the candidate-vs-held
 * correlations it already computes.
 *
 * Extracted from an inline closure in engine.ts so it can be tested. Its one
 * subtlety is deliberate and easy to get wrong: only candidate-vs-held pairs
 * are ever measured, so HELD-vs-HELD pairs are unknown and assumed to be 1.
 * That overstates portfolio risk rather than understating it, which is the
 * only safe direction — a book that assumes its holdings are independent when
 * they are not is exactly the failure this module exists to prevent.
 */
export function correlationLookup(
  candidateSymbol: string,
  candidateVsHeld: Record<string, number>,
): (a: string, b: string) => number {
  return (a, b) => {
    if (a === b) return 1;
    if (a === candidateSymbol) return candidateVsHeld[b] ?? 1;
    if (b === candidateSymbol) return candidateVsHeld[a] ?? 1;
    return 1;
  };
}
