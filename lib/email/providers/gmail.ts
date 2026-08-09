import {
  type EmailProvider,
  OT_BTN_ATTR,
  isComposeOrEditable,
  isVisible,
  pathAndHashRouteKey,
  stampMessageKey,
} from "@/lib/email/dom";

const MESSAGE_BODY_SELECTORS = ["div.a3s.aiL", "div.a3s", "div[data-message-id] div.a3s"];

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

    for (const sel of MESSAGE_BODY_SELECTORS) {
      for (const node of document.querySelectorAll(sel)) {
        if (!(node instanceof HTMLElement)) continue;
        if (!isVisible(node)) continue;
        if (isComposeOrEditable(node)) continue;
        if (node.closest(".Am")) continue;
        if (seen.has(node)) continue;
        seen.add(node);
        bodies.push(node);
      }
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
