import type { Page } from "playwright";

export async function installPerformanceObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const evidence = { layoutShifts: [] as unknown[], longTasks: [] as unknown[] };
    Object.defineProperty(window, "__digPerformanceEvidence", { value: evidence, configurable: false });
    try {
      new PerformanceObserver((list) => evidence.layoutShifts.push(...list.getEntries().map((entry) => {
        const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean; sources?: unknown[] };
        return { start_time: shift.startTime, value: shift.value ?? 0, had_recent_input: shift.hadRecentInput ?? false };
      }))).observe({ type: "layout-shift", buffered: true });
    } catch { /* unsupported */ }
    try {
      new PerformanceObserver((list) => evidence.longTasks.push(...list.getEntries().map((entry) => ({
        start_time: entry.startTime, duration: entry.duration, name: entry.name
      })))).observe({ type: "longtask", buffered: true });
    } catch { /* unsupported */ }
  });
}

export async function collectPerformanceEvidence(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const evidence = (window as unknown as { __digPerformanceEvidence?: { layoutShifts: Array<{ value?: number; had_recent_input?: boolean }>; longTasks: unknown[] } }).__digPerformanceEvidence ?? { layoutShifts: [], longTasks: [] };
    const navigation = performance.getEntriesByType("navigation")[0]?.toJSON() ?? null;
    const paints = performance.getEntriesByType("paint").map((entry) => entry.toJSON());
    const cumulativeLayoutShift = evidence.layoutShifts
      .filter((shift) => !shift.had_recent_input)
      .reduce((sum, shift) => sum + (shift.value ?? 0), 0);
    return {
      navigation,
      paints,
      layout_shifts: evidence.layoutShifts,
      cumulative_layout_shift: Number(cumulativeLayoutShift.toFixed(6)),
      long_tasks: evidence.longTasks,
      provenance: { layer: "L1", method: "performance_observer", confidence: 1 }
    };
  });
}
