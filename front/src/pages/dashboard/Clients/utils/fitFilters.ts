/** Fit a single row without guessing label widths or wrapping controls. */
export function fitFilters(available: number, full: number[], icons: number[], moreWidth: number, active: number) {
  const total = (widths: number[]) => widths.reduce((n, w) => n + w, 0) + Math.max(0, widths.length - 1) * 4;
  if (total(full) <= available) return { compact: false, visible: full.map((_, i) => i) };
  if (total(icons) <= available) return { compact: true, visible: icons.map((_, i) => i) };
  const priority = [active, ...icons.map((_, i) => i).filter(i => i !== active)].filter(i => i >= 0 && i < icons.length);
  let used = moreWidth;
  const visible: number[] = [];
  for (const i of priority) {
    if (used + icons[i] + 4 <= available) { visible.push(i); used += icons[i] + 4; }
  }
  return { compact: true, visible: visible.sort((a, b) => a - b) };
}
