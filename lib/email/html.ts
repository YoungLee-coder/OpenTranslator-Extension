/** Light sanitize / apply helpers for whole-email HTML translation. */

import { OT_REPLACED_ATTR } from "@/lib/email/dom";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK", "IFRAME", "OBJECT", "EMBED"]);

/** Quoted thread history — safe to drop before API (user can still view full mail via「原文」). */
const QUOTE_SELECTORS = [
  "blockquote.gmail_quote",
  "div.gmail_quote",
  "div.gmail_extra",
  'blockquote[type="cite"]',
  "div#divRplyFwdMsg",
  "div#appendonsend",
  "div#divRplyFwdMsg ~ *",
  "hr + div.OutlookMessageHeader",
  "div.OutlookMessageHeader",
].join(",");

const EXTENSION_CHROME_SELECTORS = `[${OT_REPLACED_ATTR}], .ot-email-translation, [data-ot-gmail-replaced], .ot-gmail-translation`;

/**
 * Clone message HTML for the email API: drop dangerous tags, quoted threads, and
 * hidden tracking nodes. Keeps the latest reply body + layout + images.
 */
export function prepareEmailHtml(body: HTMLElement): { html: string; plainLength: number } {
  const clone = body.cloneNode(true) as HTMLElement;
  for (const el of clone.querySelectorAll([...SKIP_TAGS].join(","))) {
    el.remove();
  }
  for (const el of clone.querySelectorAll(EXTENSION_CHROME_SELECTORS)) {
    el.remove();
  }
  removeHtmlComments(clone);
  removeHiddenAndTrackingNodes(clone);
  removeQuotedThreadContent(clone);
  const html = clone.innerHTML.trim();
  const plainLength = (clone.textContent ?? "").replace(/\s+/g, " ").trim().length;
  return { html, plainLength };
}

/** Remove Gmail / Outlook / Apple Mail quote blocks nested in thread replies. */
function removeQuotedThreadContent(root: HTMLElement): void {
  root.querySelectorAll(QUOTE_SELECTORS).forEach((el) => el.remove());
}

function removeHtmlComments(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    comments.push(node as Comment);
  }
  for (const comment of comments) {
    comment.remove();
  }
}

function removeHiddenAndTrackingNodes(root: HTMLElement): void {
  const toRemove: Element[] = [];
  for (const el of root.querySelectorAll("*")) {
    if (isHiddenOrTrackingNode(el)) {
      toRemove.push(el);
    }
  }
  for (const el of toRemove) {
    el.remove();
  }
}

function isHiddenOrTrackingNode(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute("hidden")) return true;

  const style = (el.getAttribute("style") ?? "").toLowerCase();
  if (/\bdisplay\s*:\s*none\b/.test(style)) return true;
  if (/\bvisibility\s*:\s*hidden\b/.test(style)) return true;
  if (/\bopacity\s*:\s*0\b/.test(style)) return true;

  if (el instanceof HTMLImageElement) {
    const width = parseImgDimension(el.width, el.getAttribute("width"));
    const height = parseImgDimension(el.height, el.getAttribute("height"));
    if (width === 1 && height === 1) return true;
    if ((width === 0 || height === 0) && width >= 0 && height >= 0) return true;
    if (/\b(width|height)\s*:\s*(0|1px)\b/.test(style)) return true;
  }

  return false;
}

function parseImgDimension(property: number, attribute: string | null): number {
  if (property > 0) return property;
  if (!attribute) return -1;
  const parsed = Number.parseInt(attribute, 10);
  return Number.isFinite(parsed) ? parsed : -1;
}

export function applyReplacedHtml(body: HTMLElement, translatedHtml: string): void {
  body.innerHTML = translatedHtml;
  body.setAttribute(OT_REPLACED_ATTR, "1");
  body.removeAttribute("data-ot-gmail-replaced");
}

export function restoreOriginalHtml(body: HTMLElement, originalHtml: string): void {
  body.innerHTML = originalHtml;
  body.removeAttribute(OT_REPLACED_ATTR);
  body.removeAttribute("data-ot-gmail-replaced");
}

export function hasReplacedTranslation(body: HTMLElement): boolean {
  return (
    body.getAttribute(OT_REPLACED_ATTR) === "1" ||
    body.getAttribute("data-ot-gmail-replaced") === "1"
  );
}
