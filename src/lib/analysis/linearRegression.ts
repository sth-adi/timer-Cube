/**
 * Ordinary least squares via the normal equations, solved with Gaussian
 * elimination and partial pivoting. Small, dependency-free, and exactly
 * enough linear algebra for a handful of features — this is what powers the
 * predictive solve-time model, trained fresh on the user's own history
 * entirely in the browser, no server or ML library involved.
 */

export interface RegressionFit {
  /** Coefficients, intercept first: predicted = coefficients[0] + coefficients[1]*x1 + ... */
  coefficients: number[];
  /** Standard deviation of the residuals (actual - predicted) over the training data — the model's own honest error bar. */
  residualStdDev: number;
  sampleCount: number;
}

/** Solves Ax = b for a square, well-conditioned A. Returns null if A is (numerically) singular. */
function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = a.length;
  // Augmented matrix, worked on in place.
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivotRow][col])) pivotRow = row;
    }
    [m[col], m[pivotRow]] = [m[pivotRow], m[col]];

    if (Math.abs(m[col][col]) < 1e-10) return null; // singular — not enough independent information

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      for (let c = col; c <= n; c++) m[row][c] -= factor * m[col][c];
    }
  }

  return m.map((row, i) => row[n] / row[i]);
}

/**
 * Fits `y ~ intercept + features` by least squares. `features[i]` must all
 * have the same length (the number of predictors). Returns null when there
 * isn't enough independent data to fit reliably — fewer samples than
 * parameters, or features that don't vary independently of each other.
 */
export function fitLinearRegression(features: readonly number[][], y: readonly number[]): RegressionFit | null {
  const n = features.length;
  if (n === 0 || n !== y.length) return null;
  const p = features[0].length + 1; // +1 for the intercept
  // Require a healthy margin over the parameter count, or the fit is just
  // noise dressed up as a model.
  if (n < p * 4) return null;

  // Design matrix X with a leading column of 1s for the intercept.
  const design = features.map((row) => [1, ...row]);

  const xtx: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const xty: number[] = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < p; r++) {
      xty[r] += design[i][r] * y[i];
      for (let c = 0; c < p; c++) xtx[r][c] += design[i][r] * design[i][c];
    }
  }

  const coefficients = solveLinearSystem(xtx, xty);
  if (!coefficients) return null;

  let sumSquaredResiduals = 0;
  for (let i = 0; i < n; i++) {
    const predicted = design[i].reduce((sum, x, j) => sum + x * coefficients[j], 0);
    sumSquaredResiduals += (y[i] - predicted) ** 2;
  }
  const residualStdDev = Math.sqrt(sumSquaredResiduals / Math.max(1, n - p));

  return { coefficients, residualStdDev, sampleCount: n };
}

/** Applies a fitted model to one feature vector. */
export function predict(fit: RegressionFit, featureVector: readonly number[]): number {
  const [intercept, ...slopes] = fit.coefficients;
  return intercept + slopes.reduce((sum, coef, i) => sum + coef * featureVector[i], 0);
}

/**
 * Standard-normal CDF (Abramowitz & Stegun 26.2.17 approximation, max error
 * ~7.5e-8) — used to turn "predicted time vs. your current PB, plus the
 * model's own residual spread" into a rough PB probability.
 */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Rough probability that a solve on this scramble beats `targetMs` (e.g. the
 * user's current PB), treating residuals as normally distributed around the
 * point prediction. A genuinely rough estimate — it's disclosed as such
 * everywhere it's shown — but a principled one, not a made-up number.
 */
export function probabilityBelow(fit: RegressionFit, predictedMs: number, targetMs: number): number {
  if (fit.residualStdDev <= 0) return predictedMs < targetMs ? 1 : 0;
  return normalCdf((targetMs - predictedMs) / fit.residualStdDev);
}
