import { translateEmailHtml } from "@/lib/gmail/client";
import {
  applyReplacedHtml,
  hasReplacedTranslation,
  prepareEmailHtml,
  restoreOriginalHtml,
} from "@/lib/gmail/html";
import type { TranslateEmailDisplay } from "@/types";

export type ReplaceView = "original" | "translated";

export type ReplaceCache = {
  originalHtml: string;
  translatedHtml: string;
  view: ReplaceView;
  display: TranslateEmailDisplay;
};

/** Keyed by stable message key — survives Gmail replacing the body element. */
const caches = new Map<string, ReplaceCache>();

export function getReplaceCache(messageKey: string): ReplaceCache | undefined {
  return caches.get(messageKey);
}

export function clearReplaceCache(messageKey: string, body?: HTMLElement): void {
  caches.delete(messageKey);
  if (body && hasReplacedTranslation(body)) {
    body.removeAttribute("data-ot-gmail-replaced");
  }
}

export function showOriginalFromCache(messageKey: string, body: HTMLElement): boolean {
  const cache = caches.get(messageKey);
  if (!cache) return false;
  restoreOriginalHtml(body, cache.originalHtml);
  cache.view = "original";
  return true;
}

export function showTranslatedFromCache(messageKey: string, body: HTMLElement): boolean {
  const cache = caches.get(messageKey);
  if (!cache?.translatedHtml) return false;
  applyReplacedHtml(body, cache.translatedHtml);
  cache.view = "translated";
  return true;
}

export type ReplaceTranslateResult =
  | { ok: true; cache: ReplaceCache }
  | { ok: false; error: string; unauthenticated?: boolean; cancelled?: boolean };

/**
 * Snapshot body → trim quoted/hidden HTML → POST /api/translate/email → replace.
 * `display: "bilingual"` asks the server for interleaved source + translation HTML.
 * `resolveBody` is called after the network round-trip so we apply to the live node.
 */
export async function runWholeEmailReplace(
  messageKey: string,
  resolveBody: () => HTMLElement | null,
  sourceLang: string,
  targetLang: string,
  signal: AbortSignal,
  display: TranslateEmailDisplay = "replace",
): Promise<ReplaceTranslateResult> {
  const bodyAtStart = resolveBody();
  if (!bodyAtStart) {
    return { ok: false, error: "未找到可翻译的正文" };
  }

  // If a previous replace/bilingual view is still on the body, prefer the cached original.
  let originalHtml = bodyAtStart.innerHTML;
  if (hasReplacedTranslation(bodyAtStart)) {
    const existing = caches.get(messageKey);
    if (existing?.originalHtml) {
      restoreOriginalHtml(bodyAtStart, existing.originalHtml);
      originalHtml = existing.originalHtml;
    }
  }

  const prepared = prepareEmailHtml(bodyAtStart);

  if (!prepared.html || prepared.plainLength === 0) {
    return { ok: false, error: "未找到可翻译的正文" };
  }

  const result = await translateEmailHtml(
    prepared.html,
    sourceLang,
    targetLang,
    signal,
    display,
  );
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      unauthenticated: result.unauthenticated,
      cancelled: result.error === "已取消",
    };
  }

  const translatedHtml = result.text.trim();
  if (!translatedHtml) {
    return { ok: false, error: "译文为空" };
  }

  const liveBody = resolveBody();
  if (!liveBody) {
    return { ok: false, error: "邮件正文已更新，请重试" };
  }

  applyReplacedHtml(liveBody, translatedHtml);

  const cache: ReplaceCache = {
    originalHtml,
    translatedHtml,
    view: "translated",
    display,
  };
  caches.set(messageKey, cache);
  return { ok: true, cache };
}
