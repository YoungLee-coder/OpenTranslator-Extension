import { isAbortError } from "@/lib/abort";
import { ApiError, fetchExperts, fetchModels, login, logout, me, ping, streamTranslate } from "@/lib/api";
import { createDeltaBatcher } from "@/lib/delta-batch";
import { resolveExpertId } from "@/lib/experts";
import { decodeModelKey } from "@/lib/models";
import type { BgRequest, BgResponse, ExtensionState, TranslatePortIn, TranslatePortOut } from "@/lib/messaging";
import { consumeRuntimeLastError, parseBgRequest, parseTranslatePortIn, safePortPost } from "@/lib/messaging";
import { revokeHostPermission } from "@/lib/permissions";
import { readExtensionState } from "@/lib/state";
import { clearAuth, getAuth, getAuthAndPrefs, setAuth, setLoginDraft, setPrefs } from "@/lib/storage";
import { userLoginName, type AiExpertsPublicResponse, type ExtensionAuth, type TranslateModelsResponse } from "@/types";
import { normalizeBaseUrl } from "@/lib/url";

const SESSION_ALARM = "session-check";
const SESSION_CHECK_MINUTES = 30;
const CATALOG_TTL_MS = 5 * 60 * 1000;
const PORT_KEEPALIVE_MS = 20_000;
const MODELS_CACHE_KEY = "catalog.models";
const EXPERTS_CACHE_KEY = "catalog.experts";

type StoredCatalog<T> = { userId: string; data: T; fetchedAt: number };
type CatalogInflight<T> = {
  userId: string;
  promise: Promise<T>;
  abort: AbortController;
};

/** In-flight coalescing only — must not outlive this SW instance. */
let modelsInflight: CatalogInflight<TranslateModelsResponse> | null = null;
let expertsInflight: CatalogInflight<AiExpertsPublicResponse> | null = null;

function abortCatalogInflight() {
  modelsInflight?.abort.abort();
  expertsInflight?.abort.abort();
  modelsInflight = null;
  expertsInflight = null;
}

function isStoredCatalog<T>(value: unknown): value is StoredCatalog<T> {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.userId === "string" && typeof rec.fetchedAt === "number" && rec.data != null;
}

async function readSessionCatalog<T>(key: string, userId: string): Promise<T | null> {
  try {
    const result = await browser.storage.session.get(key);
    const cache = result[key];
    if (!isStoredCatalog<T>(cache) || cache.userId !== userId) return null;
    if (Date.now() - cache.fetchedAt > CATALOG_TTL_MS) return null;
    return cache.data;
  } catch {
    return null;
  }
}

async function writeSessionCatalog<T>(key: string, userId: string, data: T): Promise<void> {
  try {
    const entry: StoredCatalog<T> = { userId, data, fetchedAt: Date.now() };
    await browser.storage.session.set({ [key]: entry });
  } catch {
    // session quota / unavailable — next request will refetch
  }
}

async function clearCatalogCaches() {
  abortCatalogInflight();
  try {
    await browser.storage.session.remove([MODELS_CACHE_KEY, EXPERTS_CACHE_KEY]);
  } catch {
    // ignore
  }
}

async function clearAuthCaches() {
  await clearCatalogCaches();
}

async function loadModelsCatalog(auth: ExtensionAuth): Promise<TranslateModelsResponse> {
  const cached = await readSessionCatalog<TranslateModelsResponse>(MODELS_CACHE_KEY, auth.user.id);
  if (cached) return cached;
  if (modelsInflight?.userId === auth.user.id) return modelsInflight.promise;
  if (modelsInflight) {
    modelsInflight.abort.abort();
    modelsInflight = null;
  }

  const abort = new AbortController();
  const entry: CatalogInflight<TranslateModelsResponse> = {
    userId: auth.user.id,
    abort,
    promise: Promise.resolve(null as unknown as TranslateModelsResponse),
  };
  entry.promise = (async () => {
    try {
      const data = await fetchModels(auth.baseUrl, auth.token, abort.signal);
      if (!abort.signal.aborted) {
        await writeSessionCatalog(MODELS_CACHE_KEY, auth.user.id, data);
      }
      return data;
    } finally {
      if (modelsInflight === entry) modelsInflight = null;
    }
  })();
  modelsInflight = entry;
  return entry.promise;
}

/** Warm models catalog without blocking the caller. */
function prefetchModelsCatalog(auth: ExtensionAuth): void {
  void loadModelsCatalog(auth).catch((err) => {
    if (isAbortError(err)) return;
  });
}

async function loadExpertsCatalog(auth: ExtensionAuth): Promise<AiExpertsPublicResponse> {
  const cached = await readSessionCatalog<AiExpertsPublicResponse>(EXPERTS_CACHE_KEY, auth.user.id);
  if (cached) return cached;
  if (expertsInflight?.userId === auth.user.id) return expertsInflight.promise;
  if (expertsInflight) {
    expertsInflight.abort.abort();
    expertsInflight = null;
  }

  const abort = new AbortController();
  const entry: CatalogInflight<AiExpertsPublicResponse> = {
    userId: auth.user.id,
    abort,
    promise: Promise.resolve(null as unknown as AiExpertsPublicResponse),
  };
  entry.promise = (async () => {
    try {
      const data = await fetchExperts(auth.baseUrl, auth.token, abort.signal);
      if (!abort.signal.aborted) {
        await writeSessionCatalog(EXPERTS_CACHE_KEY, auth.user.id, data);
      }
      return data;
    } finally {
      if (expertsInflight === entry) expertsInflight = null;
    }
  })();
  expertsInflight = entry;
  return entry.promise;
}

async function verifyBound(): Promise<ExtensionState> {
  const auth = await getAuth();
  if (!auth) return readExtensionState();
  try {
    const session = await me(auth.baseUrl, auth.token);
    if (!session.authenticated) {
      await clearAuth();
      await clearAuthCaches();
      return readExtensionState();
    }
    if (session.user) {
      await setAuth({ ...auth, user: session.user });
    }
    return readExtensionState();
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      await clearAuth();
      await clearAuthCaches();
    }
    return readExtensionState();
  }
}

function fail(error: string, status?: number, kind?: string): BgResponse {
  return { ok: false, error, status, kind };
}

async function handleUnauthorizedCatalog(err: ApiError): Promise<BgResponse> {
  if (err.status === 401 || err.status === 403) {
    await clearAuth();
    await clearAuthCaches();
    return fail("登录已过期，请重新登录", err.status, err.kind);
  }
  return fail(err.message, err.status, err.kind);
}

async function handleMessage(request: BgRequest): Promise<BgResponse> {
  try {
    switch (request.type) {
      case "ping": {
        const baseUrl = normalizeBaseUrl(request.baseUrl);
        const data = await ping(baseUrl);
        return { ok: true, data };
      }
      case "login": {
        const baseUrl = normalizeBaseUrl(request.baseUrl);
        const data = await login(baseUrl, {
          username: request.username,
          password: request.password,
        });
        const auth: ExtensionAuth = {
          baseUrl,
          token: data.token,
          user: data.user,
        };
        await setAuth(auth);
        await clearCatalogCaches();
        prefetchModelsCatalog(auth);
        return { ok: true, data };
      }
      case "me": {
        const state = await verifyBound();
        return { ok: true, data: state };
      }
      case "logout": {
        const auth = await getAuth();
        if (auth) {
          try {
            await logout(auth.baseUrl, auth.token);
          } catch {
            // still clear local credentials
          }
        }
        await clearAuth();
        await clearAuthCaches();
        if (auth?.baseUrl) await revokeHostPermission(auth.baseUrl);
        return { ok: true };
      }
      case "clearAuth": {
        const auth = await getAuth();
        await clearAuth();
        await clearAuthCaches();
        if (auth?.baseUrl) await revokeHostPermission(auth.baseUrl);
        return { ok: true };
      }
      case "getState": {
        // Local storage only — session checks run via "me", alarms, and translate.
        const state = await readExtensionState();
        return { ok: true, data: state };
      }
      case "warmup": {
        const auth = await getAuth();
        if (auth) prefetchModelsCatalog(auth);
        return { ok: true };
      }
      case "getModels": {
        const auth = await getAuth();
        if (!auth) {
          return fail("请先登录你的 OpenTranslator 实例", 401);
        }
        try {
          const data = await loadModelsCatalog(auth);
          return { ok: true, data };
        } catch (err) {
          if (err instanceof ApiError) return handleUnauthorizedCatalog(err);
          throw err;
        }
      }
      case "getExperts": {
        const auth = await getAuth();
        if (!auth) {
          return fail("请先登录你的 OpenTranslator 实例", 401);
        }
        try {
          const data = await loadExpertsCatalog(auth);
          return { ok: true, data };
        } catch (err) {
          if (err instanceof ApiError) return handleUnauthorizedCatalog(err);
          throw err;
        }
      }
      case "setPrefs": {
        await setPrefs({
          sourceLang: request.sourceLang,
          targetLang: request.targetLang,
          modelKey: request.modelKey,
          expertId: request.expertId,
        });
        const state = await readExtensionState();
        return { ok: true, data: state };
      }
      default:
        return fail("未知请求");
    }
  } catch (err) {
    if (isAbortError(err)) {
      return fail("已取消", 0, "network");
    }
    if (err instanceof ApiError) {
      return fail(err.message, err.status, err.kind);
    }
    return fail(err instanceof Error ? err.message : String(err));
  }
}

function isTrustedExtensionSender(sender?: { id?: string }): boolean {
  // onConnect / onMessage are same-extension only (externally_connectable is unset).
  // Some Chrome builds omit sender.id on side-panel ports.
  if (!sender?.id) return true;
  return sender.id === browser.runtime.id;
}

export default defineBackground(() => {
  self.addEventListener("unhandledrejection", (event) => {
    console.error("[opentranslator]", event.reason);
  });
  self.addEventListener("error", (event) => {
    console.error("[opentranslator]", event.error ?? event.message);
  });

  browser.runtime.onMessage.addListener((request: unknown, sender) => {
    if (!isTrustedExtensionSender(sender)) return;
    const parsed = parseBgRequest(request);
    if (!parsed) return Promise.resolve(fail("未知请求"));
    return handleMessage(parsed);
  });

  browser.runtime.onConnect.addListener((port) => {
    if (!isTrustedExtensionSender(port.sender)) {
      port.disconnect();
      return;
    }
    if (port.name !== "translate") {
      port.disconnect();
      return;
    }

    let abortController: AbortController | null = null;
    let disconnected = false;
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

    const stopKeepAlive = () => {
      if (keepAliveTimer != null) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
    };

    const post = (msg: TranslatePortOut) => {
      if (disconnected) return;
      if (!safePortPost(port, msg)) {
        disconnected = true;
        stopKeepAlive();
      }
    };

    const startKeepAlive = () => {
      stopKeepAlive();
      // Open ports keep the SW alive. This interval only pings the panel;
      // chrome.alarms cannot fire faster than 30s.
      keepAliveTimer = setInterval(() => {
        post({ type: "keepalive" });
      }, PORT_KEEPALIVE_MS);
    };

    const runTranslate = async (
      msg: Extract<TranslatePortIn, { type: "start" }>,
      thisAbort: AbortController,
    ) => {
      const signal = thisAbort.signal;
      const requestId = msg.requestId;
      startKeepAlive();

      const deltas = createDeltaBatcher((text) => {
        post({ type: "delta", requestId, text });
      });

      const { auth, prefs } = await getAuthAndPrefs();
      if (!auth) {
        stopKeepAlive();
        post({
          type: "error",
          requestId,
          error: "请先登录你的 OpenTranslator 实例",
          unauthenticated: true,
        });
        return;
      }

      const dropStream = () => {
        deltas.clear();
        if (signal.aborted || disconnected) {
          post({ type: "aborted", requestId });
        }
      };

      try {
        let providerId: string | undefined;
        let model: string | undefined;
        if (prefs.modelKey) {
          try {
            ({ providerId, model } = decodeModelKey(prefs.modelKey));
          } catch {
            // ignore invalid stored key; server falls back to default provider
          }
        }

        let translated = "";
        let sawTerminal = false;
        for await (const event of streamTranslate(
          auth.baseUrl,
          auth.token,
          {
            text: msg.text,
            sourceLang: msg.sourceLang,
            targetLang: msg.targetLang,
            providerId,
            model,
            expertId: resolveExpertId(prefs.expertId),
          },
          signal,
        )) {
          if (signal.aborted || disconnected) {
            dropStream();
            return;
          }
          if (event.type === "delta") {
            translated += event.text;
            deltas.push(event.text);
          } else if (event.type === "progress") {
            deltas.drain();
            post({
              type: "progress",
              requestId,
              chunkIndex: event.chunkIndex,
              chunkTotal: event.chunkTotal,
            });
          } else if (event.type === "done") {
            sawTerminal = true;
            deltas.drain();
            post({
              type: "done",
              requestId,
              translatedText: event.translatedText || translated,
              detectedSourceLang: event.detectedSourceLang,
            });
          } else if (event.type === "error") {
            sawTerminal = true;
            deltas.drain();
            post({ type: "error", requestId, error: event.error });
          }
        }
        if (signal.aborted || disconnected) {
          dropStream();
          return;
        }
        if (!sawTerminal) {
          deltas.drain();
          if (translated.trim()) {
            post({ type: "done", requestId, translatedText: translated });
          } else {
            post({ type: "error", requestId, error: "翻译未完成，请重试" });
          }
        }
      } catch (err) {
        if (signal.aborted || disconnected || isAbortError(err)) {
          dropStream();
          return;
        }
        deltas.drain();
        if (err instanceof ApiError) {
          if (err.status === 403 && /forbidden/i.test(err.message)) {
            post({
              type: "error",
              requestId,
              error: "当前账号无权翻译",
              status: err.status,
            });
            return;
          }
          if (err.status === 401 || err.status === 403) {
            await clearAuth();
            await clearAuthCaches();
            post({
              type: "error",
              requestId,
              error: "登录已过期，请重新登录",
              status: err.status,
              unauthenticated: true,
            });
            return;
          }
          post({
            type: "error",
            requestId,
            error: err.message,
            status: err.status,
            retryAfterSeconds: err.retryAfterSeconds,
          });
          return;
        }
        post({
          type: "error",
          requestId,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (abortController === thisAbort) stopKeepAlive();
      }
    };

    // Return immediately: an async listener promise would hit Chrome's 5-minute
    // event-handler cap and kill the SW mid-stream. Port keepalive resets idle.
    port.onMessage.addListener((raw: unknown) => {
      const msg = parseTranslatePortIn(raw);
      if (!msg) return;
      if (msg.type === "abort") {
        abortController?.abort();
        return;
      }
      if (msg.type !== "start") return;

      abortController?.abort();
      abortController = new AbortController();
      void runTranslate(msg, abortController);
    });

    port.onDisconnect.addListener(() => {
      consumeRuntimeLastError();
      disconnected = true;
      stopKeepAlive();
      abortController?.abort();
    });
  });

  if (browser.sidePanel) {
    void browser.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => {
        console.error("[opentranslator] sidePanel.setPanelBehavior", err);
      });
  }

  void (async () => {
    try {
      const { auth } = await getAuthAndPrefs();
      if (auth) {
        prefetchModelsCatalog(auth);
        await setLoginDraft({
          baseUrl: auth.baseUrl,
          username: userLoginName(auth.user),
        });
      }
    } catch {
      // ignore
    }
  })();
  void verifyBound().catch(() => {});
  void browser.alarms.create(SESSION_ALARM, {
    periodInMinutes: SESSION_CHECK_MINUTES,
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SESSION_ALARM) {
      void verifyBound();
    }
  });

  browser.runtime.onStartup.addListener(() => {
    void verifyBound();
  });
});
