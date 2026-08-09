import type { ExtensionAuth, ExtensionPrefs, EmailTranslateMode } from "@/types";

const AUTH_KEY = "auth";
const PREFS_KEY = "prefs";
const DRAFT_BASE_URL_KEY = "draftBaseUrl";

const DEFAULT_PREFS: ExtensionPrefs = {
  sourceLang: "auto",
  targetLang: "zh-CN",
  modelKey: null,
  expertId: "general",
  emailEnabled: true,
  emailTranslateMode: "replace",
};

type LegacyPrefs = ExtensionPrefs & {
  gmailEnabled?: boolean;
  gmailTranslateMode?: EmailTranslateMode;
};

export function resolveEmailTranslateMode(
  mode: EmailTranslateMode | undefined,
): EmailTranslateMode {
  return mode === "bilingual" ? "bilingual" : "replace";
}

export async function getAuth(): Promise<ExtensionAuth | null> {
  const result = await browser.storage.local.get(AUTH_KEY);
  const auth = result[AUTH_KEY] as ExtensionAuth | undefined;
  if (!auth?.baseUrl || !auth?.token) return null;
  return auth;
}

export async function setAuth(auth: ExtensionAuth): Promise<void> {
  await browser.storage.local.set({ [AUTH_KEY]: auth });
}

export async function clearAuth(): Promise<void> {
  await browser.storage.local.remove(AUTH_KEY);
}

export async function getPrefs(): Promise<ExtensionPrefs> {
  const result = await browser.storage.local.get(PREFS_KEY);
  const raw = (result[PREFS_KEY] as LegacyPrefs | undefined) ?? ({} as LegacyPrefs);
  const merged: ExtensionPrefs = {
    ...DEFAULT_PREFS,
    sourceLang: raw.sourceLang ?? DEFAULT_PREFS.sourceLang,
    targetLang: raw.targetLang ?? DEFAULT_PREFS.targetLang,
    modelKey: raw.modelKey ?? DEFAULT_PREFS.modelKey,
    expertId: raw.expertId ?? DEFAULT_PREFS.expertId,
    emailEnabled:
      raw.emailEnabled !== undefined
        ? raw.emailEnabled
        : raw.gmailEnabled !== undefined
          ? raw.gmailEnabled
          : DEFAULT_PREFS.emailEnabled,
    emailTranslateMode: resolveEmailTranslateMode(
      raw.emailTranslateMode ?? raw.gmailTranslateMode,
    ),
  };
  return merged;
}

export async function setPrefs(prefs: Partial<ExtensionPrefs>): Promise<void> {
  const current = await getPrefs();
  const next: ExtensionPrefs = { ...current };
  if (prefs.sourceLang !== undefined) next.sourceLang = prefs.sourceLang;
  if (prefs.targetLang !== undefined) next.targetLang = prefs.targetLang;
  if (prefs.modelKey !== undefined) next.modelKey = prefs.modelKey;
  if (prefs.expertId !== undefined) next.expertId = prefs.expertId;
  if (prefs.emailEnabled !== undefined) next.emailEnabled = prefs.emailEnabled;
  if (prefs.emailTranslateMode !== undefined) {
    next.emailTranslateMode = resolveEmailTranslateMode(prefs.emailTranslateMode);
  }
  await browser.storage.local.set({ [PREFS_KEY]: next });
}

export async function getDraftBaseUrl(): Promise<string> {
  const result = await browser.storage.local.get(DRAFT_BASE_URL_KEY);
  return (result[DRAFT_BASE_URL_KEY] as string | undefined) ?? "";
}

export async function setDraftBaseUrl(baseUrl: string): Promise<void> {
  if (baseUrl) {
    await browser.storage.local.set({ [DRAFT_BASE_URL_KEY]: baseUrl });
  } else {
    await browser.storage.local.remove(DRAFT_BASE_URL_KEY);
  }
}
