import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCEPT_BUTTON_SELECTORS,
  COOKIE_BANNER_HIDE_CSS,
  SHADOW_DOM_ACCEPT_TARGETS,
  dismissCookieBanner,
  getCookieBannerDismissScript,
  registerCookieBannerHideOnNewDocument
} from "../src/cookie-banner-dismiss.js";

test("hide CSS covers Sourcepoint, Funding Choices, and consentmanager", () => {
  assert.match(COOKIE_BANNER_HIDE_CSS, /sp_message_container/);
  assert.match(COOKIE_BANNER_HIDE_CSS, /privacy-mgmt\.com/);
  assert.match(COOKIE_BANNER_HIDE_CSS, /fc-consent-root/);
  assert.match(COOKIE_BANNER_HIDE_CSS, /#cmpbox/);
  assert.match(COOKIE_BANNER_HIDE_CSS, /BorlabsCookie/);
  assert.match(COOKIE_BANNER_HIDE_CSS, /#cc-main/);
  assert.match(COOKIE_BANNER_HIDE_CSS, /iubenda/);
  assert.match(COOKIE_BANNER_HIDE_CSS, /#hs-eu-cookie-confirmation/);
});

test("accept selectors include Sourcepoint choice types and Didomi notice", () => {
  assert.ok(ACCEPT_BUTTON_SELECTORS.some((selector) => selector.includes("sp_choice_type_11")));
  assert.ok(ACCEPT_BUTTON_SELECTORS.includes("#didomi-notice-agree-button"));
  assert.ok(ACCEPT_BUTTON_SELECTORS.includes("#c-p-bn"));
  assert.ok(ACCEPT_BUTTON_SELECTORS.includes("#hs-eu-confirmation-button"));
  assert.ok(SHADOW_DOM_ACCEPT_TARGETS.some((target) => target.host === "#usercentrics-root"));
});

test("dismiss script clicks fixed banners and open shadow roots", () => {
  const script = getCookieBannerDismissScript();
  assert.doesNotMatch(script, /offsetParent/);
  assert.match(script, /getComputedStyle/);
  assert.match(script, /shadowRoot/);
  assert.match(script, /uc-accept-all-button/);
  assert.match(script, /sp_choice_type_11/);
});

test("registerCookieBannerHideOnNewDocument uses Playwright addInitScript payload", async () => {
  const calls: unknown[] = [];
  await registerCookieBannerHideOnNewDocument({
    addInitScript: async (fn, payload) => {
      calls.push({ fn, payload });
    }
  });
  assert.equal(calls.length, 1);
  const payload = (calls[0] as { payload: { css: string; styleId: string; hosts: string[] } }).payload;
  assert.match(payload.css, /sp_message_container/);
  assert.equal(payload.styleId, "dig-cookie-banner-hide");
  assert.ok(payload.hosts.includes("#usercentrics-root"));
});

test("dismissCookieBanner retries and evaluates CMP iframes", async () => {
  let styles = 0;
  let pageEvals = 0;
  let frameEvals = 0;
  const page = {
    addStyleTag: async () => {
      styles += 1;
    },
    evaluate: async () => {
      pageEvals += 1;
    },
    frames: () => [
      {
        url: () => "https://cdn.privacy-mgmt.com/index.html",
        evaluate: async () => {
          frameEvals += 1;
        }
      },
      {
        url: () => "https://example.com/about",
        evaluate: async () => {
          throw new Error("should not evaluate unrelated frames");
        }
      }
    ]
  };
  const result = await dismissCookieBanner(page, { retries: 2, retryDelayMs: 0, postDismissWaitMs: 0 });
  assert.equal(result.attempted, true);
  assert.equal(styles, 3);
  assert.ok(pageEvals >= 3);
  assert.equal(frameEvals, 3);
});
