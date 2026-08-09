import { translateOne } from "@/lib/gmail/client";
import {
  applyReplacedHtml,
  buildReplaceTranslatePrompt,
  extractTranslatableHtml,
  hasReplacedTranslation,
  restoreImagePlaceholders,
  restoreOriginalHtml,
  unwrapTranslatedHtml,
} from "@/lib/gmail/html";
import { MAX_TRANSLATE_CHARS } from "@/types";

export type ReplaceView = "original" | "translated";

export type ReplaceCache = {
  originalHtml: string;
  translatedHtml: string;
  preservedTailHtml: string;
  view: ReplaceView;
};

const caches = new WeakMap<HTMLElement, ReplaceCache>();

export function getReplaceCache(body: HTMLElement): ReplaceCache | undefined {
  return caches.get(body);
}

export function clearReplaceCache(body: HTMLElement): void {
  caches.delete(body);
  if (hasReplacedTranslation(body)) {
    // Leave DOM as-is; caller restores from cache before clear when needed.
    body.removeAttribute("data-ot-gmail-replaced");
  }
}

export function showOriginalFromCache(body: HTMLElement): boolean {
  const cache = caches.get(body);
  if (!cache) return false;
  restoreOriginalHtml(body, cache.originalHtml);
  cache.view = "original";
  return true;
}

export function showTranslatedFromCache(body: HTMLElement): boolean {
  const cache = caches.get(body);
  if (!cache?.translatedHtml) return false;
  applyReplacedHtml(body, cache.translatedHtml, cache.preservedTailHtml);
  cache.view = "translated";
  return true;
}

export type ReplaceTranslateResult =
  | { ok: true; cache: ReplaceCache }
  | { ok: false; error: string; unauthenticated?: boolean; cancelled?: boolean };

/**
 * Snapshot body → clean HTML → one AI call → replace (quotes/signatures kept).
 */
export async function runWholeEmailReplace(
  body: HTMLElement,
  sourceLang: string,
  targetLang: string,
  signal: AbortSignal,
): Promise<ReplaceTranslateResult> {
  const originalHtml = body.innerHTML;
  const extracted = extractTranslatableHtml(body);

  if (!extracted.payloadHtml || extracted.plainLength === 0) {
    return { ok: false, error: "未找到可翻译的正文" };
  }

  const prompt = buildReplaceTranslatePrompt(extracted.payloadHtml, targetLang);
  if (prompt.length > MAX_TRANSLATE_CHARS) {
    return {
      ok: false,
      error: `原文过长，请缩短后再试（上限 ${MAX_TRANSLATE_CHARS.toLocaleString("zh-CN")} 字符）`,
    };
  }

  const result = await translateOne(prompt, sourceLang, targetLang, signal);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      unauthenticated: result.unauthenticated,
      cancelled: result.error === "已取消",
    };
  }

  const rawHtml = unwrapTranslatedHtml(result.text);
  if (!rawHtml) {
    return { ok: false, error: "译文为空" };
  }

  const translatedHtml = restoreImagePlaceholders(rawHtml, extracted.imageMap);

  applyReplacedHtml(body, translatedHtml, extracted.preservedTailHtml);

  const cache: ReplaceCache = {
    originalHtml,
    translatedHtml,
    preservedTailHtml: extracted.preservedTailHtml,
    view: "translated",
  };
  caches.set(body, cache);
  return { ok: true, cache };
}
