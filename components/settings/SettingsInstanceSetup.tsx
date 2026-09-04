import BrandMark from "@/components/BrandMark";
import type { PingResponse } from "@/types";
import SettingsAlerts from "./SettingsAlerts";
import { formatBindings } from "./utils";

type SettingsInstanceSetupProps = {
  variant: "sidepanel" | "page";
  baseUrl: string;
  username: string;
  password: string;
  busy: boolean;
  pingBusy: boolean;
  pingOk: boolean;
  pingBindings: PingResponse["bindings"] | null;
  pingService: string;
  pingHint: string;
  error: string;
  success: string;
  onBaseUrlChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTestConnection: () => void;
  onFormSubmit: (e: React.FormEvent) => void;
};

export default function SettingsInstanceSetup({
  variant,
  baseUrl,
  username,
  password,
  busy,
  pingBusy,
  pingOk,
  pingBindings,
  pingService,
  pingHint,
  error,
  success,
  onBaseUrlChange,
  onUsernameChange,
  onPasswordChange,
  onTestConnection,
  onFormSubmit,
}: SettingsInstanceSetupProps) {
  const isSidepanel = variant === "sidepanel";

  return (
    <form className="settings-setup" onSubmit={onFormSubmit}>
      {isSidepanel && (
        <div className="settings-setup-intro">
          <BrandMark size={28} className="brand-mark text-foreground" />
          <h2 className="settings-setup-title">连接实例</h2>
          <p className="settings-setup-desc">绑定你的自托管 OpenTranslator 服务后即可开始翻译。</p>
        </div>
      )}

      <SettingsAlerts error={error} success={success} />

      <div className="settings-setup-card">
        <div className="settings-setup-step">
          <span className="settings-step-num">1</span>
          <div className="settings-step-body">
            <label htmlFor="baseUrl" className="settings-step-label">
              实例地址
            </label>
            <input
              id="baseUrl"
              name="url"
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="url"
              required
              placeholder="https://translate.example.com"
              value={baseUrl}
              onChange={(e) => onBaseUrlChange(e.target.value)}
              aria-describedby={pingOk || pingBusy ? "ping-status" : undefined}
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
                id="ping-status"
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
            {pingOk && pingHint ? (
              <p className="muted settings-hint settings-ping-hint" role="status">
                {pingHint}
              </p>
            ) : null}
          </div>
        </div>

        <hr className="rule-divider" />

        <div className="settings-setup-step">
          <span className="settings-step-num">2</span>
          <div className="settings-step-body">
            <span className="settings-step-label">账号登录</span>
            <div className="field">
              <label htmlFor="username">用户名</label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                required
                minLength={2}
                maxLength={64}
                value={username}
                onChange={(e) => onUsernameChange(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="password">密码</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn btn-lg"
              disabled={busy}
            >
              {busy ? "提交中…" : "登录并绑定"}
            </button>
            <p className="muted settings-hint">
              填写完成后按 Enter 登录。用户名可用邮箱或任意登录名，会和实例地址一起留在本机；密码不会保存
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}
