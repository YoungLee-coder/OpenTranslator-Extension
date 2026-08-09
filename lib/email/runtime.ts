import { loadExtensionState } from "@/lib/email/client";
import { OT_BTN_ATTR, OT_REPLACED_ATTR, type EmailProvider } from "@/lib/email/dom";
import {
  clearReplaceCache,
  getReplaceCache,
  runWholeEmailReplace,
  showOriginalFromCache,
  showTranslatedFromCache,
} from "@/lib/email/replace";
import { getPrefs, resolveEmailTranslateMode } from "@/lib/storage";
import {
  createTranslateButton,
  mountButton,
  removeTranslateControls,
  setButtonPhase,
  showToast,
} from "@/lib/email/ui";
import type { EmailTranslateMode } from "@/types";

type Session = {
  abort: AbortController | null;
  running: boolean;
  /** Latest live body node for this message (provider may replace bodies). */
  body: HTMLElement;
  btn: HTMLButtonElement | null;
};

/** Shared Gmail in-page email translate runtime. */
export function startEmailTranslateRuntime(provider: EmailProvider): void {
  const sessions = new Map<string, Session>();
  let emailEnabled = true;
  let emailTranslateMode: EmailTranslateMode = "replace";

  function getSession(messageKey: string, body: HTMLElement): Session {
    let s = sessions.get(messageKey);
    if (!s) {
      s = { abort: null, running: false, body, btn: null };
      sessions.set(messageKey, s);
    } else {
      s.body = body;
    }
    return s;
  }

  function resolveLiveBody(messageKey: string, fallback: HTMLElement): HTMLElement | null {
    const session = sessions.get(messageKey);
    if (session?.body?.isConnected) return session.body;

    for (const body of provider.findOpenMessageBodies()) {
      if (provider.getOrCreateMessageKey(body) === messageKey) {
        if (session) session.body = body;
        return body;
      }
    }

    return fallback.isConnected ? fallback : null;
  }

  function resolveLiveButton(
    messageKey: string,
    body: HTMLElement,
    fallback: HTMLButtonElement | null,
  ): HTMLButtonElement | null {
    const session = sessions.get(messageKey);
    if (session?.btn?.isConnected) return session.btn;

    const root = provider.findMessageRoot(body);
    const fromRoot = root.querySelector(`[${OT_BTN_ATTR}]`);
    if (fromRoot instanceof HTMLButtonElement) {
      if (session) session.btn = fromRoot;
      return fromRoot;
    }

    const prev = body.previousElementSibling;
    if (prev instanceof HTMLElement) {
      const fromHost = prev.querySelector(`[${OT_BTN_ATTR}]`);
      if (fromHost instanceof HTMLButtonElement) {
        if (session) session.btn = fromHost;
        return fromHost;
      }
    }

    return fallback?.isConnected ? fallback : null;
  }

  function syncButtonFromDom(
    btn: HTMLButtonElement,
    messageKey: string,
    body: HTMLElement,
    mode: EmailTranslateMode = emailTranslateMode,
  ): void {
    const session = getSession(messageKey, body);
    session.btn = btn;
    if (session.running) {
      setButtonPhase(btn, "loading", "翻译中", mode);
      return;
    }

    const cache = getReplaceCache(messageKey);
    if (cache?.view === "translated") {
      // Body was replaced after a successful translate — re-apply cached HTML.
      if (!body.hasAttribute(OT_REPLACED_ATTR) && !body.hasAttribute("data-ot-gmail-replaced") && cache.translatedHtml) {
        showTranslatedFromCache(messageKey, body);
      }
      setButtonPhase(btn, "done", undefined, mode);
    } else if (cache?.view === "original" && cache.translatedHtml) {
      setButtonPhase(btn, "show-translation", undefined, mode);
    } else {
      setButtonPhase(btn, "idle", undefined, mode);
    }
  }

  async function runEmailTranslate(
    btn: HTMLButtonElement,
    messageKey: string,
    body: HTMLElement,
    mode: EmailTranslateMode,
  ): Promise<void> {
    const session = getSession(messageKey, body);
    session.btn = btn;
    if (session.running) {
      session.abort?.abort();
      return;
    }

    const cache = getReplaceCache(messageKey);
    // Mode mismatch (user switched settings): drop stale cache and retranslate.
    if (cache && cache.display !== mode) {
      if (cache.view === "translated") {
        showOriginalFromCache(messageKey, body);
      }
      clearReplaceCache(messageKey, body);
    } else if (cache?.view === "translated") {
      showOriginalFromCache(messageKey, body);
      setButtonPhase(btn, "show-translation", undefined, mode);
      return;
    } else if (cache?.view === "original" && cache.translatedHtml) {
      showTranslatedFromCache(messageKey, body);
      setButtonPhase(btn, "done", undefined, mode);
      return;
    }

    if (!emailEnabled) {
      showToast("Email 翻译已关闭，请在设置中开启");
      setButtonPhase(btn, "idle", undefined, mode);
      return;
    }

    const state = await loadExtensionState();
    if (!state?.bound) {
      showToast("请先打开 OpenTranslator 侧边栏并登录实例");
      setButtonPhase(btn, "error", "未登录", mode);
      return;
    }

    provider.ensureLayoutCss();

    const abort = new AbortController();
    session.abort = abort;
    session.running = true;
    setButtonPhase(btn, "loading", "翻译中", mode);

    try {
      const result = await runWholeEmailReplace(
        messageKey,
        () => resolveLiveBody(messageKey, body),
        state.sourceLang,
        state.targetLang,
        abort.signal,
        mode,
      );

      const finalBody = resolveLiveBody(messageKey, body) ?? body;
      const finalBtn = resolveLiveButton(messageKey, finalBody, btn);

      if (abort.signal.aborted || (!result.ok && result.cancelled)) {
        if (finalBtn) setButtonPhase(finalBtn, "idle", undefined, mode);
        return;
      }

      if (!result.ok) {
        if (result.unauthenticated) {
          showToast("登录已过期，请打开侧边栏重新登录");
        } else {
          showToast(result.error || "翻译失败");
        }
        if (finalBtn) setButtonPhase(finalBtn, "error", result.error, mode);
        return;
      }

      if (finalBtn) setButtonPhase(finalBtn, "done", undefined, mode);
    } catch (err) {
      const finalBody = resolveLiveBody(messageKey, body) ?? body;
      const finalBtn = resolveLiveButton(messageKey, finalBody, btn);
      if (abort.signal.aborted) {
        if (finalBtn) setButtonPhase(finalBtn, "idle", undefined, mode);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      showToast(message || "翻译失败");
      if (finalBtn) setButtonPhase(finalBtn, "error", message, mode);
    } finally {
      session.running = false;
      session.abort = null;
    }
  }

  async function handleButtonClick(btn: HTMLButtonElement, body: HTMLElement): Promise<void> {
    const messageKey = provider.getOrCreateMessageKey(body);
    getSession(messageKey, body).btn = btn;

    // Prefer live prefs so a settings change applies without reload.
    const prefs = await getPrefs();
    const mode = resolveEmailTranslateMode(prefs.emailTranslateMode);
    emailTranslateMode = mode;

    const live = resolveLiveBody(messageKey, body) ?? body;
    await runEmailTranslate(btn, messageKey, live, mode);
  }

  function ensureButtonForBody(body: HTMLElement): void {
    const messageKey = provider.getOrCreateMessageKey(body);
    const session = getSession(messageKey, body);
    const root = provider.findMessageRoot(body);
    const mountTarget = provider.resolveMountTarget?.(root, body) ?? null;

    const existingInRoot = root.querySelector(`[${OT_BTN_ATTR}]`);
    if (existingInRoot instanceof HTMLButtonElement && existingInRoot.isConnected) {
      syncButtonFromDom(existingInRoot, messageKey, body, emailTranslateMode);
      return;
    }

    if (mountTarget?.parent) {
      const existingInMount = mountTarget.parent.querySelector(`[${OT_BTN_ATTR}]`);
      if (existingInMount instanceof HTMLButtonElement && existingInMount.isConnected) {
        syncButtonFromDom(existingInMount, messageKey, body, emailTranslateMode);
        return;
      }
    }

    const prev = body.previousElementSibling;
    if (prev instanceof HTMLElement) {
      const existingInHost = prev.querySelector(`[${OT_BTN_ATTR}]`);
      if (existingInHost instanceof HTMLButtonElement && existingInHost.isConnected) {
        syncButtonFromDom(existingInHost, messageKey, body, emailTranslateMode);
        return;
      }
    }

    const btn = createTranslateButton(emailTranslateMode);
    const toolbar = provider.findToolbarHost(root, body);
    mountButton(btn, toolbar, body, provider.toolbarInsert ?? "end", mountTarget);
    session.btn = btn;
    syncButtonFromDom(btn, messageKey, body, emailTranslateMode);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const live = resolveLiveBody(messageKey, body) ?? body;
      void handleButtonClick(btn, live);
    });
  }

  function scanAndInject(): void {
    if (!emailEnabled) {
      removeTranslateControls();
      return;
    }
    provider.ensureLayoutCss();

    const liveKeys = new Set<string>();
    for (const body of provider.findOpenMessageBodies()) {
      liveKeys.add(provider.getOrCreateMessageKey(body));
      ensureButtonForBody(body);
    }

    // Drop sessions for messages no longer in the reading pane (keep running ones).
    for (const [key, session] of sessions) {
      if (!liveKeys.has(key) && !session.running) {
        sessions.delete(key);
      }
    }
  }

  function abortAllRunning(): void {
    for (const session of sessions.values()) {
      if (!session.running) continue;
      session.abort?.abort();
    }
  }

  function applyEmailPrefs(enabled: boolean, mode: EmailTranslateMode): void {
    const nextEnabled = enabled !== false;
    const nextMode = resolveEmailTranslateMode(mode);
    const enabledChanged = emailEnabled !== nextEnabled;
    const modeChanged = emailTranslateMode !== nextMode;

    emailEnabled = nextEnabled;
    emailTranslateMode = nextMode;

    if (!emailEnabled) {
      abortAllRunning();
      removeTranslateControls();
      return;
    }

    if (modeChanged) {
      for (const body of provider.findOpenMessageBodies()) {
        const key = provider.getOrCreateMessageKey(body);
        const cache = getReplaceCache(key);
        if (cache?.view === "translated") {
          showOriginalFromCache(key, body);
        }
        clearReplaceCache(key, body);
      }
    }

    if (enabledChanged || modeChanged) {
      document.querySelectorAll(`[${OT_BTN_ATTR}]`).forEach((node) => {
        if (!(node instanceof HTMLButtonElement)) return;
        setButtonPhase(node, "idle", undefined, emailTranslateMode);
      });
    }

    scanAndInject();
  }

  async function syncEmailPrefsFromStorage(): Promise<void> {
    const prefs = await getPrefs();
    applyEmailPrefs(
      prefs.emailEnabled !== false,
      resolveEmailTranslateMode(prefs.emailTranslateMode),
    );
  }

  let scheduled = false;
  const scheduleScan = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scanAndInject();
    });
  };

  const observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Only abort on real route changes (hash/path). Query-string churn is ignored.
  let lastRoute = provider.routeKey();
  const checkNav = () => {
    const next = provider.routeKey();
    if (next === lastRoute) return;
    lastRoute = next;
    abortAllRunning();
    scheduleScan();
  };
  window.addEventListener("popstate", checkNav);
  window.addEventListener("hashchange", checkNav);
  window.setInterval(checkNav, 800);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.prefs) return;
    const next = changes.prefs.newValue as
      | {
          emailEnabled?: boolean;
          emailTranslateMode?: EmailTranslateMode;
          gmailEnabled?: boolean;
          gmailTranslateMode?: EmailTranslateMode;
        }
      | undefined;
    const enabled =
      next?.emailEnabled !== undefined
        ? next.emailEnabled !== false
        : next?.gmailEnabled !== false;
    applyEmailPrefs(
      enabled,
      resolveEmailTranslateMode(next?.emailTranslateMode ?? next?.gmailTranslateMode),
    );
  });

  void syncEmailPrefsFromStorage().then(() => scheduleScan());
}
