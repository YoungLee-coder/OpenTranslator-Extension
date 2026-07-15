/** Minimal shared types aligned with @opentranslator/shared-types */

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  avatarUrl?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: AuthUser;
  token: string;
}

export interface AuthMeResponse {
  authenticated: boolean;
  user?: AuthUser;
  setupCompleted: boolean;
  sitePublic: boolean;
}

export interface PingResponse {
  ok: boolean;
  service: string;
  env: string;
  bindings: {
    db: boolean;
    kv: boolean;
  };
}

export interface TranslateModelOption {
  providerId: string;
  model: string;
  modelLabel: string;
  providerName: string;
}

export interface TranslateModelsResponse {
  models: TranslateModelOption[];
  default: { providerId: string; model: string } | null;
}

export interface AiExpertMeta {
  id: string;
  version: string;
  name: string;
  description: string;
  avatar?: string;
  author?: string;
  homepage?: string;
  i18n?: Record<string, { name?: string; description?: string; details?: string }>;
}

export interface AiExpertsPublicResponse {
  experts: AiExpertMeta[];
  defaultExpertId: string | null;
}

export interface TranslateRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
  stream?: boolean;
  providerId?: string;
  model?: string;
  expertId?: string;
}

export type TranslateStreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "done";
      translatedText: string;
      provider: string;
      usage?: { inputTokens: number; outputTokens: number };
      detectedSourceLang?: string;
    }
  | { type: "error"; error: string };

export interface ExtensionAuth {
  baseUrl: string;
  token: string;
  user: AuthUser;
}

export interface ExtensionPrefs {
  sourceLang: string;
  targetLang: string;
  modelKey?: string | null;
  expertId?: string | null;
}
