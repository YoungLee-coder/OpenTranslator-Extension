import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  Copy,
  Settings,
  Square,
  X,
} from "lucide-react";
import SettingsView from "@/components/SettingsView";
import { useModels } from "@/hooks/useModels";
import { formatApiError } from "@/lib/errors";
import { isModelAvailabilityError } from "@/lib/experts";
import { LANGUAGES, languageLabel } from "@/lib/languages";
import { sendBg } from "@/lib/messaging";
import type { ExtensionState, TranslatePortOut } from "@/lib/messaging";
import { readExtensionState } from "@/lib/state";

const DEBOUNCE_MS = 500;

type View = "translate" | "settings";

function charCount(n: number) {
  return `${n} 字符`;
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

  const portRef = useRef<Browser.runtime.Port | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const local = await readExtensionState();
    setState(local);
    return local;
  }, []);

  const { models, reload: reloadModels } = useModels({
    enabled: state?.bound ?? false,
    userId: state?.user?.id,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = await readExtensionState();
      if (cancelled) return;
      setState(local);
      // Soft session check — does not block first paint.
      const res = await sendBg<ExtensionState>({ type: "me" });
      if (!cancelled && res.ok && res.data) setState(res.data);
    })();
    return () => {
      cancelled = true;
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
    portRef.current?.postMessage({ type: "abort" });
    portRef.current?.disconnect();
    portRef.current = null;
    setTranslating(false);
  }, []);

  const runTranslation = useCallback(
    (text: string, sourceLang: string, targetLang: string) => {
      stopTranslation();
      const trimmed = text.trim();
      if (!trimmed) {
        setTranslatedText("");
        setError("");
        setDetectedSourceLang(null);
        return;
      }

      setTranslating(true);
      setError("");
      setTranslatedText("");
      setDetectedSourceLang(null);

      const port = browser.runtime.connect({ name: "translate" });
      portRef.current = port;
      let accumulated = "";

      port.onMessage.addListener((msg: TranslatePortOut) => {
        if (msg.type === "delta") {
          accumulated += msg.text;
          setTranslatedText(accumulated);
        } else if (msg.type === "done") {
          setTranslatedText(msg.translatedText || accumulated);
          if (msg.detectedSourceLang) {
            setDetectedSourceLang(msg.detectedSourceLang);
          }
          setTranslating(false);
          port.disconnect();
          portRef.current = null;
        } else if (msg.type === "error") {
          setError(
            formatApiError(msg.error, msg.status, msg.status === 429 ? "api" : undefined),
          );
          setTranslating(false);
          port.disconnect();
          portRef.current = null;
          if (isModelAvailabilityError(msg.error, msg.status)) {
            void reloadModels();
          }
          if (msg.unauthenticated) {
            void refresh().then((data) => {
              if (!data?.bound) setView("settings");
            });
          }
        } else if (msg.type === "aborted") {
          setTranslating(false);
          portRef.current = null;
        }
      });

      port.onDisconnect.addListener(() => {
        setTranslating(false);
        portRef.current = null;
      });

      port.postMessage({
        type: "start",
        text: trimmed,
        sourceLang,
        targetLang,
      });
    },
    [stopTranslation, refresh, reloadModels],
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
    return () => stopTranslation();
  }, [stopTranslation]);

  const handleSourceChange = (value: string) => {
    setSourceText(value);
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
    await navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearSource = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    stopTranslation();
    setSourceText("");
    setTranslatedText("");
    setError("");
    setDetectedSourceLang(null);
  };

  const openSettings = () => {
    stopTranslation();
    setView("settings");
  };

  // First paint waits only for local storage (typically <10ms) — no spinner.
  if (!state) {
    return <div className="sidepanel" />;
  }

  if (view === "settings" || !state.bound) {
    return (
      <div className="sidepanel">
        <SettingsView
          variant="sidepanel"
          onBack={state.bound ? () => setView("translate") : undefined}
          onStateChange={handleStateChange}
          onLoginSuccess={handleLoginSuccess}
        />
      </div>
    );
  }

  const sourceLangs = LANGUAGES;
  const targetLangs = LANGUAGES.filter((l) => l.code !== "auto");
  const canTranslate = sourceText.trim().length > 0 && !translating && models.length > 0;

  return (
    <div className="sidepanel animate-rise">
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
            disabled={translating}
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
            disabled={translating || state.sourceLang === "auto"}
            title={state.sourceLang === "auto" ? "自动检测时无法互换" : "互换语言"}
            aria-label="互换语言"
          >
            <ArrowLeftRight size={14} strokeWidth={1.75} />
          </button>
          <select
            value={state.targetLang}
            onChange={(e) => void handleTargetLangChange(e.target.value)}
            disabled={translating}
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
              onChange={(e) => handleSourceChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={translating}
              autoFocus
              aria-label="原文"
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
            <div className="progress-bar" role="progressbar" aria-label="翻译中">
              <div className="progress-bar-fill" />
            </div>
          )}

          <div className="target-section">
            <div className="target-content" aria-live="polite" aria-label="译文">
              {error ? (
                <span className="target-error" role="alert">{error}</span>
              ) : translatedText ? (
                <span className="animate-fade-in">{translatedText}</span>
              ) : translating ? (
                <span className="target-placeholder">正在翻译…</span>
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
    </div>
  );
}
