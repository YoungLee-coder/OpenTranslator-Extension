import { userLoginName, type AuthUser, type ExtensionAuth, type ExtensionPrefs } from "@/types";

const AUTH_KEY = "auth";
const PREFS_KEY = "prefs";
const LOGIN_DRAFT_KEY = "loginDraft";
/** @deprecated migrated into loginDraft */
const DRAFT_BASE_URL_KEY = "draftBaseUrl";
const TRANSLATE_DRAFT_KEY = "translateDraft";

export type LoginDraft = {
  baseUrl: string;
  username: string;
};

export type TranslateDraft = {
  sourceText: string;
  translatedText: string;
  detectedSourceLang: string | null;
};

const EMPTY_LOGIN_DRAFT: LoginDraft = { baseUrl: "", username: "" };
const EMPTY_TRANSLATE_DRAFT: TranslateDraft = {
  sourceText: "",
  translatedText: "",
  detectedSourceLang: null,
};

const DEFAULT_PREFS: ExtensionPrefs = {
  sourceLang: "auto",
  targetLang: "zh-CN",
  modelKey: null,
  expertId: "general",
};

function parseAuthUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== "object") return null;
  const user = raw as Partial<AuthUser>;
  if (typeof user.id !== "string" || !user.id) return null;
  const username = userLoginName(user);
  if (!username) return null;
  return {
    id: user.id,
    username,
    email: typeof user.email === "string" ? user.email : username,
    role: typeof user.role === "string" ? user.role : "user",
    avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : undefined,
  };
}

function parseAuth(raw: unknown): ExtensionAuth | null {
  const auth = raw as ExtensionAuth | undefined;
  if (!auth?.baseUrl || !auth?.token) return null;
  const user = parseAuthUser(auth.user);
  if (!user) return null;
  return { ...auth, user };
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
  authInflight = (async () => {
    try {
      const result = await browser.storage.local.get(AUTH_KEY);
      if (authCache !== undefined) return authCache;
      authCache = parseAuth(result[AUTH_KEY]);
      return authCache;
    } finally {
      authInflight = null;
    }
  })();
  return authInflight;
}

function parseLoginDraft(raw: unknown, legacyUrl?: unknown): LoginDraft {
  const legacy = typeof legacyUrl === "string" ? legacyUrl : "";
  if (!raw || typeof raw !== "object") {
    return { baseUrl: legacy, username: "" };
  }
  const draft = raw as Partial<LoginDraft> & { email?: string };
  const username =
    typeof draft.username === "string" && draft.username
      ? draft.username
      : typeof draft.email === "string"
        ? draft.email
        : "";
  return {
    baseUrl: typeof draft.baseUrl === "string" ? draft.baseUrl : legacy,
    username,
  };
}

function parseTranslateDraft(raw: unknown): TranslateDraft {
  const draft = raw as Partial<TranslateDraft> | undefined;
  if (!draft || typeof draft !== "object") return EMPTY_TRANSLATE_DRAFT;
  return {
    sourceText: typeof draft.sourceText === "string" ? draft.sourceText : "",
    translatedText: typeof draft.translatedText === "string" ? draft.translatedText : "",
    detectedSourceLang:
      typeof draft.detectedSourceLang === "string" ? draft.detectedSourceLang : null,
  };
}

async function writeLoginDraft(draft: LoginDraft): Promise<void> {
  if (!draft.baseUrl && !draft.username) {
    await browser.storage.local.remove([LOGIN_DRAFT_KEY, DRAFT_BASE_URL_KEY]);
    return;
  }
  await browser.storage.local.set({ [LOGIN_DRAFT_KEY]: draft });
  try {
    await browser.storage.local.remove(DRAFT_BASE_URL_KEY);
  } catch {
    // leftover legacy key is ignored on read
  }
}

export async function setAuth(auth: ExtensionAuth): Promise<void> {
  const user = parseAuthUser(auth.user) ?? auth.user;
  const next: ExtensionAuth = { ...auth, user };
  authCache = next;
  const loginDraft: LoginDraft = {
    baseUrl: next.baseUrl,
    username: userLoginName(next.user),
  };
  await browser.storage.local.set({
    [AUTH_KEY]: next,
    [LOGIN_DRAFT_KEY]: loginDraft,
  });
  try {
    await browser.storage.local.remove(DRAFT_BASE_URL_KEY);
  } catch {
    // leftover legacy key is ignored on read
  }
}

export async function clearAuth(): Promise<void> {
  authCache = null;
  await browser.storage.local.remove(AUTH_KEY);
}

export async function getPrefs(): Promise<ExtensionPrefs> {
  ensureCacheListener();
  if (prefsCache !== undefined) return prefsCache;
  if (prefsInflight) return prefsInflight;
  prefsInflight = (async () => {
    try {
      const result = await browser.storage.local.get(PREFS_KEY);
      if (prefsCache !== undefined) return prefsCache;
      prefsCache = parsePrefs(result[PREFS_KEY]);
      return prefsCache;
    } finally {
      prefsInflight = null;
    }
  })();
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
  pairInflight = (async () => {
    try {
      const result = await browser.storage.local.get([AUTH_KEY, PREFS_KEY]);
      if (authCache === undefined) authCache = parseAuth(result[AUTH_KEY]);
      if (prefsCache === undefined) prefsCache = parsePrefs(result[PREFS_KEY]);
      return { auth: authCache, prefs: prefsCache as ExtensionPrefs };
    } finally {
      pairInflight = null;
    }
  })();
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

export async function getLoginDraft(): Promise<LoginDraft> {
  const result = await browser.storage.local.get([LOGIN_DRAFT_KEY, DRAFT_BASE_URL_KEY]);
  return parseLoginDraft(result[LOGIN_DRAFT_KEY], result[DRAFT_BASE_URL_KEY]);
}

export async function setLoginDraft(draft: LoginDraft): Promise<void> {
  await writeLoginDraft({
    baseUrl: draft.baseUrl,
    username: draft.username,
  });
}

export async function clearLoginDraft(): Promise<void> {
  await writeLoginDraft(EMPTY_LOGIN_DRAFT);
}

export async function getTranslateDraft(): Promise<TranslateDraft> {
  const result = await browser.storage.local.get(TRANSLATE_DRAFT_KEY);
  return parseTranslateDraft(result[TRANSLATE_DRAFT_KEY]);
}

export async function setTranslateDraft(draft: TranslateDraft): Promise<void> {
  try {
    if (!draft.sourceText && !draft.translatedText && !draft.detectedSourceLang) {
      await browser.storage.local.remove(TRANSLATE_DRAFT_KEY);
      return;
    }
    await browser.storage.local.set({ [TRANSLATE_DRAFT_KEY]: draft });
  } catch {
    // quota / unavailable — next open restores whatever last succeeded
  }
}
