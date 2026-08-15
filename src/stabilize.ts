import type { Page } from "playwright";

export async function stabilizePage(page: Page, quietWindowMs: number, timeoutMs: number): Promise<boolean> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(({ quietWindowMs, timeoutMs }) => new Promise<boolean>((resolve) => {
    let lastMutation = performance.now();
    const started = performance.now();
    const observer = new MutationObserver(() => { lastMutation = performance.now(); });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const check = () => {
      const now = performance.now();
      if (now - lastMutation >= quietWindowMs) {
        observer.disconnect();
        resolve(true);
      } else if (now - started >= timeoutMs) {
        observer.disconnect();
        resolve(false);
      } else {
        window.setTimeout(check, Math.min(100, quietWindowMs));
      }
    };
    check();
  }), { quietWindowMs, timeoutMs });
}

/**
 * CHECKION-style scroll settle: walk the page so lazy media loads, then return to top.
 * Improves full-page screenshot completeness before DIG continues capture.
 */
export async function scrollSettlePage(
  page: Page,
  options: { stepPx?: number; maxPx?: number; pauseMs?: number } = {}
): Promise<{ scrolled_px: number; document_height: number }> {
  const stepPx = options.stepPx ?? 100;
  const maxPx = options.maxPx ?? 8000;
  const pauseMs = options.pauseMs ?? 40;
  return page.evaluate(
    async ({ stepPx, maxPx, pauseMs }) => {
      const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
      const height = () =>
        Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ?? 0,
          document.documentElement.clientHeight
        );
      let y = 0;
      let scrolled = 0;
      const limit = Math.min(height(), maxPx);
      while (y < limit) {
        y = Math.min(y + stepPx, limit);
        window.scrollTo(0, y);
        scrolled = y;
        await sleep(pauseMs);
      }
      window.scrollTo(0, 0);
      await sleep(200);
      return { scrolled_px: scrolled, document_height: height() };
    },
    { stepPx, maxPx, pauseMs }
  );
}

export async function pauseAnimations(page: Page): Promise<void> {
  await page.addStyleTag({ content: `
    *, *::before, *::after {
      animation-play-state: paused !important;
      transition-property: none !important;
      caret-color: transparent !important;
    }
  ` });
}
