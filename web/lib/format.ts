/** Backend timestamps look like "2026-10-02 16:55:00-04:00"; Safari needs the ISO "T". */
export function parseTs(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDateTime(s: string | null | undefined, lang: string): string {
  const d = parseTs(s);
  if (!d) return "-";
  return new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function fmtDate(s: string | null | undefined, lang: string): string {
  const d = parseTs(s);
  if (!d) return "-";
  return new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export const pct = (x: number | null | undefined, digits = 0): string =>
  x === null || x === undefined ? "-" : `${(x * 100).toFixed(digits)}%`;

export const signedPct = (x: number | null | undefined, digits = 2): string =>
  x === null || x === undefined ? "-" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;

export const price = (x: number | null | undefined): string =>
  x === null || x === undefined ? "-" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(x);

/** Seconds since epoch for chart libraries, made strictly increasing. */
export function chartTimes<T extends { time: string }>(rows: T[]): (Omit<T, "time"> & { time: number })[] {
  let last = 0;
  const out: (Omit<T, "time"> & { time: number })[] = [];
  for (const r of rows) {
    const secs = Math.floor((parseTs(r.time)?.getTime() ?? 0) / 1000);
    last = Math.max(secs, last + 1);
    out.push({ ...r, time: last });
  }
  return out;
}
