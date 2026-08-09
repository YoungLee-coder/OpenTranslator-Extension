/** Gmail DOM helpers — prefer stable attributes, fall back to known classes. */

const MESSAGE_BODY_SELECTORS = [
  "div.a3s.aiL",
  "div.a3s",
  'div[data-message-id] div.a3s',
];

const MESSAGE_ROOT_SELECTORS = [
  "div.adn.ads",
  "div.gs",
  'div[data-message-id]',
  "div.ii.gt",
];

const TOOLBAR_SELECTORS = [
  "div.gH",
  "div.ade",
  "div.hz.gt",
  "td.gH.acX",
];

export const OT_BTN_ATTR = "data-ot-gmail-btn";
export const OT_HOST_ATTR = "data-ot-gmail-host";

/** Open message bodies currently in the reading pane (not compose). */
export function findOpenMessageBodies(): HTMLElement[] {
  const bodies: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  for (const sel of MESSAGE_BODY_SELECTORS) {
    for (const node of document.querySelectorAll(sel)) {
      if (!(node instanceof HTMLElement)) continue;
      if (!node.offsetParent && node.getClientRects().length === 0) continue;
      // Skip compose / draft editors.
      if (node.isContentEditable || node.closest('[contenteditable="true"]')) continue;
      if (node.closest(".Am") || node.closest('[role="textbox"]')) continue;
      if (seen.has(node)) continue;
      seen.add(node);
      bodies.push(node);
    }
  }

  return bodies;
}

/** Best effort message root wrapping a body (for toolbar + scoping). */
export function findMessageRoot(body: HTMLElement): HTMLElement {
  for (const sel of MESSAGE_ROOT_SELECTORS) {
    const root = body.closest(sel);
    if (root instanceof HTMLElement) return root;
  }
  return body.parentElement instanceof HTMLElement ? body.parentElement : body;
}

/** Prefer header/toolbar near the message; else null (caller falls back to body top). */
export function findToolbarHost(messageRoot: HTMLElement, _body: HTMLElement): HTMLElement | null {
  for (const sel of TOOLBAR_SELECTORS) {
    const el = messageRoot.querySelector(sel);
    if (el instanceof HTMLElement && !el.querySelector(`[${OT_BTN_ATTR}]`)) {
      return el;
    }
  }
  if (messageRoot.querySelector(`[${OT_BTN_ATTR}]`)) return null;
  return null;
}
