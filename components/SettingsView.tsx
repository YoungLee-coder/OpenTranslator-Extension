import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import SettingsAccountHub from "@/components/settings/SettingsAccountHub";
import SettingsAlerts from "@/components/settings/SettingsAlerts";
import SettingsInstanceSetup from "@/components/settings/SettingsInstanceSetup";
import { isPingConnected, pingSetupHint } from "@/components/settings/utils";
import { useExperts } from "@/hooks/useExperts";
import { useModels } from "@/hooks/useModels";
import { formatApiError } from "@/lib/errors";
import { sendBg } from "@/lib/messaging";
import type { ExtensionState } from "@/lib/messaging";
import { ensureHostPermission } from "@/lib/permissions";
import { readExtensionState } from "@/lib/state";
import {
  clearLoginDraft,
  getLoginDraft,
  setLoginDraft,
  subscribeAuthChange,
} from "@/lib/storage";
import { userLoginName, type PingResponse } from "@/types";
import { normalizeUsername } from "@/lib/username";
import "./settings.css";

type SettingsViewProps = {
  variant?: "sidepanel" | "page";
  onBack?: () => void;
  onStateChange?: (state: ExtensionState) => void;
  onLoginSuccess?: () => void;
};

export default function SettingsView({
  variant = "page",
  onBack,
  onStateChange,
  onLoginSuccess,
}: SettingsViewProps) {
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<ExtensionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [pingBusy, setPingBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pingOk, setPingOk] = useState(false);
  const [pingBindings, setPingBindings] = useState<PingResponse["bindings"] | null>(null);
  const [pingService, setPingService] = useState("");
  const [pingHint, setPingHint] = useState("");

  const applyState = useCallback(
    async (data: ExtensionState) => {
      setState(data);
      onStateChange?.(data);
      if (data.bound) {
        if (data.baseUrl) setBaseUrl(data.baseUrl);
        if (data.user) setUsername(userLoginName(data.user));
        return;
      }
      const draft = await getLoginDraft();
      setBaseUrl(data.baseUrl || draft.baseUrl);
      setUsername(data.user ? userLoginName(data.user) : draft.username);
    },
    [onStateChange],
  );

  const refresh = useCallback(async () => {
    const local = await readExtensionState();
    await applyState(local);
    return local;
  }, [applyState]);

  const bound = state?.bound ?? false;
  const {
    models,
    loading: modelsLoading,
    error: modelsError,
  } = useModels({
    enabled: bound,
    userId: state?.user?.id,
    onPrefsAdjusted: refresh,
  });
  const { experts, defaultExpertId } = useExperts({
    enabled: bound,
    userId: state?.user?.id,
    onPrefsAdjusted: refresh,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = await readExtensionState();
      if (cancelled) return;
      await applyState(local);
    })();
    const unsubscribe = subscribeAuthChange(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [applyState, refresh]);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const resetPingState = () => {
    setPingOk(false);
    setPingBindings(null);
    setPingService("");
    setPingHint("");
  };

  const handleTestConnection = async () => {
    setError("");
    setSuccess("");
    setPingBusy(true);
    try {
      const granted = await ensureHostPermission(baseUrl);
      if (!granted) {
        resetPingState();
        setError("需要授予访问该实例的权限");
        return;
      }
      const res = await sendBg<PingResponse>({ type: "ping", baseUrl });
      if (!res.ok) {
        resetPingState();
        setError(formatApiError(res.error, res.status, res.kind));
        return;
      }
      if (!res.data) {
        resetPingState();
        setError("无法读取实例状态");
        return;
      }
      const data = res.data;
      const connected = isPingConnected(data);
      setPingOk(connected);
      setPingBindings(data.bindings ?? null);
      setPingService(data.service ?? "OpenTranslator");
      if (!connected) {
        setPingHint("");
        setError("实例未就绪：请确认 Worker 已绑定 D1 与 KV");
        return;
      }
      const hint = pingSetupHint(data);
      setPingHint(hint ?? "");
      try {
        await setLoginDraft({ baseUrl: baseUrl.trim(), username });
      } catch {
        // ping succeeded; draft can be retried on the next edit
      }
    } catch (err) {
      resetPingState();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPingBusy(false);
    }
  };

  const handleLogin = async () => {
    clearMessages();
    const loginName = normalizeUsername(username);
    if (!username.trim() || !password) {
      setError("请填写用户名和密码");
      return;
    }
    if (!loginName) {
      setError("用户名为 2–64 个字符，且不能包含空格");
      return;
    }
    setBusy(true);
    try {
      const granted = await ensureHostPermission(baseUrl);
      if (!granted) {
        setError("需要授予访问该实例的权限");
        return;
      }
      const res = await sendBg({ type: "login", baseUrl, username: loginName, password });
      if (!res.ok) {
        setError(formatApiError(res.error, res.status, res.kind));
        return;
      }
      setPassword("");
      setSuccess("登录成功，已绑定实例");
      await refresh();
      onLoginSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleLogin();
  };

  const handleLogout = async () => {
    clearMessages();
    setBusy(true);
    try {
      const res = await sendBg({ type: "logout" });
      if (!res.ok) {
        setError(formatApiError(res.error, res.status, res.kind));
      } else {
        setSuccess("已退出登录");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
    resetPingState();
    await refresh();
  };

  const handleChangeInstance = async () => {
    clearMessages();
    setBusy(true);
    await clearLoginDraft();
    try {
      await sendBg({ type: "logout" });
    } catch {
      // still drop local session
    }
    setBusy(false);
    resetPingState();
    setBaseUrl("");
    setUsername("");
    setPassword("");
    await refresh();
  };

  const handleModelChange = async (modelKey: string) => {
    clearMessages();
    const res = await sendBg<ExtensionState>({
      type: "setPrefs",
      modelKey: modelKey || null,
    });
    if (!res.ok) {
      setError(formatApiError(res.error, res.status, res.kind));
      return;
    }
    if (res.data) {
      setState(res.data);
      onStateChange?.(res.data);
    }
  };

  const handleExpertChange = async (expertId: string) => {
    clearMessages();
    const res = await sendBg<ExtensionState>({ type: "setPrefs", expertId });
    if (!res.ok) {
      setError(formatApiError(res.error, res.status, res.kind));
      return;
    }
    if (res.data) {
      setState(res.data);
      onStateChange?.(res.data);
    }
  };

  const persistLoginDraft = (nextBaseUrl: string, nextUsername: string) => {
    void (async () => {
      try {
        await setLoginDraft({ baseUrl: nextBaseUrl, username: nextUsername });
      } catch {
        // quota / unavailable — next successful write restores it
      }
    })();
  };

  const handleBaseUrlChange = (value: string) => {
    setBaseUrl(value);
    resetPingState();
    persistLoginDraft(value, username);
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    persistLoginDraft(baseUrl, value);
  };

  const rootClass = [
    "settings-view",
    variant === "sidepanel" ? "settings-view-sidepanel" : "settings-view-page",
    "animate-rise",
  ].join(" ");

  // Wait for local storage only — no spinner / network gate.
  if (!state) {
    return (
      <div className={rootClass} role="status" aria-live="polite">
        <span className="visually-hidden">加载中</span>
      </div>
    );
  }

  const isDev = import.meta.env.DEV;
  const isSidepanel = variant === "sidepanel";

  return (
    <main className={rootClass}>
      {isSidepanel && (
        <header className="settings-header-bar">
          {onBack ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm settings-back"
              onClick={onBack}
              aria-label="返回翻译"
            >
              <ArrowLeft size={14} strokeWidth={1.75} />
              返回
            </button>
          ) : (
            <span />
          )}
          <span className="settings-header-title">设置</span>
          <span className="settings-header-spacer" aria-hidden />
        </header>
      )}

      <div className="settings-content">
        {!isSidepanel && (
          <header className="settings-page-header">
            <BrandMark
              size={40}
              className="brand-mark settings-page-mark text-foreground"
            />
            <h1 className="font-display">OpenTranslator</h1>
            <p>连接你的自托管翻译实例并登录账号。</p>
          </header>
        )}

        {bound && state?.user ? (
          <>
            <SettingsAlerts error={error} success={success} />
            <SettingsAccountHub
              state={state}
              baseUrl={baseUrl}
              models={models}
              modelsLoading={modelsLoading}
              modelsError={modelsError}
              experts={experts}
              defaultExpertId={defaultExpertId}
              busy={busy}
              onModelChange={(modelKey) => void handleModelChange(modelKey)}
              onExpertChange={(expertId) => void handleExpertChange(expertId)}
              onChangeInstance={() => void handleChangeInstance()}
              onLogout={() => void handleLogout()}
            />
          </>
        ) : (
          <SettingsInstanceSetup
            variant={variant}
            baseUrl={baseUrl}
            username={username}
            password={password}
            busy={busy}
            pingBusy={pingBusy}
            pingOk={pingOk}
            pingBindings={pingBindings}
            pingService={pingService}
            pingHint={pingHint}
            error={error}
            success={success}
            onBaseUrlChange={handleBaseUrlChange}
            onUsernameChange={handleUsernameChange}
            onPasswordChange={setPassword}
            onTestConnection={() => void handleTestConnection()}
            onFormSubmit={handleFormSubmit}
          />
        )}

        <footer className="settings-brand-footer">
          <span>OpenTranslator</span>
          <span className="settings-brand-dot" aria-hidden>·</span>
          <span>自托管翻译扩展</span>
        </footer>

        {isDev && (
          <details className="settings-dev-details">
            <summary>开发者信息</summary>
            <p className="settings-footer">
              扩展 ID（固定）：<code>gjmakoddcjjkfidekkkcmadihemhegfk</code>
              <br />
              若出现 CORS 错误，管理员需在 Worker ORIGINS 中加入
              chrome-extension://gjmakoddcjjkfidekkkcmadihemhegfk（详见 docs/ORIGINS.md）
            </p>
          </details>
        )}
      </div>
    </main>
  );
}
