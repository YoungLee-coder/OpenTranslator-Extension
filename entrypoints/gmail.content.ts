import "@/assets/gmail-content.css";
import { loadExtensionState } from "@/lib/gmail/client";
import {
  OT_BTN_ATTR,
  findMessageRoot,
  findOpenMessageBodies,
  findToolbarHost,
  getOrCreateMessageKey,
  gmailRouteKey,
} from "@/lib/gmail/dom";
import {
  clearReplaceCache,
  getReplaceCache,
  runWholeEmailReplace,
  showOriginalFromCache,
  showTranslatedFromCache,
} from "@/lib/gmail/replace";
import { getPrefs, resolveGmailTranslateMode } from "@/lib/storage";
import {
  createTranslateButton,
  ensureGmailLayoutCss,
  mountButton,
  removeTranslateControls,
  setButtonPhase,
  showToast,
} from "@/lib/gmail/ui";
import type { GmailTranslateMode } from "@/types";

type Session = {
  abort: AbortController | null;
  running: boolean;
  /** Latest live body node for this message (Gmail may replace `.a3s`). */
  body: HTMLElement;
  btn: HTMLButtonElement | null;
};

const sessions = new Map<string, Session>();
let gmailEnabled = true;
let gmailTranslateMode: GmailTranslateMode = "replace";

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

  for (const body of findOpenMessageBodies()) {
    if (getOrCreateMessageKey(body) === messageKey) {
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

  const root = findMessageRoot(body);
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
  mode: GmailTranslateMode = gmailTranslateMode,
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
    if (!body.hasAttribute("data-ot-gmail-replaced") && cache.translatedHtml) {
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
  mode: GmailTranslateMode,
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

  if (!gmailEnabled) {
    showToast("Gmail 翻译已关闭，请在设置中开启");
    setButtonPhase(btn, "idle", undefined, mode);
    return;
  }

  const state = await loadExtensionState();
  if (!state?.bound) {
    showToast("请先打开 OpenTranslator 侧边栏并登录实例");
    setButtonPhase(btn, "error", "未登录", mode);
    return;
  }

  ensureGmailLayoutCss();

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
  const messageKey = getOrCreateMessageKey(body);
  getSession(messageKey, body).btn = btn;

  // Prefer live prefs so a settings change applies without reload.
  const prefs = await getPrefs();
  const mode = resolveGmailTranslateMode(prefs.gmailTranslateMode);
  gmailTranslateMode = mode;

  const live = resolveLiveBody(messageKey, body) ?? body;
  await runEmailTranslate(btn, messageKey, live, mode);
}

function ensureButtonForBody(body: HTMLElement): void {
  const messageKey = getOrCreateMessageKey(body);
  const session = getSession(messageKey, body);
  const root = findMessageRoot(body);

  const existingInRoot = root.querySelector(`[${OT_BTN_ATTR}]`);
  if (existingInRoot instanceof HTMLButtonElement) {
    syncButtonFromDom(existingInRoot, messageKey, body, gmailTranslateMode);
    return;
  }

  const prev = body.previousElementSibling;
  if (prev instanceof HTMLElement) {
    const existingInHost = prev.querySelector(`[${OT_BTN_ATTR}]`);
    if (existingInHost instanceof HTMLButtonElement) {
      syncButtonFromDom(existingInHost, messageKey, body, gmailTranslateMode);
      return;
    }
  }

  const btn = createTranslateButton(gmailTranslateMode);
  const toolbar = findToolbarHost(root, body);
  mountButton(btn, toolbar, body);
  session.btn = btn;
  syncButtonFromDom(btn, messageKey, body, gmailTranslateMode);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const live = resolveLiveBody(messageKey, body) ?? body;
    void handleButtonClick(btn, live);
  });
}

function scanAndInject(): void {
  if (!gmailEnabled) {
    removeTranslateControls();
    return;
  }
  ensureGmailLayoutCss();

  const liveKeys = new Set<string>();
  for (const body of findOpenMessageBodies()) {
    liveKeys.add(getOrCreateMessageKey(body));
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

function applyGmailPrefs(enabled: boolean, mode: GmailTranslateMode): void {
  const nextEnabled = enabled !== false;
  const nextMode = resolveGmailTranslateMode(mode);
  const enabledChanged = gmailEnabled !== nextEnabled;
  const modeChanged = gmailTranslateMode !== nextMode;

  gmailEnabled = nextEnabled;
  gmailTranslateMode = nextMode;

  if (!gmailEnabled) {
    abortAllRunning();
    removeTranslateControls();
    return;
  }

  if (modeChanged) {
    for (const body of findOpenMessageBodies()) {
      const key = getOrCreateMessageKey(body);
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
      setButtonPhase(node, "idle", undefined, gmailTranslateMode);
    });
  }

  scanAndInject();
}

async function syncGmailPrefsFromStorage(): Promise<void> {
  const prefs = await getPrefs();
  applyGmailPrefs(prefs.gmailEnabled !== false, resolveGmailTranslateMode(prefs.gmailTranslateMode));
}

export default defineContentScript({
  matches: ["https://mail.google.com/*"],
  main() {
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

    // Only abort on real Gmail route changes (hash/path). Query-string churn is ignored.
    let lastRoute = gmailRouteKey();
    const checkNav = () => {
      const next = gmailRouteKey();
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
        | { gmailEnabled?: boolean; gmailTranslateMode?: GmailTranslateMode }
        | undefined;
      applyGmailPrefs(
        next?.gmailEnabled !== false,
        resolveGmailTranslateMode(next?.gmailTranslateMode),
      );
    });

    void syncGmailPrefsFromStorage().then(() => scheduleScan());
  },
});
