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

export async function pauseAnimations(page: Page): Promise<void> {
  await page.addStyleTag({ content: `
    *, *::before, *::after {
      animation-play-state: paused !important;
      transition-property: none !important;
      caret-color: transparent !important;
    }
  ` });
}
