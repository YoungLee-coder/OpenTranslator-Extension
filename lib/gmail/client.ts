import { formatApiError } from "@/lib/errors";
import { sendBg } from "@/lib/messaging";
import type { ExtensionState, TranslatePortOut } from "@/lib/messaging";
import { MAX_TRANSLATE_CHARS } from "@/types";

export type TranslateOneResult =
  | { ok: true; text: string }
  | { ok: false; error: string; unauthenticated?: boolean };

export async function loadExtensionState(): Promise<ExtensionState | null> {
  const res = await sendBg<ExtensionState>({ type: "getState" });
  if (!res.ok || !res.data) return null;
  return res.data;
}

/**
 * Translate one paragraph via the background SSE port.
 * Resolves on done / error / abort / disconnect.
 */
export function translateOne(
  text: string,
  sourceLang: string,
  targetLang: string,
  signal: AbortSignal,
): Promise<TranslateOneResult> {
  const trimmed = text.trim();
  if (!trimmed) return Promise.resolve({ ok: true, text: "" });
  if (trimmed.length > MAX_TRANSLATE_CHARS) {
    return Promise.resolve({
      ok: false,
      error: `原文过长，请缩短后再试（上限 ${MAX_TRANSLATE_CHARS.toLocaleString("zh-CN")} 字符）`,
    });
  }

  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve({ ok: false, error: "已取消" });
      return;
    }

    const port = browser.runtime.connect({ name: "translate" });
    let accumulated = "";
    let settled = false;

    const settle = (result: TranslateOneResult) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      try {
        port.disconnect();
      } catch {
        // ignore
      }
      resolve(result);
    };

    const onAbort = () => {
      try {
        port.postMessage({ type: "abort" });
      } catch {
        // ignore
      }
      settle({ ok: false, error: "已取消" });
    };

    signal.addEventListener("abort", onAbort);

    port.onMessage.addListener((msg: TranslatePortOut) => {
      if (msg.type === "delta") {
        accumulated += msg.text;
      } else if (msg.type === "done") {
        settle({ ok: true, text: (msg.translatedText || accumulated).trim() });
      } else if (msg.type === "error") {
        settle({
          ok: false,
          error: formatApiError(
            msg.error,
            msg.status,
            msg.status === 429 ? "api" : undefined,
            msg.retryAfterSeconds,
          ),
          unauthenticated: msg.unauthenticated,
        });
      } else if (msg.type === "aborted") {
        settle({ ok: false, error: "已取消" });
      }
    });

    port.onDisconnect.addListener(() => {
      if (!settled) {
        settle({ ok: false, error: "连接已断开" });
      }
    });

    port.postMessage({
      type: "start",
      text: trimmed,
      sourceLang,
      targetLang,
    });
  });
}
