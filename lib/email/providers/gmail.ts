import {
  type EmailProvider,
  OT_BTN_ATTR,
  isComposeOrEditable,
  isVisible,
  pathAndHashRouteKey,
  stampMessageKey,
} from "@/lib/email/dom";

/** Open conversation bodies — scoped so we never scan the whole inbox list. */
const OPEN_BODY_SELECTOR = "div.adn.ads div.a3s, div.h7 div.a3s, div[data-message-id] div.a3s";
const MESSAGE_ROOT_SELECTORS = ["div.adn.ads", "div.gs", "div[data-message-id]", "div.ii.gt"];
const TOOLBAR_SELECTORS = ["div.gH", "div.ade", "div.hz.gt", "td.gH.acX"];
const LAYOUT_STYLE_ID = "ot-email-gmail-layout-fix";

function findMessageRoot(body: HTMLElement): HTMLElement {
  for (const sel of MESSAGE_ROOT_SELECTORS) {
    const root = body.closest(sel);
    if (root instanceof HTMLElement) return root;
  }
  return body.parentElement instanceof HTMLElement ? body.parentElement : body;
}

export const gmailProvider: EmailProvider = {
  id: "gmail",

  findOpenMessageBodies() {
    const bodies: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();

    for (const node of document.querySelectorAll(OPEN_BODY_SELECTOR)) {
      if (!(node instanceof HTMLElement)) continue;
      if (seen.has(node)) continue;
      if (node.closest(".Am, .gmail_quote, .gmail_extra")) continue;
      if (node.closest("div.ii.gt.adO")) continue;
      if (node.parentElement?.closest("div.a3s")) continue;
      if (isComposeOrEditable(node)) continue;
      if (!isVisible(node)) continue;
      seen.add(node);
      bodies.push(node);
    }

    return bodies;
  },

  findMessageRoot,

  findToolbarHost(messageRoot) {
    for (const sel of TOOLBAR_SELECTORS) {
      const el = messageRoot.querySelector(sel);
      if (el instanceof HTMLElement && !el.querySelector(`[${OT_BTN_ATTR}]`)) {
        return el;
      }
    }
    if (messageRoot.querySelector(`[${OT_BTN_ATTR}]`)) return null;
    return null;
  },

  getOrCreateMessageKey(body) {
    const root = findMessageRoot(body);
    const fromAttr =
      root.getAttribute("data-message-id") ||
      body.closest("[data-message-id]")?.getAttribute("data-message-id") ||
      body.getAttribute("data-message-id");
    return stampMessageKey(root, fromAttr);
  },

  routeKey: pathAndHashRouteKey,

  ensureLayoutCss() {
    if (document.getElementById(LAYOUT_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = LAYOUT_STYLE_ID;
    style.textContent =
      "[role='listitem'] > div { height:auto!important; white-space:unset!important; }";
    document.documentElement.appendChild(style);
  },
};
