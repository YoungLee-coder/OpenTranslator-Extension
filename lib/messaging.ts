/** Side Panel / Options ↔ background message and port protocol. */
import type {
  AiExpertsPublicResponse,
  AuthUser,
  TranslateModelsResponse,
} from "@/types";

export type BgRequest =
  | { type: "ping"; baseUrl: string }
  | { type: "login"; baseUrl: string; username: string; password: string }
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
    };

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
}

export type { AiExpertsPublicResponse, TranslateModelsResponse };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseBgRequest(value: unknown): BgRequest | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  switch (value.type) {
    case "ping":
      return typeof value.baseUrl === "string" ? { type: "ping", baseUrl: value.baseUrl } : null;
    case "login":
      return typeof value.baseUrl === "string" &&
        typeof value.username === "string" &&
        typeof value.password === "string"
        ? {
            type: "login",
            baseUrl: value.baseUrl,
            username: value.username,
            password: value.password,
          }
        : null;
    case "me":
    case "logout":
    case "getState":
    case "clearAuth":
    case "getModels":
    case "getExperts":
    case "warmup":
      return { type: value.type };
    case "setPrefs": {
      if (value.sourceLang !== undefined && typeof value.sourceLang !== "string") return null;
      if (value.targetLang !== undefined && typeof value.targetLang !== "string") return null;
      if (
        value.modelKey !== undefined &&
        value.modelKey !== null &&
        typeof value.modelKey !== "string"
      ) {
        return null;
      }
      if (
        value.expertId !== undefined &&
        value.expertId !== null &&
        typeof value.expertId !== "string"
      ) {
        return null;
      }
      return {
        type: "setPrefs",
        sourceLang: value.sourceLang,
        targetLang: value.targetLang,
        modelKey: value.modelKey,
        expertId: value.expertId,
      };
    }
    default:
      return null;
  }
}

export function parseTranslatePortIn(value: unknown): TranslatePortIn | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (value.type === "abort") return { type: "abort" };
  if (value.type !== "start") return null;
  if (typeof value.requestId !== "string" || !value.requestId) return null;
  if (typeof value.text !== "string") return null;
  if (typeof value.sourceLang !== "string" || typeof value.targetLang !== "string") return null;
  return {
    type: "start",
    requestId: value.requestId,
    text: value.text,
    sourceLang: value.sourceLang,
    targetLang: value.targetLang,
  };
}

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
      requestId: string;
      error: string;
      status?: number;
      unauthenticated?: boolean;
      retryAfterSeconds?: number;
    }
  | { type: "aborted"; requestId: string };

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

export function safePortPost(port: Browser.runtime.Port | null | undefined, msg: unknown): boolean {
  if (!port) return false;
  try {
    port.postMessage(msg);
    return true;
  } catch {
    return false;
  }
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
      const res = (await browser.runtime.sendMessage(request)) as BgResponse | undefined;
      if (!res) {
        lastErr = new Error("Receiving end does not exist");
        continue;
      }
      return res as BgResponse & { data?: T };
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
