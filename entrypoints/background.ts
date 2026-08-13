import { ApiError, fetchExperts, fetchModels, login, logout, me, ping, streamTranslate, streamTranslateEmail } from "@/lib/api";
import { createDeltaBatcher } from "@/lib/delta-batch";
import { resolveExpertId } from "@/lib/experts";
import { decodeModelKey, resolveEmailTranslateModel } from "@/lib/models";
import type { BgRequest, BgResponse, ExtensionState, TranslatePortIn, TranslatePortOut } from "@/lib/messaging";
import { revokeHostPermission } from "@/lib/permissions";
import { readExtensionState } from "@/lib/state";
import { clearAuth, getAuth, getAuthAndPrefs, setAuth, setPrefs } from "@/lib/storage";
import type { AiExpertsPublicResponse, ExtensionAuth, TranslateModelsResponse } from "@/types";
import { normalizeBaseUrl } from "@/lib/url";

const SESSION_ALARM = "session-check";
const SESSION_CHECK_MINUTES = 30;
const CATALOG_TTL_MS = 5 * 60 * 1000;
/** Skip /api/auth/me on translate when recently verified (aligned with models cache). */
const SESSION_TTL_MS = CATALOG_TTL_MS;
const PORT_KEEPALIVE_MS = 20_000;

type CatalogCache<T> = { userId: string; data: T; fetchedAt: number };

let modelsCache: CatalogCache<TranslateModelsResponse> | null = null;
let expertsCache: CatalogCache<AiExpertsPublicResponse> | null = null;
let modelsInflight: { userId: string; promise: Promise<TranslateModelsResponse> } | null = null;
let expertsInflight: { userId: string; promise: Promise<AiExpertsPublicResponse> } | null = null;
/** Last successful /api/auth/me (or login) for the bound user. */
let sessionVerified: { userId: string; at: number } | null = null;

/** In-flight one-shot email translates (sendMessage keeps SW alive until Promise settles). */
const emailAborts = new Map<string, AbortController>();

function clearCatalogCaches() {
  modelsCache = null;
  expertsCache = null;
}

function clearSessionCache() {
  sessionVerified = null;
}

function clearAuthCaches() {
  clearCatalogCaches();
  clearSessionCache();
}

function markSessionVerified(userId: string) {
  sessionVerified = { userId, at: Date.now() };
}

function isSessionFresh(userId: string): boolean {
  if (!sessionVerified || sessionVerified.userId !== userId) return false;
  return Date.now() - sessionVerified.at <= SESSION_TTL_MS;
}

function cacheFresh<T>(cache: CatalogCache<T> | null, userId: string): T | null {
  if (!cache || cache.userId !== userId) return null;
  if (Date.now() - cache.fetchedAt > CATALOG_TTL_MS) return null;
  return cache.data;
}

async function loadModelsCatalog(auth: ExtensionAuth): Promise<TranslateModelsResponse> {
  const cached = cacheFresh(modelsCache, auth.user.id);
  if (cached) return cached;
  if (modelsInflight?.userId === auth.user.id) return modelsInflight.promise;
  const promise = fetchModels(auth.baseUrl, auth.token)
    .then((data) => {
      modelsCache = { userId: auth.user.id, data, fetchedAt: Date.now() };
      return data;
    })
    .finally(() => {
      if (modelsInflight?.promise === promise) modelsInflight = null;
    });
  modelsInflight = { userId: auth.user.id, promise };
  return promise;
}

/** Warm models catalog without blocking the caller. */
function prefetchModelsCatalog(auth: ExtensionAuth): void {
  void loadModelsCatalog(auth).catch(() => {
    // Best-effort warm; translate path will retry.
  });
}

/**
 * Use a short-lived session cache so translate clicks skip /api/auth/me.
 * Still re-validates when TTL expires; 401 from translate clears auth as before.
 */
async function ensureSession(
  auth: ExtensionAuth,
): Promise<{ ok: true } | { ok: false; status: number }> {
  if (isSessionFresh(auth.user.id)) return { ok: true };

  const session = await me(auth.baseUrl, auth.token);
  if (!session.authenticated) {
    await clearAuth();
    clearAuthCaches();
    return { ok: false, status: 401 };
  }
  if (session.user) {
    await setAuth({ ...auth, user: session.user });
  }
  markSessionVerified(auth.user.id);
  return { ok: true };
}

async function verifyBound(): Promise<ExtensionState> {
  const auth = await getAuth();
  if (!auth) return readExtensionState();
  try {
    const session = await me(auth.baseUrl, auth.token);
    if (!session.authenticated) {
      await clearAuth();
      clearAuthCaches();
      return readExtensionState();
    }
    if (session.user) {
      await setAuth({ ...auth, user: session.user });
    }
    markSessionVerified(auth.user.id);
    return readExtensionState();
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      await clearAuth();
      clearAuthCaches();
    }
    return readExtensionState();
  }
}

function fail(error: string, status?: number, kind?: string): BgResponse {
  return { ok: false, error, status, kind };
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
          email: request.email,
          password: request.password,
        });
        const auth: ExtensionAuth = {
          baseUrl,
          token: data.token,
          user: data.user,
        };
        await setAuth(auth);
        clearCatalogCaches();
        markSessionVerified(data.user.id);
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
        clearAuthCaches();
        if (auth?.baseUrl) await revokeHostPermission(auth.baseUrl);
        return { ok: true };
      }
      case "clearAuth": {
        const auth = await getAuth();
        await clearAuth();
        clearAuthCaches();
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
        const data = await loadModelsCatalog(auth);
        return { ok: true, data };
      }
      case "getExperts": {
        const auth = await getAuth();
        if (!auth) {
          return fail("请先登录你的 OpenTranslator 实例", 401);
        }
        const cached = cacheFresh(expertsCache, auth.user.id);
        if (cached) return { ok: true, data: cached };
        if (expertsInflight?.userId === auth.user.id) {
          return { ok: true, data: await expertsInflight.promise };
        }
        const promise = fetchExperts(auth.baseUrl, auth.token)
          .then((data) => {
            expertsCache = { userId: auth.user.id, data, fetchedAt: Date.now() };
            return data;
          })
          .finally(() => {
            if (expertsInflight?.promise === promise) expertsInflight = null;
          });
        expertsInflight = { userId: auth.user.id, promise };
        return { ok: true, data: await promise };
      }
      case "setPrefs": {
        await setPrefs({
          sourceLang: request.sourceLang,
          targetLang: request.targetLang,
          modelKey: request.modelKey,
          expertId: request.expertId,
          emailEnabled: request.emailEnabled,
          emailTranslateMode: request.emailTranslateMode,
        });
        const state = await readExtensionState();
        return { ok: true, data: state };
      }
      case "abortTranslateEmail": {
        emailAborts.get(request.requestId)?.abort();
        emailAborts.delete(request.requestId);
        return { ok: true };
      }
      case "translateEmail": {
        const { auth, prefs } = await getAuthAndPrefs();
        if (!auth) {
          return fail("请先登录你的 OpenTranslator 实例", 401);
        }

        // Don't block on /api/auth/me — 401 from translateEmail still clears auth.
        void ensureSession(auth);

        let preferred: { providerId: string; model: string } | undefined;
        if (prefs.modelKey) {
          try {
            preferred = decodeModelKey(prefs.modelKey);
          } catch {
            // ignore invalid stored key
          }
        }

        // DeepL cannot do email HTML — pick an LLM even if the user default is DeepL.
        const catalog = await loadModelsCatalog(auth);
        const resolved = resolveEmailTranslateModel(
          catalog.models,
          catalog.default,
          preferred,
        );
        if (!resolved) {
          return fail("Email 翻译不支持 DeepL，请先配置可用的 LLM 模型");
        }

        const abort = new AbortController();
        emailAborts.set(request.requestId, abort);

        try {
          let translated = "";
          let detectedSourceLang: string | undefined;
          for await (const event of streamTranslateEmail(
            auth.baseUrl,
            auth.token,
            {
              html: request.html,
              sourceLang: request.sourceLang,
              targetLang: request.targetLang,
              providerId: resolved.providerId,
              model: resolved.model,
              preserveQuotes: request.preserveQuotes !== false,
              display: request.display === "bilingual" ? "bilingual" : "replace",
            },
            abort.signal,
          )) {
            if (abort.signal.aborted) {
              return fail("已取消");
            }
            if (event.type === "delta") {
              translated += event.text;
            } else if (event.type === "done") {
              translated = event.translatedText || translated;
              detectedSourceLang = event.detectedSourceLang;
            } else if (event.type === "error") {
              return fail(event.error);
            }
          }

          const text = translated.trim();
          if (!text) {
            return fail("译文为空");
          }
          return {
            ok: true,
            data: { translatedText: text, detectedSourceLang },
          };
        } catch (err) {
          if (abort.signal.aborted) {
            return fail("已取消");
          }
          if (err instanceof ApiError) {
            if (err.status === 401 || err.status === 403) {
              await clearAuth();
              clearAuthCaches();
              return fail("登录已过期，请重新登录", err.status);
            }
            return fail(err.message, err.status, err.kind);
          }
          return fail(err instanceof Error ? err.message : String(err));
        } finally {
          emailAborts.delete(request.requestId);
        }
      }
      default:
        return fail("未知请求");
    }
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.message, err.status, err.kind);
    }
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export default defineBackground(() => {
  if (browser.sidePanel) {
    void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }

  void getAuthAndPrefs().then(({ auth }) => {
    if (auth) prefetchModelsCatalog(auth);
  });
  void verifyBound();
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

  browser.runtime.onMessage.addListener((request: BgRequest, sender) => {
    if (sender.id !== browser.runtime.id) return;
    return handleMessage(request);
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.sender?.id !== browser.runtime.id) {
      port.disconnect();
      return;
    }
    if (port.name !== "translate") return;

    let abortController: AbortController | null = null;
    let disconnected = false;
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

    const stopKeepAlive = () => {
      if (keepAliveTimer != null) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
    };

    const startKeepAlive = () => {
      stopKeepAlive();
      keepAliveTimer = setInterval(() => {
        post({ type: "keepalive" });
      }, PORT_KEEPALIVE_MS);
    };

    const post = (msg: TranslatePortOut) => {
      if (disconnected) return;
      try {
        port.postMessage(msg);
      } catch {
        // Port already closed by the other end (common after abort / done).
        disconnected = true;
        stopKeepAlive();
      }
    };

    port.onMessage.addListener(async (msg: TranslatePortIn) => {
      if (msg.type === "abort") {
        abortController?.abort();
        return;
      }
      // Email translate uses sendMessage (translateEmail); Port is for streaming text.
      if (msg.type !== "start") return;

      abortController?.abort();
      abortController = new AbortController();
      const thisAbort = abortController;
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

      try {
        // Token expiry is handled by 401 on the translate request itself.
        // A blocking /api/auth/me here adds a full RTT after every SW restart.
        void ensureSession(auth);

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
            deltas.drain();
            post({ type: "aborted", requestId });
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
        if (!sawTerminal && !signal.aborted && !disconnected) {
          deltas.drain();
          if (translated.trim()) {
            post({ type: "done", requestId, translatedText: translated });
          } else {
            post({ type: "error", requestId, error: "翻译未完成，请重试" });
          }
        }
      } catch (err) {
        deltas.drain();
        if (signal.aborted || disconnected) {
          post({ type: "aborted", requestId });
          return;
        }
        if (err instanceof ApiError) {
          if (err.status === 401 || err.status === 403) {
            await clearAuth();
            clearAuthCaches();
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
    });

    port.onDisconnect.addListener(() => {
      disconnected = true;
      stopKeepAlive();
      abortController?.abort();
    });
  });
});
