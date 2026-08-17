/**
 * Cookie-banner dismiss for DIG Playwright capture.
 * Ported from CHECKION `lib/cookie-banner-dismiss.ts` (CSS hide + multilingual accept click).
 * Call after navigation / scroll-settle and before screenshots.
 */

import { cookieConsentConfig } from "./runtime-paths.js";

/* eslint-disable max-len */

/** CSS-Selektoren für Cookie-/Consent-Banner-Container (display:none). */
export const COOKIE_BANNER_HIDE_CSS = `
  /* OneTrust */
  #onetrust-consent-sdk,
  #onetrust-banner-sdk,
  .onetrust-pc-dark-filter,
  .ot-pc-scrollbar,
  #ot-pc-content,
  [id^="onetrust-"],
  [class^="ot-"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* Cookiebot */
  #CybotCookiebotDialog,
  #CybotCookiebotDialogBody,
  #CybotCookiebotDialogBodyUnderlay,
  .CybotCookiebotDialog,
  .CybotCookiebotDialogActive,
  div[id^="CybotCookiebotDialog"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* CookieYes */
  .cky-consent-container,
  .cky-banner,
  .cky-modal,
  div[class^="cky-"],
  #cky-consent-bar {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* Quantcast / Quantcast Choice */
  #qc-cmp2-main,
  #qc-cmp2-container,
  .qc-cmp2-container,
  .qc-cmp2-summary-buttons,
  div[id^="qc-cmp-"],
  div[class^="qc-cmp"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* Termly */
  #termly-code-snippet-support,
  .termly-code-snippet-support,
  div[id^="termly-"],
  .termly-overlay {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* TrustArc */
  .truste_overlay,
  .truste_box_overlay,
  #truste-consent-track,
  .trustarc-banner,
  #trustarc-banner {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* Cookie Law Info (CLI) */
  #cookie-law-info-bar,
  #cliModal,
  .cli-modal,
  .cli_modal,
  .wt-cli-cookie-bar,
  #wt-cli-cookie-bar {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* GDPR Cookie Consent (Moove) */
  .moove-gdpr-modal,
  #moove_gdpr_cookie_info_bar,
  .moove-gdpr-consent-bar,
  #moove_gdpr_cookie_info_bar {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* Complianz */
  .cmplz-cookiebanner,
  #cmplz-cookiebanner,
  .cmplz-banner,
  div[class^="cmplz-"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* Didomi */
  #didomi-host,
  .didomi-popup,
  .didomi-banner,
  [id^="didomi-"],
  .didomi-screen {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* Axeptio */
  .axeptio_overlay,
  .axeptio_modal,
  #axeptio_overlay,
  [class^="axeptio_"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* Usercentrics (Porsche and many EU sites) */
  #usercentrics-root,
  uc-layer,
  uc-layer2,
  [id^="uc-"],
  [class^="uc-"],
  .uc-banner,
  .uc-overlay,
  div[data-testid="uc-container"],
  div[data-testid="uc-banner"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* Tarteaucitron */
  #tarteaucitronAlertBig,
  #tarteaucitronRoot,
  .tarteaucitronAlertBig,
  .tarteaucitronAllow,
  div[id^="tarteaucitron"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* Cookie Notice (generic plugin) */
  .cookie-notice,
  #cookie-notice,
  .cookie-notice-container,
  #cookieNotice,
  .cn-box,
  #cookie-consent,
  .cookie-consent,
  .cc-window,
  .cc_banner-wrapper,
  #cookie-banner,
  .cookie-banner,
  .cookiePolicy,
  #cookiePolicy,
  .gdpr-banner,
  #gdpr-banner,
  .consent-banner,
  #consent-banner,
  .js-cookie-consent,
  #js-cookie-consent {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* Sourcepoint (Hyundai, Stellantis and many OEM homepages; ids/classes get numeric suffixes) */
  [id^="sp_message_container"],
  [id^="sp_message_id"],
  [class^="sp_message_container"],
  [class^="sp_veil"],
  .sp-message-open,
  iframe[id^="sp_message_iframe"],
  iframe[src*="privacy-mgmt.com"],
  iframe[src*="sourcepoint.mgr"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
    max-height: 0 !important;
  }
  html.sp-message-open,
  body.sp-message-open {
    overflow: auto !important;
    height: auto !important;
  }
  /* Google Funding Choices */
  .fc-consent-root,
  #fc-consent-root {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
    max-height: 0 !important;
  }
  /* Borlabs Cookie */
  #BorlabsCookieBox,
  .BorlabsCookie,
  [id^="BorlabsCookie"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* Consentmanager.net */
  #cmpbox,
  #cmpbox2,
  .cmpbox,
  #cmpwrapper {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* CookieFirst / Osano */
  #cookiefirst-root,
  .cookiefirst-root,
  .osano-cm-window,
  .osano-cm-dialog {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* Generic patterns (broad) */
  [id*="cookie" i][id*="banner" i],
  [id*="cookie" i][id*="consent" i],
  [id*="consent" i][id*="banner" i],
  [class*="cookie" i][class*="banner" i],
  [class*="cookie" i][class*="consent" i],
  [class*="consent" i][class*="banner" i],
  [data-testid*="cookie" i],
  [data-testid*="consent" i],
  [aria-label*="cookie" i],
  [aria-label*="consent" i],
  [aria-label*="cookies" i],
  [role="dialog"][aria-label*="cookie" i],
  [role="dialog"][aria-label*="consent" i],
  [role="alertdialog"][aria-label*="cookie" i] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
`;

/** CSS-Selektoren für „Akzeptieren“-Buttons (Provider-spezifisch). */
export const ACCEPT_BUTTON_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '#accept-recommended-btn-handler',
  '.onetrust-close-btn-handler',
  '[data-optan-group="accept"]',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  '.CybotCookiebotDialogBodyButton',
  '.cky-btn-accept',
  '.cky-consent-btn-accept',
  '[data-cky-tag="accept-button"]',
  '[data-cky-tag="accept-all-button"]',
  '.qc-cmp2-summary-buttons button:first-child',
  '.qc-cmp2-button',
  '[data-termly="accept-button"]',
  '.termly-approve-button',
  '.truste_consent_button',
  '#truste-consent-button',
  '.wt-cli-accept-all-btn',
  '.wt-cli-accept-btn',
  '#wt-cli-accept-all-btn',
  '#cookie_action_close_header',
  '.moove-gdpr-agree-button',
  '#moove_gdpr_accept_all',
  '.cmplz-accept',
  '.cmplz-btn.cmplz-accept',
  '#cmplz-cookiebanner .cmplz-accept',
  '.didomi-continue-without-agree',
  '.didomi-button-highlight',
  '[data-didomi-continue="true"]',
  '.didomi-button-standard',
  '#didomi-notice-agree-button',
  '.sp_choice_type_11',
  '[class^="sp_choice_type_11"]',
  '[class*="sp_choice_type_ACCEPT_ALL"]',
  '.fc-cta-consent',
  'button.fc-cta-consent',
  '#cmpwelcomebtnyes',
  '.cmptxt_btn_yes',
  '.osano-cm-accept-all',
  '[data-cookiefirst-action="accept"]',
  '.axeptio_btn_accept',
  '.axeptio_cta_accept',
  '#axeptio_btn_accept',
  '#tarteaucitronAllAllowed',
  '.tarteaucitronAllow',
  '.cookie-notice-ok',
  '.cn-accept-cookie',
  '#cn-accept-cookie',
  '.cc-btn.cc-dismiss',
  '.cc-btn.cc-allow',
  '.cc_btn_accept_all',
  '[data-cc-action="accept"]',
  '[data-action="accept"]',
  '[data-consent="accept"]',
  '[data-cookie-accept]',
  'button[data-testid*="accept" i]',
  'a[data-testid*="accept" i]',
  'button[aria-label*="accept" i]',
  'button[aria-label*="akzeptieren" i]',
  'button[aria-label*="allow" i]',
  'button[aria-label*="agree" i]',
  'button[aria-label*="accept all" i]',
  'button[aria-label*="accept all cookies" i]',
  'a[aria-label*="accept" i]',
  '.js-accept-cookies',
  '#accept-cookies',
  '.accept-cookies',
  '.consent-accept',
  '#consent-accept',
  '.gdpr-accept',
  '#gdpr-accept',
  '#usercentrics-root button[data-testid="uc-accept-all-button"]',
];

/** Open-shadow CMP hosts — CSS cannot pierce shadow roots for clicks. */
export const SHADOW_DOM_ACCEPT_TARGETS: ReadonlyArray<{ host: string; button: string }> = [
  { host: "#usercentrics-root", button: 'button[data-testid="uc-accept-all-button"]' },
  { host: "#usercentrics-root", button: 'button[data-testid="uc-save-button"]' },
  { host: ".fc-consent-root", button: ".fc-cta-consent" },
  { host: ".fc-consent-root", button: "button.fc-cta-consent" }
];

const LATE_CMP_HOST_SELECTORS = [
  "#usercentrics-root",
  ".fc-consent-root",
  "#onetrust-consent-sdk",
  "#CybotCookiebotDialog",
  "#didomi-host",
  "#cmpbox",
  "#BorlabsCookieBox",
  '[id^="sp_message_container"]',
  '[class^="sp_message_container"]',
  '[class^="sp_veil"]'
];

/**
 * Texte für „Akzeptieren“-Buttons in vielen Sprachen (exakter Match oder contains).
 * Klein geschrieben zum Vergleich; im DOM wird normalisiert verglichen.
 */
export const ACCEPT_BUTTON_TEXTS: string[] = [
  /* DE */
  'alle akzeptieren',
  'akzeptieren',
  'akzeptieren und schließen',
  'alle cookies akzeptieren',
  'zustimmen',
  'alle zulassen',
  'zulassen',
  'einverstanden',
  'ok',
  'verstanden',
  'fortfahren',
  'weiter',
  /* EN */
  'accept all',
  'accept',
  'accept all cookies',
  'accept and close',
  'allow all',
  'allow',
  'allow all cookies',
  'agree',
  'agree and close',
  'consent',
  'continue',
  'continue without agreeing',
  'i agree',
  'i accept',
  'ok',
  'got it',
  'understood',
  'proceed',
  'save and close',
  'save preferences',
  /* FR */
  'tout accepter',
  'accepter',
  'accepter tout',
  'accepter les cookies',
  'autoriser',
  'autoriser tout',
  'continuer',
  'd\'accord',
  'ok',
  'j\'accepte',
  /* ES */
  'aceptar todo',
  'aceptar',
  'aceptar todas',
  'aceptar cookies',
  'permitir',
  'permitir todo',
  'continuar',
  'de acuerdo',
  'ok',
  /* IT */
  'accetta tutto',
  'accetta',
  'accetta tutti',
  'accetta i cookie',
  'consenti',
  'continua',
  'ok',
  /* NL */
  'alles accepteren',
  'accepteren',
  'accepteer',
  'accepteer alle',
  'toestaan',
  'doorgaan',
  'ok',
  /* PL */
  'akceptuj wszystko',
  'akceptuj',
  'akceptuję',
  'zezwól',
  'kontynuuj',
  'ok',
  /* PT */
  'aceitar tudo',
  'aceitar',
  'aceitar todos',
  'permitir',
  'continuar',
  'ok',
  /* SV */
  'acceptera alla',
  'acceptera',
  'godkänn',
  'tillåt',
  'fortsätt',
  'ok',
  /* DA */
  'accepter alle',
  'accepter',
  'tillad',
  'fortsæt',
  'ok',
  /* NO */
  'godta alle',
  'godta',
  'aksepter',
  'fortsett',
  'ok',
  /* FI */
  'hyväksy kaikki',
  'hyväksy',
  'jatka',
  'ok',
  /* CS */
  'přijmout vše',
  'přijmout',
  'souhlasím',
  'pokračovat',
  'ok',
  /* SK */
  'prijať všetko',
  'prijať',
  'pokračovať',
  'ok',
  /* HU */
  'összes elfogadása',
  'elfogadom',
  'elfogad',
  'folytatás',
  'ok',
  /* RO */
  'accept toate',
  'accept',
  'continua',
  'ok',
  /* BG */
  'приемане на всички',
  'приемам',
  'приемане',
  'продължи',
  'ок',
  /* EL */
  'αποδοχή όλων',
  'αποδοχή',
  'συμφωνώ',
  'συνέχεια',
  'εντάξει',
  /* RU */
  'принять все',
  'принять',
  'принимаю',
  'продолжить',
  'ок',
  /* TR */
  'tümünü kabul et',
  'kabul et',
  'devam',
  'tamam',
  /* JA */
  'すべて同意',
  '同意する',
  '受け入れる',
  '続ける',
  'ok',
  /* ZH */
  '接受全部',
  '接受',
  '同意',
  '继续',
  '确定',
  /* AR (RTL) */
  'قبول الكل',
  'قبول',
  'موافق',
  'متابعة',
  /* HE */
  'קבל הכל',
  'קבל',
  'המשך',
  'אישור',
];

const HIDE_STYLE_ID = "dig-cookie-banner-hide";

function cookieIframeUrlPattern(): RegExp {
  try {
    return new RegExp(cookieConsentConfig().iframeUrlPattern, "i");
  } catch {
    return /privacy-mgmt|sourcepoint|sp-prod|consentmanager|usercentrics|onetrust|cookielaw/i;
  }
}

/**
 * Inject hide CSS before the first paint (Playwright `addInitScript` or Puppeteer `evaluateOnNewDocument`).
 * MutationObserver covers late CMP hosts that paint after navigation.
 */
export async function registerCookieBannerHideOnNewDocument(target: {
  addInitScript?: (fn: (payload: { css: string; styleId: string; hosts: string[] }) => void, payload: { css: string; styleId: string; hosts: string[] }) => Promise<unknown>;
  evaluateOnNewDocument?: (fn: (payload: { css: string; styleId: string; hosts: string[] }) => void, payload: { css: string; styleId: string; hosts: string[] }) => Promise<unknown>;
}): Promise<void> {
  const payload = {
    css: COOKIE_BANNER_HIDE_CSS.replace(/\s+/g, " ").trim(),
    styleId: HIDE_STYLE_ID,
    hosts: [...LATE_CMP_HOST_SELECTORS]
  };
  const inject = (init: { css: string; styleId: string; hosts: string[] }) => {
    const w = window as Window & { __digCookieBannerHideWired?: boolean };
    if (w.__digCookieBannerHideWired) return;
    w.__digCookieBannerHideWired = true;

    function injectHide() {
      try {
        if (!document.getElementById(init.styleId)) {
          const style = document.createElement("style");
          style.id = init.styleId;
          style.textContent = init.css;
          (document.head || document.documentElement).appendChild(style);
        }
        for (const selector of init.hosts) {
          const nodes = document.querySelectorAll(selector);
          for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i] as HTMLElement;
            el.style.setProperty("display", "none", "important");
            el.style.setProperty("pointer-events", "none", "important");
          }
        }
      } catch {
        /* ignore */
      }
    }

    injectHide();
    try {
      const observer = new MutationObserver(injectHide);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch {
      /* ignore */
    }
  };

  if (typeof target.addInitScript === "function") {
    await target.addInitScript(inject, payload);
    return;
  }
  if (typeof target.evaluateOnNewDocument === "function") {
    await target.evaluateOnNewDocument(inject, payload);
  }
}

/**
 * Erzeugt ein Skript, das im Browser-Kontext läuft:
 * 1) Injiziert CSS zum Ausblenden aller bekannten Cookie-Banner.
 * 2) Klickt Accept in offenen Shadow Roots (Usercentrics / Funding Choices).
 * 3) Versucht, bekannte Akzeptieren-Buttons per Selektor zu klicken.
 * 4) Sucht Buttons/Links nach Text (mehrsprachig) und klickt sie.
 *
 * `offsetParent === null` is true for `position:fixed` banners — do not use it as a visibility check.
 */
export function getCookieBannerDismissScript(): string {
  const css = COOKIE_BANNER_HIDE_CSS.replace(/\s+/g, " ").trim();
  const selectorsJson = JSON.stringify(ACCEPT_BUTTON_SELECTORS);
  const textsJson = JSON.stringify(ACCEPT_BUTTON_TEXTS);
  const shadowTargetsJson = JSON.stringify(SHADOW_DOM_ACCEPT_TARGETS);

  return `
(function() {
  try {
    if (!document.getElementById('${HIDE_STYLE_ID}')) {
      var style = document.createElement('style');
      style.id = '${HIDE_STYLE_ID}';
      style.textContent = ${JSON.stringify(css)};
      (document.head || document.documentElement).appendChild(style);
    }
  } catch (e) {}

  var shadowTargets = ${shadowTargetsJson};
  function clickIfVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    try {
      var computed = window.getComputedStyle(el);
      if (computed.display === 'none' || computed.visibility === 'hidden' || Number(computed.opacity) === 0) return false;
    } catch (err) {}
    try {
      el.click();
      return true;
    } catch (err) { return false; }
  }
  function clickInOpenShadow(hostSelector, innerSelector) {
    try {
      var host = document.querySelector(hostSelector);
      if (!host || !host.shadowRoot) return false;
      var nodes = host.shadowRoot.querySelectorAll(innerSelector);
      for (var s = 0; s < nodes.length; s++) {
        if (clickIfVisible(nodes[s])) return true;
      }
    } catch (err) {}
    return false;
  }
  for (var st = 0; st < shadowTargets.length; st++) {
    if (clickInOpenShadow(shadowTargets[st].host, shadowTargets[st].button)) break;
  }

  var selectors = ${selectorsJson};
  var acceptTexts = ${textsJson};
  function norm(t) {
    return (t || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  }
  for (var i = 0; i < selectors.length; i++) {
    try {
      var found = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < found.length; j++) {
        if (clickIfVisible(found[j])) break;
      }
    } catch (err) {}
  }
  var candidates = [];
  try {
    var buttons = document.querySelectorAll('button, a, [role="button"], input[type="submit"]');
    for (var k = 0; k < buttons.length; k++) {
      var b = buttons[k];
      var label = norm(b.innerText || b.textContent || b.getAttribute('aria-label') || b.value || '');
      if (!label || label.length > 80) continue;
      for (var t = 0; t < acceptTexts.length; t++) {
        if (label === acceptTexts[t] || (label.indexOf(acceptTexts[t]) !== -1 && acceptTexts[t].length >= 4)) {
          candidates.push(b);
          break;
        }
      }
    }
  } catch (err) {}
  for (var c = 0; c < candidates.length; c++) {
    if (clickIfVisible(candidates[c])) break;
  }
})();
`;
}

type CookieDismissFrame = {
  url: () => string;
  evaluate: (pageFunction: string | (() => unknown)) => Promise<unknown>;
};

export type CookieDismissPage = {
  addStyleTag: (opts: { content: string }) => Promise<unknown>;
  evaluate: (pageFunction: string | (() => unknown)) => Promise<unknown>;
  waitForTimeout?: (ms: number) => Promise<void>;
  frames?: () => CookieDismissFrame[];
};

export type CookieDismissOptions = {
  retries?: number;
  retryDelayMs?: number;
  postDismissWaitMs?: number;
};

async function sleepOnPage(page: CookieDismissPage, ms: number): Promise<void> {
  if (ms <= 0) return;
  if (typeof page.waitForTimeout === "function") {
    await page.waitForTimeout(ms);
    return;
  }
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Playwright/Puppeteer: hide known CMP chrome and click Accept when present.
 * Safe to call multiple times (late-loading banners after scroll).
 * Retries cover async CMP loaders (Sourcepoint iframe, Usercentrics shadow).
 */
export async function dismissCookieBanner(
  page: CookieDismissPage,
  options: CookieDismissOptions = {}
): Promise<{ attempted: true; error?: string }> {
  const cfg = cookieConsentConfig();
  const retries = options.retries ?? cfg.retries;
  const retryDelayMs = options.retryDelayMs ?? cfg.retryDelayMs;
  const postDismissWaitMs = options.postDismissWaitMs ?? cfg.postDismissWaitMs;
  const iframePattern = cookieIframeUrlPattern();
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.addStyleTag({ content: COOKIE_BANNER_HIDE_CSS });
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    try {
      await page.evaluate(getCookieBannerDismissScript());
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    const frames = typeof page.frames === "function" ? page.frames() : [];
    for (const frame of frames) {
      let frameUrl = "";
      try {
        frameUrl = frame.url();
      } catch {
        continue;
      }
      if (!iframePattern.test(frameUrl)) continue;
      try {
        await frame.evaluate(getCookieBannerDismissScript());
      } catch {
        /* cross-origin or detached */
      }
    }

    try {
      await page.evaluate(() => {
        const hosts = document.querySelectorAll(
          "uc-layer, uc-layer2, #usercentrics-root, [id^=\"sp_message_container\"], [class^=\"sp_message_container\"], [class^=\"sp_veil\"], iframe[src*=\"privacy-mgmt\"]"
        );
        for (const el of hosts) el.remove();
      });
    } catch {
      /* ignore */
    }

    if (attempt < retries) {
      await sleepOnPage(page, retryDelayMs);
    }
  }

  await sleepOnPage(page, postDismissWaitMs);
  return lastError ? { attempted: true, error: lastError } : { attempted: true };
}
