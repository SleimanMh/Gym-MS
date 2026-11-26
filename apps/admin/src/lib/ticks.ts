/** 0 plus 3–5 round ticks covering `max`. */
export function niceTicks(max: number): number[] {
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const out = [0];
  while (out[out.length - 1]! < max) out.push(out[out.length - 1]! + step);
  return out;
}
