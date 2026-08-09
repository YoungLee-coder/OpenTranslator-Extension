import "@/assets/gmail-content.css";
import {
  buildBilingualConfig,
  ensureEngineStyles,
  hasEngineTranslations,
  registerTranslateTextForPage,
  removeTranslationsInScope,
  setTranslateSession,
} from "@/lib/read-frog-adapter";
import { loadExtensionState } from "@/lib/gmail/client";
import {
  OT_BTN_ATTR,
  findMessageRoot,
  findOpenMessageBodies,
  findToolbarHost,
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
import { walkAndLabelElement } from "#rf/utils/host/dom/traversal";
import { translateWalkedElement } from "#rf/utils/host/translate/core/translation-walker";
import { createWorkPacer } from "#rf/utils/scheduler";
import { getRandomUUID } from "#rf/utils/utils";

type Session = {
  abort: AbortController | null;
  running: boolean;
};

const sessions = new WeakMap<HTMLElement, Session>();
let translateImplRegistered = false;
let gmailEnabled = true;
let gmailTranslateMode: GmailTranslateMode = "replace";

function ensureTranslateImpl(): void {
  if (translateImplRegistered) return;
  registerTranslateTextForPage();
  translateImplRegistered = true;
}

function getSession(body: HTMLElement): Session {
  let s = sessions.get(body);
  if (!s) {
    s = { abort: null, running: false };
    sessions.set(body, s);
  }
  return s;
}

function syncButtonFromDom(
  btn: HTMLButtonElement,
  body: HTMLElement,
  mode: GmailTranslateMode = gmailTranslateMode,
): void {
  const session = getSession(body);
  if (session.running) {
    setButtonPhase(btn, mode === "replace" ? "loading" : "stop", "翻译中", mode);
    return;
  }

  if (mode === "bilingual") {
    if (hasEngineTranslations(body)) {
      setButtonPhase(btn, "done", undefined, mode);
    } else {
      setButtonPhase(btn, "idle", undefined, mode);
    }
    return;
  }

  const cache = getReplaceCache(body);
  if (cache?.view === "translated") {
    setButtonPhase(btn, "done", undefined, mode);
  } else if (cache?.view === "original" && cache.translatedHtml) {
    setButtonPhase(btn, "show-translation", undefined, mode);
  } else {
    setButtonPhase(btn, "idle", undefined, mode);
  }
}

async function runBilingualTranslate(btn: HTMLButtonElement, body: HTMLElement): Promise<void> {
  const session = getSession(body);
  if (session.running) {
    session.abort?.abort();
    return;
  }

  if (hasEngineTranslations(body)) {
    removeTranslationsInScope(body);
    setButtonPhase(btn, "idle", undefined, "bilingual");
    return;
  }

  if (!gmailEnabled) {
    showToast("Gmail 翻译已关闭，请在设置中开启");
    setButtonPhase(btn, "idle", undefined, "bilingual");
    return;
  }

  const state = await loadExtensionState();
  if (!state?.bound) {
    showToast("请先打开 OpenTranslator 侧边栏并登录实例");
    setButtonPhase(btn, "error", "未登录", "bilingual");
    return;
  }

  ensureTranslateImpl();
  ensureGmailLayoutCss();

  const config = buildBilingualConfig({
    sourceLang: state.sourceLang,
    targetLang: state.targetLang,
  });
  await ensureEngineStyles(config);

  const abort = new AbortController();
  session.abort = abort;
  session.running = true;
  setButtonPhase(btn, "stop", undefined, "bilingual");
  setTranslateSession(state.sourceLang, state.targetLang, abort.signal);

  const walkId = getRandomUUID();
  const shouldContinue = () => !abort.signal.aborted;

  try {
    walkAndLabelElement(body, walkId, config);
    await translateWalkedElement(
      body,
      walkId,
      config,
      false,
      createWorkPacer(),
      shouldContinue,
    );

    if (abort.signal.aborted) {
      removeTranslationsInScope(body);
      setButtonPhase(btn, "idle", undefined, "bilingual");
      return;
    }

    if (!hasEngineTranslations(body)) {
      showToast("未找到可翻译的正文");
      setButtonPhase(btn, "error", undefined, "bilingual");
      return;
    }

    setButtonPhase(btn, "done", undefined, "bilingual");
  } catch (err) {
    if (abort.signal.aborted) {
      removeTranslationsInScope(body);
      setButtonPhase(btn, "idle", undefined, "bilingual");
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/未登录|登录|unauth|401/i.test(message)) {
      showToast("登录已过期，请打开侧边栏重新登录");
    } else {
      showToast(message || "翻译失败");
    }
    removeTranslationsInScope(body);
    setButtonPhase(btn, "error", message, "bilingual");
  } finally {
    session.running = false;
    session.abort = null;
    setTranslateSession(state.sourceLang, state.targetLang, null);
  }
}

async function runReplaceTranslate(btn: HTMLButtonElement, body: HTMLElement): Promise<void> {
  const session = getSession(body);
  if (session.running) {
    session.abort?.abort();
    return;
  }

  const cache = getReplaceCache(body);
  if (cache?.view === "translated") {
    showOriginalFromCache(body);
    setButtonPhase(btn, "show-translation", undefined, "replace");
    return;
  }
  if (cache?.view === "original" && cache.translatedHtml) {
    showTranslatedFromCache(body);
    setButtonPhase(btn, "done", undefined, "replace");
    return;
  }

  if (!gmailEnabled) {
    showToast("Gmail 翻译已关闭，请在设置中开启");
    setButtonPhase(btn, "idle", undefined, "replace");
    return;
  }

  const state = await loadExtensionState();
  if (!state?.bound) {
    showToast("请先打开 OpenTranslator 侧边栏并登录实例");
    setButtonPhase(btn, "error", "未登录", "replace");
    return;
  }

  ensureGmailLayoutCss();

  const abort = new AbortController();
  session.abort = abort;
  session.running = true;
  setButtonPhase(btn, "loading", "翻译中", "replace");

  try {
    const result = await runWholeEmailReplace(
      body,
      state.sourceLang,
      state.targetLang,
      abort.signal,
    );

    if (abort.signal.aborted || (!result.ok && result.cancelled)) {
      setButtonPhase(btn, "idle", undefined, "replace");
      return;
    }

    if (!result.ok) {
      if (result.unauthenticated) {
        showToast("登录已过期，请打开侧边栏重新登录");
      } else {
        showToast(result.error || "翻译失败");
      }
      setButtonPhase(btn, "error", result.error, "replace");
      return;
    }

    setButtonPhase(btn, "done", undefined, "replace");
  } catch (err) {
    if (abort.signal.aborted) {
      setButtonPhase(btn, "idle", undefined, "replace");
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    showToast(message || "翻译失败");
    setButtonPhase(btn, "error", message, "replace");
  } finally {
    session.running = false;
    session.abort = null;
  }
}

async function handleButtonClick(btn: HTMLButtonElement, body: HTMLElement): Promise<void> {
  // Prefer live prefs so a settings change applies without reload.
  const prefs = await getPrefs();
  const mode = resolveGmailTranslateMode(prefs.gmailTranslateMode);
  gmailTranslateMode = mode;

  if (mode === "bilingual") {
    // Leaving replace view: restore original if we had swapped the body.
    const cache = getReplaceCache(body);
    if (cache?.view === "translated") {
      showOriginalFromCache(body);
    }
    clearReplaceCache(body);
    await runBilingualTranslate(btn, body);
    return;
  }

  // Leaving bilingual: clear inserted wrappers so replace sees clean source.
  if (hasEngineTranslations(body)) {
    removeTranslationsInScope(body);
  }
  await runReplaceTranslate(btn, body);
}

function ensureButtonForBody(body: HTMLElement): void {
  const root = findMessageRoot(body);
  if (root.querySelector(`[${OT_BTN_ATTR}]`)) {
    const existing = root.querySelector(`[${OT_BTN_ATTR}]`);
    if (existing instanceof HTMLButtonElement) {
      syncButtonFromDom(existing, body, gmailTranslateMode);
    }
    return;
  }

  const prev = body.previousElementSibling;
  if (prev instanceof HTMLElement && prev.querySelector(`[${OT_BTN_ATTR}]`)) {
    return;
  }

  const btn = createTranslateButton(gmailTranslateMode);
  const toolbar = findToolbarHost(root, body);
  mountButton(btn, toolbar, body);
  syncButtonFromDom(btn, body, gmailTranslateMode);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void handleButtonClick(btn, body);
  });
}

function scanAndInject(): void {
  if (!gmailEnabled) {
    removeTranslateControls();
    return;
  }
  ensureGmailLayoutCss();
  for (const body of findOpenMessageBodies()) {
    ensureButtonForBody(body);
  }
}

function abortAllRunning(): void {
  document.querySelectorAll(`[${OT_BTN_ATTR}]`).forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) return;
    if (node.dataset.otPhase === "stop" || node.dataset.otPhase === "loading") {
      node.click();
    }
  });
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
      const cache = getReplaceCache(body);
      if (cache?.view === "translated") {
        showOriginalFromCache(body);
      }
      clearReplaceCache(body);
      if (hasEngineTranslations(body)) {
        removeTranslationsInScope(body);
      }
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

    let lastHref = location.href;
    const checkNav = () => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        abortAllRunning();
        scheduleScan();
      }
    };
    window.addEventListener("popstate", checkNav);
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
