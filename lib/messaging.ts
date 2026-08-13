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

export function sendBg<T = unknown>(request: BgRequest): Promise<BgResponse & { data?: T }> {
  return browser.runtime.sendMessage(request);
}
