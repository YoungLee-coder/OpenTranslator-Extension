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
  bindings: {
    db: boolean;
    kv: boolean;
  };
  /** bindings 齐全且 _migrations 已存在 */
  dbReady: boolean;
  /** dbReady 且仍有未执行迁移 */
  needsMigration: boolean;
  /** dbReady 且至少有一名管理员 */
  adminReady: boolean;
}

export interface TranslateModelOption {
  providerId: string;
  model: string;
  modelLabel: string;
  providerName: string;
  /** Adapter type (e.g. openai / deepl); used to hide unsupported capabilities. */
  providerType: string;
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
      type: "progress";
      chunkIndex: number;
      chunkTotal: number;
    }
  | {
      type: "done";
      translatedText: string;
      provider: string;
      usage?: { inputTokens: number; outputTokens: number };
      detectedSourceLang?: string;
    }
  | { type: "error"; error: string };

/** Max source characters accepted by POST /api/translate. */
export const MAX_TRANSLATE_CHARS = 80_000;

export interface ExtensionAuth {
  baseUrl: string;
  token: string;
  user: AuthUser;
}

/** Gmail in-message translation style. */
export type GmailTranslateMode = "replace" | "bilingual";

export interface ExtensionPrefs {
  sourceLang: string;
  targetLang: string;
  modelKey?: string | null;
  expertId?: string | null;
  /** Gmail 翻译按钮；默认开启 */
  gmailEnabled?: boolean;
  /** Gmail 翻译方式；默认整封替换 */
  gmailTranslateMode?: GmailTranslateMode;
}
