/**
 * Cookie-banner dismiss for DIG Playwright capture.
 * Ported from CHECKION `lib/cookie-banner-dismiss.ts` (CSS hide + multilingual accept click).
 * Call after navigation / scroll-settle and before screenshots.
 */

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

/**
 * Erzeugt ein Skript, das im Browser-Kontext läuft (z. B. pa11y beforeScript):
 * 1) Injiziert CSS zum Ausblenden aller bekannten Cookie-Banner.
 * 2) Versucht, bekannte Akzeptieren-Buttons per Selektor zu klicken.
 * 3) Sucht Buttons/Links nach Text (mehrsprachig) und klickt sie.
 */
export function getCookieBannerDismissScript(): string {
  const css = COOKIE_BANNER_HIDE_CSS.replace(/\s+/g, ' ').trim();
  const selectorsJson = JSON.stringify(ACCEPT_BUTTON_SELECTORS);
  const textsJson = JSON.stringify(ACCEPT_BUTTON_TEXTS);

  return `
(function() {
  try {
    var style = document.createElement('style');
    style.id = 'dig-cookie-banner-hide';
    style.textContent = ${JSON.stringify(css)};
    if (!document.getElementById('dig-cookie-banner-hide')) {
      (document.head || document.documentElement).appendChild(style);
    }
  } catch (e) {}

  var selectors = ${selectorsJson};
  var acceptTexts = ${textsJson};
  function norm(t) {
    return (t || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  }
  function clickIfVisible(el) {
    if (!el || el.offsetParent === null) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    try {
      el.click();
      return true;
    } catch (err) { return false; }
  }
  for (var i = 0; i < selectors.length; i++) {
    try {
      var nodes = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < nodes.length; j++) {
        if (clickIfVisible(nodes[j])) break;
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

type CookieDismissPage = {
  addStyleTag: (opts: { content: string }) => Promise<unknown>;
  evaluate: (pageFunction: string | (() => unknown)) => Promise<unknown>;
  waitForTimeout?: (ms: number) => Promise<void>;
};

/**
 * Playwright/Puppeteer: hide known CMP chrome and click Accept when present.
 * Safe to call multiple times (late-loading banners after scroll).
 */
export async function dismissCookieBanner(page: CookieDismissPage): Promise<{ attempted: true; error?: string }> {
  try {
    await page.addStyleTag({ content: COOKIE_BANNER_HIDE_CSS });
  } catch (error: unknown) {
    return { attempted: true, error: error instanceof Error ? error.message : String(error) };
  }

  try {
    await page.evaluate(getCookieBannerDismissScript());
  } catch (error: unknown) {
    return { attempted: true, error: error instanceof Error ? error.message : String(error) };
  }

  if (typeof page.waitForTimeout === "function") {
    await page.waitForTimeout(400);
  } else {
    await new Promise((r) => setTimeout(r, 400));
  }
  return { attempted: true };
}
