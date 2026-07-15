import {
  ArrowRight,
  Cpu,
  ExternalLink,
  Languages,
  LogOut,
  Server,
  Sparkles,
} from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import { expertLabel, GENERAL_EXPERT_ID } from "@/lib/experts";
import { languageLabel } from "@/lib/languages";
import { encodeModelKey, modelOptionLabel } from "@/lib/models";
import type { ExtensionState } from "@/lib/messaging";
import type { AiExpertMeta, TranslateModelOption } from "@/types";
import { formatInstanceHost } from "./utils";

type SettingsAccountHubProps = {
  state: ExtensionState;
  baseUrl: string;
  models: TranslateModelOption[];
  modelsLoading: boolean;
  modelsError: string;
  experts: AiExpertMeta[];
  defaultExpertId: string;
  busy: boolean;
  onModelChange: (modelKey: string) => void;
  onExpertChange: (expertId: string) => void;
  onChangeInstance: () => void;
  onLogout: () => void;
};

export default function SettingsAccountHub({
  state,
  baseUrl,
  models,
  modelsLoading,
  modelsError,
  experts,
  defaultExpertId,
  busy,
  onModelChange,
  onExpertChange,
  onChangeInstance,
  onLogout,
}: SettingsAccountHubProps) {
  const showExperts = experts.length > 0;

  return (
    <section className="settings-hub" aria-label="账户与实例">
      <div className="settings-profile">
        <UserAvatar user={state.user!} baseUrl={baseUrl} />
        <div className="settings-profile-meta">
          <span className="settings-profile-email" title={state.user!.email}>
            {state.user!.email}
          </span>
          <span className="settings-profile-badge">
            <span className="status-dot" aria-hidden />
            已连接
          </span>
        </div>
      </div>

      <dl className="settings-rows">
        <div className="settings-row">
          <dt className="settings-row-label">
            <Server size={14} strokeWidth={1.75} aria-hidden />
            实例
          </dt>
          <dd className="settings-row-value">
            <a
              className="settings-row-link"
              href={baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={baseUrl}
            >
              <span className="settings-row-link-text">{formatInstanceHost(baseUrl)}</span>
              <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
            </a>
          </dd>
        </div>
        <div className="settings-row">
          <dt className="settings-row-label">
            <Cpu size={14} strokeWidth={1.75} aria-hidden />
            翻译模型
          </dt>
          <dd className="settings-row-value settings-row-model">
            {modelsLoading ? (
              <span className="muted">加载中…</span>
            ) : models.length === 0 ? (
              <span className="muted" title={modelsError || undefined}>
                暂无可用模型
              </span>
            ) : (
              <select
                className="settings-model-select"
                value={state.modelKey ?? ""}
                onChange={(e) => onModelChange(e.target.value)}
                disabled={busy}
                aria-label="翻译模型"
              >
                <option value="">默认</option>
                {models.map((option) => {
                  const key = encodeModelKey(option);
                  return (
                    <option key={key} value={key}>
                      {modelOptionLabel(option)}
                    </option>
                  );
                })}
              </select>
            )}
          </dd>
        </div>
        {showExperts && (
          <div className="settings-row">
            <dt className="settings-row-label">
              <Sparkles size={14} strokeWidth={1.75} aria-hidden />
              AI 专家
            </dt>
            <dd className="settings-row-value settings-row-model">
              <select
                className="settings-model-select"
                value={state.expertId ?? GENERAL_EXPERT_ID}
                onChange={(e) => onExpertChange(e.target.value)}
                disabled={busy}
                aria-label="AI 专家"
              >
                <option value={GENERAL_EXPERT_ID}>通用</option>
                {experts.map((expert) => (
                  <option key={expert.id} value={expert.id}>
                    {expertLabel(expert)}
                    {expert.id === defaultExpertId ? "（默认）" : ""}
                  </option>
                ))}
              </select>
            </dd>
          </div>
        )}
        <div className="settings-row">
          <dt className="settings-row-label">
            <Languages size={14} strokeWidth={1.75} aria-hidden />
            默认语言
          </dt>
          <dd className="settings-row-value settings-row-langs">
            <span>{languageLabel(state.sourceLang)}</span>
            <ArrowRight size={12} strokeWidth={1.75} aria-hidden />
            <span>{languageLabel(state.targetLang)}</span>
          </dd>
        </div>
      </dl>

      <div className="settings-hub-actions">
        <button
          type="button"
          className="btn btn-outline btn-lg"
          onClick={onChangeInstance}
          disabled={busy}
        >
          更换实例
        </button>
        <button
          type="button"
          className="btn btn-ghost settings-logout"
          onClick={onLogout}
          disabled={busy}
        >
          <LogOut size={14} strokeWidth={1.75} />
          退出登录
        </button>
      </div>
    </section>
  );
}
