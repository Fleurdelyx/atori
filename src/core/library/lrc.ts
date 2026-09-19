export interface LyricLine {
  time: number; // seconds
  text: string;
}

const LRC_LINE = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/**
 * Parse LRC-formatted lyrics. Returns timed lines, or null when the text
 * carries no timestamps (plain lyrics render as a static sheet).
 */
export function parseLrc(raw: string): LyricLine[] | null {
  const lines: LyricLine[] = [];
  let sawTimestamp = false;
  for (const line of raw.split(/\r?\n/)) {
    const stamps: number[] = [];
    let last = 0;
    for (const m of line.matchAll(LRC_LINE)) {
      sawTimestamp = true;
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fracRaw = m[3] ?? "0";
      const frac = parseInt(fracRaw, 10) / Math.pow(10, fracRaw.length);
      stamps.push(min * 60 + sec + frac);
      last = (m.index ?? 0) + m[0].length;
    }
    const text = line.slice(last).trim();
    if (stamps.length === 0) {
      if (!text) continue; // blank line
      if (line.includes("[")) continue; // [ar:] / [ti:] metadata tag
      lines.push({ time: Number.MAX_SAFE_INTEGER, text }); // untimed tail
      continue;
    }
    for (const t of stamps) lines.push({ time: t, text });
  }
  if (!sawTimestamp) return null;
  return lines.sort((a, b) => a.time - b.time);
}
