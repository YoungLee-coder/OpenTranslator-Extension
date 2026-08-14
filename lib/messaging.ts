/** Side Panel / Options ↔ background message and port protocol. */
import type {
  AiExpertsPublicResponse,
  AuthUser,
  EmailTranslateMode,
  TranslateModelsResponse,
} from "@/types";

export type BgRequest =
  | { type: "ping"; baseUrl: string }
  | { type: "login"; baseUrl: string; email: string; password: string }
  | { type: "me" }
  | { type: "logout" }
  | { type: "getState" }
  | { type: "clearAuth" }
  | { type: "getModels" }
  | { type: "getExperts" }
  /** Prefetch models catalog (and no-op if logged out). */
  | { type: "warmup" }
  | {
      type: "setPrefs";
      sourceLang?: string;
      targetLang?: string;
      modelKey?: string | null;
      expertId?: string | null;
      emailEnabled?: boolean;
      emailTranslateMode?: EmailTranslateMode;
    }
  /** One-shot whole-email translate (keeps SW alive via returned Promise). */
  | {
      type: "translateEmail";
      requestId: string;
      html: string;
      sourceLang: string;
      targetLang: string;
      preserveQuotes?: boolean;
      display?: "replace" | "bilingual";
    }
  | { type: "abortTranslateEmail"; requestId: string };

export type BgResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string; status?: number; kind?: string };

export interface ExtensionState {
  bound: boolean;
  baseUrl?: string;
  user?: AuthUser;
  sourceLang: string;
  targetLang: string;
  modelKey: string | null;
  expertId: string;
  emailEnabled: boolean;
  emailTranslateMode: EmailTranslateMode;
}

export type { AiExpertsPublicResponse, TranslateModelsResponse };

export type TranslatePortIn =
  | {
      type: "start";
      requestId: string;
      text: string;
      sourceLang: string;
      targetLang: string;
    }
  | { type: "abort" };

export type TranslatePortOut =
  | { type: "delta"; requestId: string; text: string }
  | { type: "progress"; requestId: string; chunkIndex: number; chunkTotal: number }
  | { type: "keepalive" }
  | {
      type: "done";
      requestId: string;
      translatedText: string;
      detectedSourceLang?: string;
    }
  | {
      type: "error";
      requestId?: string;
      error: string;
      status?: number;
      unauthenticated?: boolean;
      retryAfterSeconds?: number;
    }
  | { type: "aborted"; requestId?: string };

export type TranslateEmailResult = {
  translatedText: string;
  detectedSourceLang?: string;
};

const BG_RETRY_DELAYS_MS = [0, 80, 200, 500] as const;

const DISCONNECT_ERROR_RE =
  /Receiving end does not exist|Could not establish connection|Extension context invalidated|message port closed before a response was received/i;

function disconnectMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isDisconnectError(err: unknown): boolean {
  return DISCONNECT_ERROR_RE.test(disconnectMessage(err));
}

/** Must be read in Port.onDisconnect or Chrome logs Unchecked runtime.lastError. */
export function consumeRuntimeLastError(): string {
  return browser.runtime.lastError?.message ?? "";
}

/**
 * Message the service worker, retrying the MV3 wakeup race.
 * Persistent disconnects resolve as `{ ok: false }` so callers do not need a catch.
 */
export async function sendBg<T = unknown>(
  request: BgRequest,
): Promise<BgResponse & { data?: T }> {
  let lastErr: unknown;
  for (let i = 0; i < BG_RETRY_DELAYS_MS.length; i++) {
    const delay = BG_RETRY_DELAYS_MS[i];
    if (delay) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      return await browser.runtime.sendMessage(request);
    } catch (err) {
      lastErr = err;
      if (!isDisconnectError(err)) throw err;
    }
  }
  const message = disconnectMessage(lastErr);
  if (/Extension context invalidated/i.test(message)) {
    return {
      ok: false,
      error: "扩展已更新，请关闭侧栏后再打开",
      kind: "disconnected",
    };
  }
  return {
    ok: false,
    error: "扩展后台未就绪，请稍后重试",
    kind: "disconnected",
  };
}
