import type { ExtensionAuth, ExtensionPrefs } from "@/types";

const AUTH_KEY = "auth";
const PREFS_KEY = "prefs";
const DRAFT_BASE_URL_KEY = "draftBaseUrl";

const DEFAULT_PREFS: ExtensionPrefs = {
  sourceLang: "auto",
  targetLang: "zh-CN",
  modelKey: null,
  expertId: "general",
};

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
  return { ...DEFAULT_PREFS, ...(result[PREFS_KEY] as ExtensionPrefs | undefined) };
}

export async function setPrefs(prefs: Partial<ExtensionPrefs>): Promise<void> {
  const current = await getPrefs();
  const next: ExtensionPrefs = { ...current };
  if (prefs.sourceLang !== undefined) next.sourceLang = prefs.sourceLang;
  if (prefs.targetLang !== undefined) next.targetLang = prefs.targetLang;
  if (prefs.modelKey !== undefined) next.modelKey = prefs.modelKey;
  if (prefs.expertId !== undefined) next.expertId = prefs.expertId;
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
