import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import SettingsAccountHub from "@/components/settings/SettingsAccountHub";
import SettingsAlerts from "@/components/settings/SettingsAlerts";
import SettingsInstanceSetup from "@/components/settings/SettingsInstanceSetup";
import { useExperts } from "@/hooks/useExperts";
import { useModels } from "@/hooks/useModels";
import { formatApiError } from "@/lib/errors";
import { sendBg } from "@/lib/messaging";
import type { ExtensionState } from "@/lib/messaging";
import { ensureHostPermission } from "@/lib/permissions";
import { getDraftBaseUrl, setDraftBaseUrl } from "@/lib/storage";
import type { PingResponse } from "@/types";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<ExtensionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pingBusy, setPingBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pingOk, setPingOk] = useState(false);
  const [pingBindings, setPingBindings] = useState<PingResponse["bindings"] | null>(null);
  const [pingService, setPingService] = useState("");

  const refresh = useCallback(async () => {
    const res = await sendBg<ExtensionState>({ type: "getState" });
    if (res.ok && res.data) {
      setState(res.data);
      onStateChange?.(res.data);
      if (res.data.baseUrl) {
        setBaseUrl(res.data.baseUrl);
      } else {
        const draft = await getDraftBaseUrl();
        if (draft) setBaseUrl(draft);
      }
    }
    setLoading(false);
    return res.ok ? res.data : null;
  }, [onStateChange]);

  const bound = state?.bound ?? false;
  const {
    models,
    loading: modelsLoading,
    error: modelsError,
  } = useModels({ enabled: bound, userId: state?.user?.id });
  const { experts, defaultExpertId } = useExperts({
    enabled: bound,
    userId: state?.user?.id,
    onPrefsAdjusted: refresh,
  });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const resetPingState = () => {
    setPingOk(false);
    setPingBindings(null);
    setPingService("");
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.key === "Enter" &&
      !bound &&
      !busy &&
      baseUrl.trim() &&
      email &&
      password
    ) {
      e.preventDefault();
      void handleLogin();
    }
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
      setPingOk(true);
      setPingBindings(res.data?.bindings ?? null);
      setPingService(res.data?.service ?? "OpenTranslator");
      await setDraftBaseUrl(baseUrl.trim());
    } finally {
      setPingBusy(false);
    }
  };

  const handleLogin = async () => {
    clearMessages();
    if (!email || !password) {
      setError("请填写邮箱和密码");
      return;
    }
    setBusy(true);
    try {
      const granted = await ensureHostPermission(baseUrl);
      if (!granted) {
        setError("需要授予访问该实例的权限");
        return;
      }
      const res = await sendBg({ type: "login", baseUrl, email, password });
      if (!res.ok) {
        setError(formatApiError(res.error, res.status, res.kind));
        return;
      }
      setPassword("");
      setSuccess("登录成功，已绑定实例");
      await setDraftBaseUrl("");
      await refresh();
      onLoginSuccess?.();
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    clearMessages();
    setBusy(true);
    await sendBg({ type: "logout" });
    setBusy(false);
    resetPingState();
    setSuccess("已退出登录");
    await refresh();
  };

  const handleChangeInstance = async () => {
    clearMessages();
    setBusy(true);
    await sendBg({ type: "logout" });
    setBusy(false);
    resetPingState();
    setBaseUrl("");
    setEmail("");
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

  const handleBaseUrlChange = (value: string) => {
    setBaseUrl(value);
    resetPingState();
    void setDraftBaseUrl(value);
  };

  const rootClass = [
    "settings-view",
    variant === "sidepanel" ? "settings-view-sidepanel" : "settings-view-page",
    "animate-rise",
  ].join(" ");

  if (loading) {
    return (
      <div className={rootClass}>
        <div className="loading-state">
          <span className="spinner" aria-hidden />
          加载中…
        </div>
      </div>
    );
  }

  const isDev = import.meta.env.DEV;
  const isSidepanel = variant === "sidepanel";

  return (
    <div className={rootClass}>
      {isSidepanel && (
        <header className="settings-header-bar">
          {onBack ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm settings-back"
              onClick={onBack}
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
            <BrandMark size={40} className="brand-mark settings-page-mark" />
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
            email={email}
            password={password}
            busy={busy}
            pingBusy={pingBusy}
            pingOk={pingOk}
            pingBindings={pingBindings}
            pingService={pingService}
            error={error}
            success={success}
            onBaseUrlChange={handleBaseUrlChange}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onTestConnection={() => void handleTestConnection()}
            onLogin={() => void handleLogin()}
            onFormKeyDown={handleFormKeyDown}
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
    </div>
  );
}
