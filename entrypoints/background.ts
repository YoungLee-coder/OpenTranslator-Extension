import { ApiError, fetchExperts, fetchModels, login, logout, me, ping, streamTranslate, streamTranslateEmail } from "@/lib/api";
import { resolveExpertId } from "@/lib/experts";
import { decodeModelKey } from "@/lib/models";
import type { BgRequest, BgResponse, ExtensionState, TranslatePortIn, TranslatePortOut } from "@/lib/messaging";
import { revokeHostPermission } from "@/lib/permissions";
import { readExtensionState } from "@/lib/state";
import { clearAuth, getAuth, getPrefs, setAuth, setPrefs } from "@/lib/storage";
import type { AiExpertsPublicResponse, TranslateModelsResponse } from "@/types";
import { normalizeBaseUrl } from "@/lib/url";

const SESSION_ALARM = "session-check";
const SESSION_CHECK_MINUTES = 30;
const CATALOG_TTL_MS = 5 * 60 * 1000;
const PORT_KEEPALIVE_MS = 20_000;

type CatalogCache<T> = { userId: string; data: T; fetchedAt: number };

let modelsCache: CatalogCache<TranslateModelsResponse> | null = null;
let expertsCache: CatalogCache<AiExpertsPublicResponse> | null = null;

/** In-flight one-shot email translates (sendMessage keeps SW alive until Promise settles). */
const emailAborts = new Map<string, AbortController>();

function clearCatalogCaches() {
  modelsCache = null;
  expertsCache = null;
}

function cacheFresh<T>(cache: CatalogCache<T> | null, userId: string): T | null {
  if (!cache || cache.userId !== userId) return null;
  if (Date.now() - cache.fetchedAt > CATALOG_TTL_MS) return null;
  return cache.data;
}

async function verifyBound(): Promise<ExtensionState> {
  const auth = await getAuth();
  if (!auth) return readExtensionState();
  try {
    const session = await me(auth.baseUrl, auth.token);
    if (!session.authenticated) {
      await clearAuth();
      clearCatalogCaches();
      return readExtensionState();
    }
    if (session.user) {
      await setAuth({ ...auth, user: session.user });
    }
    return readExtensionState();
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      await clearAuth();
      clearCatalogCaches();
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
        await setAuth({
          baseUrl,
          token: data.token,
          user: data.user,
        });
        clearCatalogCaches();
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
        clearCatalogCaches();
        if (auth?.baseUrl) await revokeHostPermission(auth.baseUrl);
        return { ok: true };
      }
      case "clearAuth": {
        const auth = await getAuth();
        await clearAuth();
        clearCatalogCaches();
        if (auth?.baseUrl) await revokeHostPermission(auth.baseUrl);
        return { ok: true };
      }
      case "getState": {
        // Local storage only — session checks run via "me", alarms, and translate.
        const state = await readExtensionState();
        return { ok: true, data: state };
      }
      case "getModels": {
        const auth = await getAuth();
        if (!auth) {
          return fail("请先登录你的 OpenTranslator 实例", 401);
        }
        const cached = cacheFresh(modelsCache, auth.user.id);
        if (cached) return { ok: true, data: cached };
        const data = await fetchModels(auth.baseUrl, auth.token);
        modelsCache = { userId: auth.user.id, data, fetchedAt: Date.now() };
        return { ok: true, data };
      }
      case "getExperts": {
        const auth = await getAuth();
        if (!auth) {
          return fail("请先登录你的 OpenTranslator 实例", 401);
        }
        const cached = cacheFresh(expertsCache, auth.user.id);
        if (cached) return { ok: true, data: cached };
        const data = await fetchExperts(auth.baseUrl, auth.token);
        expertsCache = { userId: auth.user.id, data, fetchedAt: Date.now() };
        return { ok: true, data };
      }
      case "setPrefs": {
        await setPrefs({
          sourceLang: request.sourceLang,
          targetLang: request.targetLang,
          modelKey: request.modelKey,
          expertId: request.expertId,
          gmailEnabled: request.gmailEnabled,
          gmailTranslateMode: request.gmailTranslateMode,
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
        const auth = await getAuth();
        if (!auth) {
          return fail("请先登录你的 OpenTranslator 实例", 401);
        }

        const session = await me(auth.baseUrl, auth.token);
        if (!session.authenticated) {
          await clearAuth();
          clearCatalogCaches();
          return fail("登录已过期，请重新登录", 401);
        }

        const prefs = await getPrefs();
        let providerId: string | undefined;
        let model: string | undefined;
        if (prefs.modelKey) {
          try {
            ({ providerId, model } = decodeModelKey(prefs.modelKey));
          } catch {
            // ignore invalid stored key; server falls back to default provider
          }
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
              providerId,
              model,
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
              clearCatalogCaches();
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
      const signal = abortController.signal;
      startKeepAlive();

      const auth = await getAuth();
      if (!auth) {
        stopKeepAlive();
        post({
          type: "error",
          error: "请先登录你的 OpenTranslator 实例",
          unauthenticated: true,
        });
        return;
      }

      try {
        const session = await me(auth.baseUrl, auth.token);
        if (!session.authenticated) {
          await clearAuth();
          clearCatalogCaches();
          stopKeepAlive();
          post({
            type: "error",
            error: "登录已过期，请重新登录",
            status: 401,
            unauthenticated: true,
          });
          return;
        }

        const prefs = await getPrefs();
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
            post({ type: "aborted" });
            return;
          }
          if (event.type === "delta") {
            translated += event.text;
            post({ type: "delta", text: event.text });
          } else if (event.type === "progress") {
            post({
              type: "progress",
              chunkIndex: event.chunkIndex,
              chunkTotal: event.chunkTotal,
            });
          } else if (event.type === "done") {
            sawTerminal = true;
            post({
              type: "done",
              translatedText: event.translatedText || translated,
              detectedSourceLang: event.detectedSourceLang,
            });
          } else if (event.type === "error") {
            sawTerminal = true;
            post({ type: "error", error: event.error });
          }
        }
        if (!sawTerminal && !signal.aborted && !disconnected) {
          if (translated.trim()) {
            post({ type: "done", translatedText: translated });
          } else {
            post({ type: "error", error: "翻译未完成，请重试" });
          }
        }
      } catch (err) {
        if (signal.aborted || disconnected) {
          post({ type: "aborted" });
          return;
        }
        if (err instanceof ApiError) {
          if (err.status === 401 || err.status === 403) {
            await clearAuth();
            clearCatalogCaches();
            post({
              type: "error",
              error: "登录已过期，请重新登录",
              status: err.status,
              unauthenticated: true,
            });
            return;
          }
          post({
            type: "error",
            error: err.message,
            status: err.status,
            retryAfterSeconds: err.retryAfterSeconds,
          });
          return;
        }
        post({
          type: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        stopKeepAlive();
      }
    });

    port.onDisconnect.addListener(() => {
      disconnected = true;
      stopKeepAlive();
      abortController?.abort();
    });
  });
});
