// Simple ordinary-least-squares linear trend projection over historical
// (day_index, rate) points. This is a naive statistical extrapolation of
// recent trend, NOT a financial forecast - callers must present it as such.
function linearForecast(points, daysAhead) {
  const n = points.length;
  if (n < 2) return null;

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const [x, y] of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const lastX = points[points.length - 1][0];
  const targetX = lastX + daysAhead;
  return intercept + slope * targetX;
}

module.exports = { linearForecast };
