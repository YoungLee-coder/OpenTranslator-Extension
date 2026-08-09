/** Shared email content-script DOM attributes. */

export const OT_BTN_ATTR = "data-ot-email-btn";
export const OT_HOST_ATTR = "data-ot-email-host";
/** Stamped on the message root so sessions survive body node churn. */
export const OT_MSG_KEY_ATTR = "data-ot-msg-key";
/** Mark that the body currently shows translated HTML. */
export const OT_REPLACED_ATTR = "data-ot-email-replaced";

export type EmailProviderId = "gmail";

export type EmailMountTarget = {
  parent: HTMLElement;
  /** Insert before this node; null appends. */
  before: ChildNode | null;
};

export type EmailProvider = {
  id: EmailProviderId;
  findOpenMessageBodies(): HTMLElement[];
  findMessageRoot(body: HTMLElement): HTMLElement;
  findToolbarHost(messageRoot: HTMLElement, body: HTMLElement): HTMLElement | null;
  /** Precise mount point (preferred over findToolbarHost + toolbarInsert). */
  resolveMountTarget?(messageRoot: HTMLElement, body: HTMLElement): EmailMountTarget | null;
  /** Where to place the button inside the toolbar host. Default: end. */
  toolbarInsert?: "start" | "end";
  getOrCreateMessageKey(body: HTMLElement): string;
  routeKey(href?: string): string;
  ensureLayoutCss(): void;
};

let msgKeySeq = 0;

/** Stamp/reuse a stable key on the message root. */
export function stampMessageKey(root: HTMLElement, preferred?: string | null): string {
  const stamped = root.getAttribute(OT_MSG_KEY_ATTR);
  if (preferred) {
    const key = `mid:${preferred}`;
    if (stamped !== key) root.setAttribute(OT_MSG_KEY_ATTR, key);
    return key;
  }
  if (stamped) return stamped;
  const key = `gen:${Date.now().toString(36)}-${++msgKeySeq}`;
  root.setAttribute(OT_MSG_KEY_ATTR, key);
  return key;
}

/** URL identity that ignores volatile query params. */
export function pathAndHashRouteKey(href: string = location.href): string {
  try {
    const url = new URL(href);
    return `${url.pathname}${url.hash}`;
  } catch {
    return href;
  }
}

export function isVisible(node: HTMLElement): boolean {
  return Boolean(node.offsetParent) || node.getClientRects().length > 0;
}

export function isComposeOrEditable(node: HTMLElement): boolean {
  if (node.isContentEditable || node.closest('[contenteditable="true"]')) return true;
  if (node.closest('[role="textbox"]')) return true;
  if (node.closest('[data-testid*="compose" i]')) return true;
  if (node.closest('[data-testid*="reply" i]')) return true;
  return false;
}
