import { loadExtensionState } from "@/lib/email/client";
import { OT_BTN_ATTR, OT_HOST_ATTR, OT_REPLACED_ATTR, type EmailProvider } from "@/lib/email/dom";
import {
  clearReplaceCache,
  getReplaceCache,
  runWholeEmailReplace,
  showOriginalFromCache,
  showTranslatedFromCache,
} from "@/lib/email/replace";
import { sendBg } from "@/lib/messaging";
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

const SCAN_DEBOUNCE_MS = 80;
const ROUTE_FALLBACK_MS = 2500;

function isOwnNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false;
  return (
    node.hasAttribute(OT_BTN_ATTR) ||
    node.hasAttribute(OT_HOST_ATTR) ||
    node.id === "ot-email-gmail-layout-fix" ||
    node.classList.contains("ot-email-toast")
  );
}

function isRelevantNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (isOwnNode(node)) return false;
  const cls = node.className;
  if (typeof cls === "string" && /(?:^|\s)(?:a3s|adn|ads|gs|ii)(?:\s|$)/.test(cls)) {
    return true;
  }
  if (node.hasAttribute("data-message-id") || node.getAttribute("role") === "listitem") {
    return true;
  }
  if (node.tagName === "DIV" && node.querySelector("div.a3s, div.adn, [data-message-id]")) {
    return true;
  }
  return false;
}

function mutationsLookRelevant(mutations: MutationRecord[]): boolean {
  for (const mutation of mutations) {
    if (isOwnNode(mutation.target)) continue;
    for (const node of mutation.addedNodes) {
      if (isRelevantNode(node)) return true;
    }
    for (const node of mutation.removedNodes) {
      if (isRelevantNode(node)) return true;
    }
  }
  return false;
}

function patchHistory(onNav: () => void): () => void {
  const wrap = (fn: History["pushState"]): History["pushState"] =>
    function (this: History, ...args: Parameters<History["pushState"]>) {
      const ret = fn.apply(this, args);
      onNav();
      return ret;
    };

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = wrap(origPush);
  history.replaceState = wrap(origReplace);
  return () => {
    history.pushState = origPush;
    history.replaceState = origReplace;
  };
}

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

  function handleButtonClick(btn: HTMLButtonElement, body: HTMLElement): void {
    const messageKey = provider.getOrCreateMessageKey(body);
    getSession(messageKey, body).btn = btn;
    const live = resolveLiveBody(messageKey, body) ?? body;
    void runEmailTranslate(btn, messageKey, live, emailTranslateMode);
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
      handleButtonClick(btn, live);
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

  let scanTimer: ReturnType<typeof setTimeout> | null = null;
  let scanRaf = 0;

  const scheduleScan = (immediate = false) => {
    const run = () => {
      scanTimer = null;
      scanRaf = 0;
      scanAndInject();
    };
    if (immediate) {
      if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
      }
      if (scanRaf) return;
      scanRaf = requestAnimationFrame(run);
      return;
    }
    if (scanTimer || scanRaf) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanRaf = requestAnimationFrame(run);
    }, SCAN_DEBOUNCE_MS);
  };

  const observer = new MutationObserver((mutations) => {
    if (!mutationsLookRelevant(mutations)) return;
    scheduleScan();
  });

  let observedRoot: Element | null = null;
  const observeAppRoot = () => {
    const root =
      document.querySelector("div[role='main']") ?? document.body ?? document.documentElement;
    if (!root || root === observedRoot) return;
    observer.disconnect();
    observedRoot = root;
    observer.observe(root, { childList: true, subtree: true });
  };

  // Only abort on real route changes (hash/path). Query-string churn is ignored.
  let lastRoute = provider.routeKey();
  const checkNav = () => {
    const next = provider.routeKey();
    if (next === lastRoute) return;
    lastRoute = next;
    abortAllRunning();
    observeAppRoot();
    scheduleScan(true);
  };

  window.addEventListener("popstate", checkNav);
  window.addEventListener("hashchange", checkNav);
  patchHistory(checkNav);
  window.setInterval(checkNav, ROUTE_FALLBACK_MS);

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

  observeAppRoot();
  void sendBg({ type: "warmup" });
  void syncEmailPrefsFromStorage().then(() => scheduleScan(true));
}
