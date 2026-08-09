/** Sanitize / extract Gmail message HTML for whole-email replace translation. */

/** Tags kept with structure (layout + typography). */
const ALLOWED_TAGS = new Set([
  "DIV",
  "P",
  "BR",
  "A",
  "UL",
  "OL",
  "LI",
  "B",
  "I",
  "STRONG",
  "EM",
  "U",
  "S",
  "STRIKE",
  "SPAN",
  "FONT",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TD",
  "TH",
  "HR",
  "CENTER",
  "PRE",
  "CODE",
  "BLOCKQUOTE",
  "IMG",
]);

const VOID_TAGS = new Set(["BR", "HR", "IMG"]);

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK", "IFRAME", "OBJECT", "EMBED", "SVG"]);

/** Formatting-related CSS properties to keep on style=. */
const STYLE_KEEP =
  /^(font|text-|color|background|line-height|letter-spacing|word-|white-space|vertical-align|display|margin|padding|border|width|height|max-width|min-width|opacity|align)/i;

const ATTR_KEEP_GLOBAL = new Set(["dir", "align", "title", "lang"]);

const ATTR_KEEP_BY_TAG: Record<string, Set<string>> = {
  A: new Set(["href", "target", "rel"]),
  IMG: new Set(["src", "alt", "width", "height", "border"]),
  FONT: new Set(["color", "face", "size"]),
  TD: new Set(["colspan", "rowspan", "width", "height", "valign", "bgcolor"]),
  TH: new Set(["colspan", "rowspan", "width", "height", "valign", "bgcolor"]),
  TABLE: new Set(["width", "border", "cellpadding", "cellspacing", "bgcolor"]),
  TR: new Set(["bgcolor", "valign", "align"]),
};

const QUOTE_SELECTOR = [
  ".gmail_quote",
  "blockquote.gmail_quote",
  'div[class*="gmail_quote"]',
  ".gmail_extra",
  '[data-smartmail="gmail_signature"]',
  ".gmail_signature",
].join(",");

const IMG_PLACEHOLDER_ATTR = "data-ot-img";

export type ExtractedMailHtml = {
  /** Clean HTML sent to the model (quotes/signatures removed; images as placeholders). */
  payloadHtml: string;
  /** Plain length for empty / limit checks. */
  plainLength: number;
  /** Original quote/signature blocks to append after translation. */
  preservedTailHtml: string;
  /** Original <img> outerHTML keyed by placeholder id. */
  imageMap: string[];
};

function isQuoteOrSignature(el: Element): boolean {
  if (el.matches(QUOTE_SELECTOR)) return true;
  if (el.tagName === "BLOCKQUOTE" && el.classList.contains("gmail_quote")) return true;
  return false;
}

function collectPreservedTail(body: HTMLElement): string {
  const parts: string[] = [];
  const seen = new Set<Element>();
  for (const el of body.querySelectorAll(QUOTE_SELECTOR)) {
    if (!(el instanceof HTMLElement)) continue;
    let parent = el.parentElement;
    let nested = false;
    while (parent && parent !== body) {
      if (parent.matches(QUOTE_SELECTOR) || parent.classList.contains("gmail_quote")) {
        nested = true;
        break;
      }
      parent = parent.parentElement;
    }
    if (nested || seen.has(el)) continue;
    seen.add(el);
    parts.push(el.outerHTML);
  }
  return parts.join("");
}

function sanitizeStyle(value: string): string | null {
  const kept: string[] = [];
  for (const part of value.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const prop = trimmed.slice(0, colon).trim();
    const val = trimmed.slice(colon + 1).trim();
    if (!val || /expression|javascript:|url\s*\(\s*['"]?\s*data:/i.test(val)) continue;
    if (STYLE_KEEP.test(prop)) kept.push(`${prop}: ${val}`);
  }
  return kept.length ? kept.join("; ") : null;
}

function copySafeAttributes(src: Element, dest: Element): void {
  const tagKeep = ATTR_KEEP_BY_TAG[src.tagName];
  for (const attr of src.attributes) {
    const name = attr.name.toLowerCase();
    if (name === "style") {
      const style = sanitizeStyle(attr.value);
      if (style) dest.setAttribute("style", style);
      continue;
    }
    if (ATTR_KEEP_GLOBAL.has(name) || tagKeep?.has(name)) {
      if (name === "href" || name === "src") {
        const v = attr.value.trim();
        if (/^\s*javascript:/i.test(v)) continue;
      }
      dest.setAttribute(attr.name, attr.value);
    }
  }
}

function sanitizeInto(parent: ParentNode, node: Node, imageMap: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    parent.appendChild(document.createTextNode(node.textContent ?? ""));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as Element;
  if (SKIP_TAGS.has(el.tagName)) return;
  if (isQuoteOrSignature(el)) return;

  // Freeze images as placeholders so the model cannot drop them.
  if (el.tagName === "IMG") {
    const id = imageMap.length;
    imageMap.push(el.outerHTML);
    const ph = document.createElement("span");
    ph.setAttribute(IMG_PLACEHOLDER_ATTR, String(id));
    ph.textContent = `[图片${id}]`;
    parent.appendChild(ph);
    return;
  }

  if (ALLOWED_TAGS.has(el.tagName)) {
    const clone = document.createElement(el.tagName.toLowerCase());
    copySafeAttributes(el, clone);
    if (!VOID_TAGS.has(el.tagName)) {
      for (const child of el.childNodes) sanitizeInto(clone, child, imageMap);
    }
    parent.appendChild(clone);
    return;
  }

  // Unwrap unknown tags but keep descendants (and formatting inside).
  for (const child of el.childNodes) sanitizeInto(parent, child, imageMap);
}

/** Restore image placeholders in model output to original <img> markup. */
export function restoreImagePlaceholders(html: string, imageMap: string[]): string {
  if (!imageMap.length) return html;
  const doc = document.implementation.createHTMLDocument("");
  const root = doc.createElement("div");
  root.innerHTML = html;
  for (const ph of root.querySelectorAll(`[${IMG_PLACEHOLDER_ATTR}]`)) {
    const id = Number(ph.getAttribute(IMG_PLACEHOLDER_ATTR));
    if (!Number.isFinite(id) || id < 0 || id >= imageMap.length) {
      ph.remove();
      continue;
    }
    const wrap = doc.createElement("div");
    wrap.innerHTML = imageMap[id];
    const img = wrap.firstElementChild;
    if (img) ph.replaceWith(img);
    else ph.remove();
  }
  // Also catch textual leftovers like [图片0] if the model unwrapped the span.
  let out = root.innerHTML;
  for (let i = 0; i < imageMap.length; i++) {
    out = out.replace(new RegExp(`\\[图片${i}\\]`, "g"), imageMap[i]);
  }
  return out;
}

/** Build a limited-HTML payload and preserve quotes/signatures for reassembly. */
export function extractTranslatableHtml(body: HTMLElement): ExtractedMailHtml {
  const preservedTailHtml = collectPreservedTail(body);
  const imageMap: string[] = [];
  const container = document.createElement("div");
  for (const child of body.childNodes) sanitizeInto(container, child, imageMap);
  const payloadHtml = container.innerHTML.trim();
  const plainLength = (container.textContent ?? "")
    .replace(/\[图片\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim().length;
  return { payloadHtml, plainLength, preservedTailHtml, imageMap };
}

/** Wrap payload with instructions the translate API will treat as source text. */
export function buildReplaceTranslatePrompt(payloadHtml: string, targetLang: string): string {
  return [
    "【任务】将下列邮件 HTML 翻译成目标语言。",
    `目标语言：${targetLang}`,
    "【规则】",
    "1. 只输出翻译后的 HTML，不要解释、不要 markdown 代码围栏。",
    "2. 严格保留原文 HTML 结构与排版：所有标签嵌套顺序不变。",
    "3. 保留加粗/斜体/下划线/字体/颜色/表格/链接等格式标签与 style、href、color、face、size 等属性。",
    "4. 保留所有 <span data-ot-img=\"…\">[图片N]</span> 占位符，原样输出，不要翻译或删除。",
    "5. 不要翻译 URL、邮箱地址、数字与代码。",
    "6. 不要新增原文中没有的标签，不要合并或拆分段落。",
    "【原文】",
    payloadHtml,
  ].join("\n");
}

/** Strip common model wrappers around HTML output. */
export function unwrapTranslatedHtml(raw: string): string {
  let text = raw.trim();
  if (!text) return "";
  text = text.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstTag = text.search(/<[a-z]/i);
  if (firstTag > 0 && firstTag < 80 && !text.slice(0, firstTag).includes("<")) {
    text = text.slice(firstTag).trim();
  }
  return text;
}

export function applyReplacedHtml(
  body: HTMLElement,
  translatedHtml: string,
  preservedTailHtml: string,
): void {
  const tail = preservedTailHtml.trim();
  body.innerHTML = tail ? `${translatedHtml}${tail}` : translatedHtml;
  body.setAttribute("data-ot-gmail-replaced", "1");
}

export function restoreOriginalHtml(body: HTMLElement, originalHtml: string): void {
  body.innerHTML = originalHtml;
  body.removeAttribute("data-ot-gmail-replaced");
}

export function hasReplacedTranslation(body: HTMLElement): boolean {
  return body.getAttribute("data-ot-gmail-replaced") === "1";
}
