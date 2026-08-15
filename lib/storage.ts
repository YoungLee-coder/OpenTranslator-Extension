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

function parseAuth(raw: unknown): ExtensionAuth | null {
  const auth = raw as ExtensionAuth | undefined;
  if (!auth?.baseUrl || !auth?.token || !auth.user?.id) return null;
  return auth;
}

function parsePrefs(raw: unknown): ExtensionPrefs {
  const value = (raw as ExtensionPrefs | undefined) ?? ({} as ExtensionPrefs);
  return {
    ...DEFAULT_PREFS,
    sourceLang: value.sourceLang ?? DEFAULT_PREFS.sourceLang,
    targetLang: value.targetLang ?? DEFAULT_PREFS.targetLang,
    modelKey: value.modelKey ?? DEFAULT_PREFS.modelKey,
    expertId: value.expertId ?? DEFAULT_PREFS.expertId,
  };
}

/** Per-context L1 cache. Invalidated via storage.onChanged. */
let authCache: ExtensionAuth | null | undefined;
let prefsCache: ExtensionPrefs | undefined;
let authInflight: Promise<ExtensionAuth | null> | null = null;
let prefsInflight: Promise<ExtensionPrefs> | null = null;
let pairInflight: Promise<{ auth: ExtensionAuth | null; prefs: ExtensionPrefs }> | null = null;
let cacheListenerInstalled = false;

function ensureCacheListener(): void {
  if (cacheListenerInstalled) return;
  cacheListenerInstalled = true;
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[AUTH_KEY]) {
      authCache = parseAuth(changes[AUTH_KEY].newValue);
    }
    if (changes[PREFS_KEY]) {
      prefsCache = parsePrefs(changes[PREFS_KEY].newValue);
    }
  });
}

export async function getAuth(): Promise<ExtensionAuth | null> {
  ensureCacheListener();
  if (authCache !== undefined) return authCache;
  if (authInflight) return authInflight;
  authInflight = browser.storage.local
    .get(AUTH_KEY)
    .then((result) => {
      if (authCache !== undefined) return authCache;
      authCache = parseAuth(result[AUTH_KEY]);
      return authCache;
    })
    .finally(() => {
      authInflight = null;
    });
  return authInflight;
}

export async function setAuth(auth: ExtensionAuth): Promise<void> {
  authCache = auth;
  await browser.storage.local.set({ [AUTH_KEY]: auth });
}

export async function clearAuth(): Promise<void> {
  authCache = null;
  await browser.storage.local.remove(AUTH_KEY);
}

export async function getPrefs(): Promise<ExtensionPrefs> {
  ensureCacheListener();
  if (prefsCache !== undefined) return prefsCache;
  if (prefsInflight) return prefsInflight;
  prefsInflight = browser.storage.local
    .get(PREFS_KEY)
    .then((result) => {
      if (prefsCache !== undefined) return prefsCache;
      prefsCache = parsePrefs(result[PREFS_KEY]);
      return prefsCache;
    })
    .finally(() => {
      prefsInflight = null;
    });
  return prefsInflight;
}

/** One storage round-trip for the translate / first-paint hot path. */
export async function getAuthAndPrefs(): Promise<{
  auth: ExtensionAuth | null;
  prefs: ExtensionPrefs;
}> {
  ensureCacheListener();
  if (authCache !== undefined && prefsCache !== undefined) {
    return { auth: authCache, prefs: prefsCache };
  }
  if (pairInflight) return pairInflight;
  pairInflight = browser.storage.local
    .get([AUTH_KEY, PREFS_KEY])
    .then((result) => {
      if (authCache === undefined) authCache = parseAuth(result[AUTH_KEY]);
      if (prefsCache === undefined) prefsCache = parsePrefs(result[PREFS_KEY]);
      return { auth: authCache, prefs: prefsCache as ExtensionPrefs };
    })
    .finally(() => {
      pairInflight = null;
    });
  return pairInflight;
}

/** Fire when bound credentials are written or cleared (any extension context). */
export function subscribeAuthChange(onChange: () => void): () => void {
  ensureCacheListener();
  const listener = (
    changes: { [key: string]: Browser.storage.StorageChange },
    area: string,
  ) => {
    if (area !== "local" || !changes[AUTH_KEY]) return;
    onChange();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export async function setPrefs(prefs: Partial<ExtensionPrefs>): Promise<void> {
  const current = await getPrefs();
  const next: ExtensionPrefs = { ...current };
  if (prefs.sourceLang !== undefined) next.sourceLang = prefs.sourceLang;
  if (prefs.targetLang !== undefined) next.targetLang = prefs.targetLang;
  if (prefs.modelKey !== undefined) next.modelKey = prefs.modelKey;
  if (prefs.expertId !== undefined) next.expertId = prefs.expertId;
  prefsCache = next;
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
