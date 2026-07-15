import BrandMark from "@/components/BrandMark";
import type { PingResponse } from "@/types";
import SettingsAlerts from "./SettingsAlerts";
import { formatBindings } from "./utils";

type SettingsInstanceSetupProps = {
  variant: "sidepanel" | "page";
  baseUrl: string;
  email: string;
  password: string;
  busy: boolean;
  pingBusy: boolean;
  pingOk: boolean;
  pingBindings: PingResponse["bindings"] | null;
  pingService: string;
  error: string;
  success: string;
  onBaseUrlChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTestConnection: () => void;
  onLogin: () => void;
  onFormKeyDown: (e: React.KeyboardEvent) => void;
};

export default function SettingsInstanceSetup({
  variant,
  baseUrl,
  email,
  password,
  busy,
  pingBusy,
  pingOk,
  pingBindings,
  pingService,
  error,
  success,
  onBaseUrlChange,
  onEmailChange,
  onPasswordChange,
  onTestConnection,
  onLogin,
  onFormKeyDown,
}: SettingsInstanceSetupProps) {
  const isSidepanel = variant === "sidepanel";

  return (
    <section className="settings-setup" onKeyDown={onFormKeyDown}>
      {isSidepanel && (
        <div className="settings-setup-intro">
          <BrandMark size={28} className="brand-mark" />
          <h2 className="settings-setup-title">连接实例</h2>
          <p className="settings-setup-desc">绑定你的自托管 OpenTranslator 服务后即可开始翻译。</p>
        </div>
      )}

      <SettingsAlerts error={error} success={success} />

      <div className="settings-setup-card">
        <div className="settings-setup-step">
          <span className="settings-step-num">1</span>
          <div className="settings-step-body">
            <span className="settings-step-label">实例地址</span>
            <input
              id="baseUrl"
              type="url"
              placeholder="https://translate.example.com"
              value={baseUrl}
              onChange={(e) => onBaseUrlChange(e.target.value)}
            />
            <div className="settings-step-actions">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={onTestConnection}
                disabled={pingBusy || !baseUrl.trim()}
              >
                {pingBusy ? (
                  <>
                    <span className="spinner settings-inline-spinner" aria-hidden />
                    测试中…
                  </>
                ) : (
                  "测试连接"
                )}
              </button>
              <span
                className={[
                  "settings-ping-status",
                  pingBusy ? "is-busy" : pingOk ? "is-ok" : "is-idle",
                ].join(" ")}
                aria-live="polite"
              >
                {pingBusy ? (
                  "正在检测连接…"
                ) : pingOk ? (
                  <>
                    连接正常
                    {pingService ? `：${pingService}` : ""}
                    {pingBindings ? ` · ${formatBindings(pingBindings)}` : ""}
                  </>
                ) : (
                  "\u00a0"
                )}
              </span>
            </div>
          </div>
        </div>

        <hr className="rule-divider" />

        <div className="settings-setup-step">
          <span className="settings-step-num">2</span>
          <div className="settings-step-body">
            <span className="settings-step-label">账号登录</span>
            <div className="field">
              <label htmlFor="email">邮箱</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="password">密码</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-lg"
              onClick={onLogin}
              disabled={busy || !baseUrl.trim()}
            >
              {busy && email ? "提交中…" : "登录并绑定"}
            </button>
            <p className="muted settings-hint">按 Enter 可快速登录</p>
          </div>
        </div>
      </div>
    </section>
  );
}
