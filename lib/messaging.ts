/** Side Panel / Options ↔ background message and port protocol. */
import type { AiExpertsPublicResponse, AuthUser, TranslateModelsResponse } from "@/types";

export type BgRequest =
  | { type: "ping"; baseUrl: string }
  | { type: "login"; baseUrl: string; email: string; password: string }
  | { type: "me" }
  | { type: "logout" }
  | { type: "getState" }
  | { type: "clearAuth" }
  | { type: "getModels" }
  | { type: "getExperts" }
  | { type: "setPrefs"; sourceLang?: string; targetLang?: string; modelKey?: string | null; expertId?: string | null };

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

export type TranslatePortIn =
  | {
      type: "start";
      text: string;
      sourceLang: string;
      targetLang: string;
    }
  | { type: "abort" };

export type TranslatePortOut =
  | { type: "delta"; text: string }
  | { type: "done"; translatedText: string; detectedSourceLang?: string }
  | { type: "error"; error: string; status?: number; unauthenticated?: boolean }
  | { type: "aborted" };

export function sendBg<T = unknown>(request: BgRequest): Promise<BgResponse & { data?: T }> {
  return browser.runtime.sendMessage(request);
}
