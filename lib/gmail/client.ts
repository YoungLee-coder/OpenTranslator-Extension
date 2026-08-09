import { formatApiError } from "@/lib/errors";
import { sendBg } from "@/lib/messaging";
import type { ExtensionState, TranslateEmailResult } from "@/lib/messaging";
import type { TranslateEmailDisplay } from "@/types";
import { MAX_EMAIL_HTML_CHARS } from "@/types";

export type TranslateOneResult =
  | { ok: true; text: string }
  | { ok: false; error: string; unauthenticated?: boolean };

export async function loadExtensionState(): Promise<ExtensionState | null> {
  const res = await sendBg<ExtensionState>({ type: "getState" });
  if (!res.ok || !res.data) return null;
  return res.data;
}

/** Whole-email HTML via one-shot background message (not Port — email SSE is silent until done). */
export async function translateEmailHtml(
  html: string,
  sourceLang: string,
  targetLang: string,
  signal: AbortSignal,
  display: TranslateEmailDisplay = "replace",
): Promise<TranslateOneResult> {
  const trimmed = html.trim();
  if (!trimmed) return Promise.resolve({ ok: true, text: "" });
  if (trimmed.length > MAX_EMAIL_HTML_CHARS) {
    return Promise.resolve({
      ok: false,
      error: `原文过长，请缩短后再试（上限 ${MAX_EMAIL_HTML_CHARS.toLocaleString("zh-CN")} 字符）`,
    });
  }
  if (signal.aborted) return { ok: false, error: "已取消" };

  const requestId =
    globalThis.crypto?.randomUUID?.() ??
    `email-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const onAbort = () => {
    void sendBg({ type: "abortTranslateEmail", requestId });
  };
  signal.addEventListener("abort", onAbort);

  try {
    const res = await sendBg<TranslateEmailResult>({
      type: "translateEmail",
      requestId,
      html: trimmed,
      sourceLang,
      targetLang,
      preserveQuotes: true,
      display,
    });

    if (signal.aborted) return { ok: false, error: "已取消" };

    if (!res.ok) {
      return {
        ok: false,
        error: formatApiError(res.error || "翻译失败", res.status, res.kind),
        unauthenticated: res.status === 401 || res.status === 403,
      };
    }

    return { ok: true, text: (res.data?.translatedText || "").trim() };
  } catch (err) {
    if (signal.aborted) return { ok: false, error: "已取消" };
    const message = err instanceof Error ? err.message : String(err);
    if (/Extension context invalidated|Receiving end does not exist/i.test(message)) {
      return { ok: false, error: "连接已断开" };
    }
    return { ok: false, error: message || "翻译失败" };
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
