import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  Copy,
  Settings,
  Square,
  X,
} from "lucide-react";
import { useModels } from "@/hooks/useModels";
import { formatApiError } from "@/lib/errors";
import { isModelAvailabilityError } from "@/lib/experts";
import { isRtlLanguage, LANGUAGES, languageLabel } from "@/lib/languages";
import { consumeRuntimeLastError, safePortPost, sendBg } from "@/lib/messaging";
import type { ExtensionState, TranslatePortOut } from "@/lib/messaging";
import { readExtensionState } from "@/lib/state";
import { getTranslateDraft, setTranslateDraft, subscribeAuthChange } from "@/lib/storage";
import { MAX_TRANSLATE_CHARS } from "@/types";

const SettingsView = lazy(() => import("@/components/SettingsView"));

const DEBOUNCE_MS = 280;
const DRAFT_PERSIST_MS = 400;

type View = "translate" | "settings";

function charCount(n: number) {
  return `${n} 字符`;
}

function newRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function isImmediateInput(event: React.ChangeEvent<HTMLTextAreaElement>): boolean {
  const native = event.nativeEvent;
  if (!(native instanceof InputEvent)) return false;
  return native.inputType === "insertFromPaste" || native.inputType === "insertFromDrop";
}

export default function App() {
  const [view, setView] = useState<View>("translate");
  const [state, setState] = useState<ExtensionState | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [detectedSourceLang, setDetectedSourceLang] = useState<string | null>(null);
  const [chunkProgress, setChunkProgress] = useState<{
    chunkIndex: number;
    chunkTotal: number;
  } | null>(null);

  const portRef = useRef<Browser.runtime.Port | null>(null);
  const ensurePortRef = useRef<() => Browser.runtime.Port | null>(() => null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestRef = useRef<string | null>(null);
  const accumulatedRef = useRef("");
  const rafRef = useRef(0);
  const queuePaintRef = useRef<() => void>(() => {});
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef<() => Promise<ExtensionState | null>>(async () => null);
  const reloadModelsRef = useRef<() => Promise<unknown>>(async () => {});
  const draftReadyRef = useRef(false);
  const translateDraftRef = useRef({
    sourceText: "",
    translatedText: "",
    detectedSourceLang: null as string | null,
  });

  const refresh = useCallback(async () => {
    const local = await readExtensionState();
    setState(local);
    return local;
  }, []);

  const { reload: reloadModels } = useModels({
    enabled: state?.bound ?? false,
    userId: state?.user?.id,
    onPrefsAdjusted: refresh,
  });

  refreshRef.current = refresh;
  reloadModelsRef.current = reloadModels;
  translateDraftRef.current = {
    sourceText,
    translatedText,
    detectedSourceLang,
  };
  queuePaintRef.current = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setTranslatedText(accumulatedRef.current);
    });
  };

  const cancelPaint = () => {
    if (!rafRef.current) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };

  useEffect(() => {
    void sendBg({ type: "warmup" });
    let cancelled = false;
    void (async () => {
      const [local, draft] = await Promise.all([readExtensionState(), getTranslateDraft()]);
      if (cancelled) return;
      setState(local);
      setSourceText(draft.sourceText);
      setTranslatedText(draft.translatedText);
      setDetectedSourceLang(draft.detectedSourceLang);
      draftReadyRef.current = true;
      const res = await sendBg<ExtensionState>({ type: "me" });
      if (!cancelled && res.ok && res.data) setState(res.data);
    })();
    const unsubscribe = subscribeAuthChange(() => {
      void refreshRef.current();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!draftReadyRef.current || translating) return;
    const timer = setTimeout(() => {
      void setTranslateDraft(translateDraftRef.current);
    }, DRAFT_PERSIST_MS);
    return () => clearTimeout(timer);
  }, [sourceText, translatedText, detectedSourceLang, translating]);

  useEffect(() => {
    const flush = () => {
      if (!draftReadyRef.current) return;
      void setTranslateDraft(translateDraftRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let port: Browser.runtime.Port | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;

    const handleMessage = (msg: TranslatePortOut) => {
      reconnectAttempt = 0;
      if (msg.type === "keepalive") return;
      if ("requestId" in msg && msg.requestId && msg.requestId !== activeRequestRef.current) {
        return;
      }

      if (msg.type === "delta") {
        accumulatedRef.current += msg.text;
        queuePaintRef.current();
      } else if (msg.type === "progress") {
        setChunkProgress({
          chunkIndex: msg.chunkIndex,
          chunkTotal: msg.chunkTotal,
        });
      } else if (msg.type === "done") {
        cancelPaint();
        accumulatedRef.current = msg.translatedText || accumulatedRef.current;
        setTranslatedText(accumulatedRef.current);
        if (msg.detectedSourceLang) {
          setDetectedSourceLang(msg.detectedSourceLang);
        }
        setChunkProgress(null);
        setTranslating(false);
        activeRequestRef.current = null;
      } else if (msg.type === "error") {
        cancelPaint();
        setError(
          formatApiError(
            msg.error,
            msg.status,
            msg.status === 429 ? "api" : undefined,
            msg.retryAfterSeconds,
          ),
        );
        setChunkProgress(null);
        setTranslating(false);
        activeRequestRef.current = null;
        if (isModelAvailabilityError(msg.error, msg.status)) {
          void reloadModelsRef.current();
        }
        if (msg.unauthenticated) {
          void (async () => {
            const data = await refreshRef.current();
            if (!data?.bound) setView("settings");
          })();
        }
      } else if (msg.type === "aborted") {
        cancelPaint();
        if (activeRequestRef.current === msg.requestId) {
          activeRequestRef.current = null;
        }
        setChunkProgress(null);
        setTranslating(false);
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const delay = Math.min(100 * 2 ** reconnectAttempt, 2000);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        wakeThenConnect();
      }, delay);
    };

    const connect = () => {
      if (cancelled) return null;
      if (portRef.current) return portRef.current;
      let next: Browser.runtime.Port;
      try {
        next = browser.runtime.connect({ name: "translate" });
      } catch {
        scheduleReconnect();
        return null;
      }
      port = next;
      portRef.current = next;
      next.onMessage.addListener(handleMessage);
      next.onDisconnect.addListener(() => {
        const disconnectError = consumeRuntimeLastError();
        if (portRef.current === next) portRef.current = null;
        if (port === next) port = null;
        if (activeRequestRef.current) {
          activeRequestRef.current = null;
          setTranslating(false);
          setChunkProgress(null);
          if (!cancelled && !/Extension context invalidated/i.test(disconnectError)) {
            setError("连接中断，请重试");
          }
        }
        if (cancelled) return;
        if (/Extension context invalidated/i.test(disconnectError)) return;
        scheduleReconnect();
      });
      return next;
    };

    const wakeThenConnect = () => {
      void (async () => {
        try {
          const res = await sendBg({ type: "warmup" });
          if (cancelled || portRef.current) return;
          if (res.ok) connect();
          else scheduleReconnect();
        } catch {
          if (!cancelled && !portRef.current) scheduleReconnect();
        }
      })();
    };

    ensurePortRef.current = () => portRef.current ?? connect();
    wakeThenConnect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      port?.disconnect();
      portRef.current = null;
    };
  }, []);

  const handleStateChange = useCallback((next: ExtensionState) => {
    setState(next);
  }, []);

  const handleLoginSuccess = useCallback(() => {
    setView("translate");
  }, []);

  const stopTranslation = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    cancelPaint();
    activeRequestRef.current = null;
    safePortPost(portRef.current, { type: "abort" });
    setTranslating(false);
  }, []);

  const runTranslation = useCallback(
    (text: string, sourceLang: string, targetLang: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      safePortPost(portRef.current, { type: "abort" });

      const trimmed = text.trim();
      if (!trimmed) {
        cancelPaint();
        activeRequestRef.current = null;
        accumulatedRef.current = "";
        setTranslatedText("");
        setError("");
        setDetectedSourceLang(null);
        setChunkProgress(null);
        setTranslating(false);
        return;
      }

      if (trimmed.length > MAX_TRANSLATE_CHARS) {
        cancelPaint();
        activeRequestRef.current = null;
        accumulatedRef.current = "";
        setTranslatedText("");
        setDetectedSourceLang(null);
        setChunkProgress(null);
        setTranslating(false);
        setError(`原文过长，请缩短后再试（上限 ${MAX_TRANSLATE_CHARS.toLocaleString("zh-CN")} 字符）`);
        return;
      }

      const requestId = newRequestId();
      activeRequestRef.current = requestId;
      accumulatedRef.current = "";
      cancelPaint();
      setTranslating(true);
      setError("");
      setTranslatedText("");
      setDetectedSourceLang(null);
      setChunkProgress(null);

      const port = ensurePortRef.current();
      if (
        !safePortPost(port, {
          type: "start",
          requestId,
          text: trimmed,
          sourceLang,
          targetLang,
        })
      ) {
        activeRequestRef.current = null;
        setTranslating(false);
        setError("扩展后台未就绪，请稍后重试");
      }
    },
    [],
  );

  const scheduleTranslation = useCallback(
    (text: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!state?.bound) return;
        runTranslation(text, state.sourceLang, state.targetLang);
      }, DEBOUNCE_MS);
    },
    [state, runTranslation],
  );

  useEffect(() => {
    return () => {
      stopTranslation();
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, [stopTranslation]);

  const handleSourceChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setSourceText(value);
    if (!state?.bound) return;
    if (!value.trim()) {
      stopTranslation();
      accumulatedRef.current = "";
      setTranslatedText("");
      setError("");
      setDetectedSourceLang(null);
      setChunkProgress(null);
      return;
    }
    if (isImmediateInput(event)) {
      runTranslation(value, state.sourceLang, state.targetLang);
      return;
    }
    scheduleTranslation(value);
  };

  const handleSourceLangChange = async (sourceLang: string) => {
    const res = await sendBg<ExtensionState>({ type: "setPrefs", sourceLang });
    if (res.ok && res.data) setState(res.data);
    if (sourceLang !== "auto") setDetectedSourceLang(null);
    if (sourceText.trim()) {
      runTranslation(sourceText, sourceLang, state?.targetLang ?? "zh-CN");
    }
  };

  const handleTargetLangChange = async (targetLang: string) => {
    const res = await sendBg<ExtensionState>({ type: "setPrefs", targetLang });
    if (res.ok && res.data) setState(res.data);
    if (sourceText.trim()) {
      runTranslation(sourceText, state?.sourceLang ?? "auto", targetLang);
    }
  };

  const handleSwapLanguages = async () => {
    if (!state || state.sourceLang === "auto") return;
    const nextSource = state.targetLang;
    const nextTarget = state.sourceLang;
    const res = await sendBg<ExtensionState>({
      type: "setPrefs",
      sourceLang: nextSource,
      targetLang: nextTarget,
    });
    if (!res.ok || !res.data) return;
    setState(res.data);
    const nextSourceText = translatedText;
    const nextTargetText = sourceText;
    setSourceText(nextSourceText);
    setTranslatedText(nextTargetText);
    setDetectedSourceLang(null);
    if (nextSourceText.trim()) {
      runTranslation(nextSourceText, nextSource, nextTarget);
    }
  };

  const handleTranslate = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!state?.bound) return;
    runTranslation(sourceText, state.sourceLang, state.targetLang);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleTranslate();
    }
  };

  const handleCopy = async () => {
    if (!translatedText) return;
    try {
      await navigator.clipboard.writeText(translatedText);
    } catch {
      setError("复制失败，请手动选择文本");
      return;
    }
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => {
      copiedTimerRef.current = null;
      setCopied(false);
    }, 2000);
  };

  const handleClearSource = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    stopTranslation();
    setSourceText("");
    setTranslatedText("");
    setError("");
    setDetectedSourceLang(null);
    setChunkProgress(null);
  };

  const openSettings = () => {
    stopTranslation();
    setView("settings");
  };

  // First paint waits only for local storage (typically <10ms) — no spinner.
  if (!state) {
    return (
      <div className="sidepanel" role="status" aria-live="polite">
        <span className="visually-hidden">加载中</span>
      </div>
    );
  }

  if (view === "settings" || !state.bound) {
    return (
      <div className="sidepanel">
        <Suspense
          fallback={
            <div className="sidepanel" role="status" aria-live="polite">
              <span className="visually-hidden">加载中</span>
            </div>
          }
        >
          <SettingsView
            variant="sidepanel"
            onBack={state.bound ? () => setView("translate") : undefined}
            onStateChange={handleStateChange}
            onLoginSuccess={handleLoginSuccess}
          />
        </Suspense>
      </div>
    );
  }

  const sourceLangs = LANGUAGES;
  const targetLangs = LANGUAGES.filter((l) => l.code !== "auto");
  const canTranslate = sourceText.trim().length > 0 && !translating;

  const sourceDir = isRtlLanguage(state.sourceLang) ? "rtl" : "ltr";
  const targetDir = isRtlLanguage(state.targetLang) ? "rtl" : "ltr";

  return (
    <main className="sidepanel animate-rise">
      <h1 className="visually-hidden">翻译</h1>
      <div className="card sidepanel-card">
        <div className="lang-bar">
          <button
            type="button"
            className="btn btn-ghost btn-icon lang-bar-settings"
            onClick={openSettings}
            title="设置"
            aria-label="设置"
          >
            <Settings size={15} strokeWidth={1.75} />
          </button>
          <select
            value={state.sourceLang}
            onChange={(e) => void handleSourceLangChange(e.target.value)}
            aria-label="源语言"
          >
            {sourceLangs.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-outline btn-icon"
            onClick={() => void handleSwapLanguages()}
            disabled={state.sourceLang === "auto"}
            title={state.sourceLang === "auto" ? "自动检测时无法互换" : "互换语言"}
            aria-label="互换语言"
          >
            <ArrowLeftRight size={14} strokeWidth={1.75} />
          </button>
          <select
            value={state.targetLang}
            onChange={(e) => void handleTargetLangChange(e.target.value)}
            aria-label="目标语言"
          >
            {targetLangs.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sidepanel-body">
          <div className="source-section">
            <textarea
              placeholder="输入或粘贴文本，将自动翻译…"
              value={sourceText}
              onChange={handleSourceChange}
              onKeyDown={handleKeyDown}
              autoFocus
              lang={state.sourceLang === "auto" ? undefined : state.sourceLang}
              dir={state.sourceLang === "auto" ? undefined : sourceDir}
              aria-label="原文"
              aria-busy={translating}
            />
            <div className="panel-footer">
              <span className="panel-section-label">
                原文
                {state.sourceLang === "auto" && detectedSourceLang && (
                  <span className="panel-detected-lang">
                    · 检测到 {languageLabel(detectedSourceLang)}
                  </span>
                )}
              </span>
              <div className="panel-footer-actions">
                {sourceText.length > 0 && (
                  <span className="tabular-nums panel-meta">{charCount(sourceText.length)}</span>
                )}
                {sourceText.length > 0 && !translating && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={handleClearSource}
                    title="清空"
                    aria-label="清空原文"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                )}
                <kbd className="kbd-hint">⌘/Ctrl + Enter</kbd>
                {translating ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={stopTranslation}
                    aria-label="停止翻译"
                  >
                    <Square size={12} fill="currentColor" strokeWidth={0} />
                    停止
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={handleTranslate}
                    disabled={!canTranslate}
                  >
                    翻译
                  </button>
                )}
              </div>
            </div>
          </div>

          {translating && (
            <div
              className="progress-bar"
              role="progressbar"
              aria-label={
                chunkProgress
                  ? `翻译中，第 ${chunkProgress.chunkIndex + 1} / ${chunkProgress.chunkTotal} 段`
                  : "翻译中"
              }
              aria-valuemin={chunkProgress ? 0 : undefined}
              aria-valuemax={chunkProgress ? chunkProgress.chunkTotal : undefined}
              aria-valuenow={
                chunkProgress ? chunkProgress.chunkIndex + 1 : undefined
              }
            >
              <div
                className={[
                  "progress-bar-fill",
                  chunkProgress ? "is-determinate" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  chunkProgress
                    ? {
                        width: `${Math.max(
                          ((chunkProgress.chunkIndex + 1) / chunkProgress.chunkTotal) * 100,
                          8,
                        )}%`,
                      }
                    : undefined
                }
              />
            </div>
          )}

          <div className="target-section">
            <div
              className="target-content"
              aria-live="polite"
              aria-label="译文"
              lang={state.targetLang}
              dir={targetDir}
            >
              {error ? (
                <span className="target-error" role="alert">{error}</span>
              ) : translating || translatedText ? (
                <span className={translating ? undefined : "animate-fade-in"}>{translatedText}</span>
              ) : (
                <span className="target-placeholder">译文将显示在这里</span>
              )}
              {translating && !error && (
                <span className="animate-blink target-cursor" aria-hidden>
                  ▍
                </span>
              )}
            </div>
            <div className="panel-footer">
              <span className="panel-section-label">译文</span>
              <div className="panel-footer-actions">
                {!error && translatedText.length > 0 && (
                  <span className="tabular-nums panel-meta">{charCount(translatedText.length)}</span>
                )}
                {translatedText && !translating && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void handleCopy()}
                    aria-label={copied ? "已复制译文" : "复制译文"}
                  >
                    {copied ? (
                      <>
                        <Check size={12} className="text-success" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        复制
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
