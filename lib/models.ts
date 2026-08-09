import type { TranslateModelOption } from "@/types";

export type ModelKey = string;

export type ResolvedModelRef = { providerId: string; model: string };

export function encodeModelKey(option: TranslateModelOption): ModelKey {
  return `${option.providerId}|${option.model}`;
}

export function decodeModelKey(key: ModelKey): ResolvedModelRef {
  const sep = key.indexOf("|");
  if (sep === -1) throw new Error("invalid model key");
  return { providerId: key.slice(0, sep), model: key.slice(sep + 1) };
}

export function modelOptionLabel(option: TranslateModelOption): string {
  return `${option.providerName} · ${option.modelLabel}`;
}

/** DeepL cannot translate email HTML; Email 翻译 must use an LLM provider. */
export function isEmailCapableModel(option: TranslateModelOption): boolean {
  return option.providerType !== "deepl";
}

function matchesModel(option: TranslateModelOption, ref: ResolvedModelRef): boolean {
  return option.providerId === ref.providerId && option.model === ref.model;
}

/**
 * Pick a non-DeepL model for `/api/translate/email`.
 * Prefers the user's selection when capable; otherwise default, then first LLM.
 */
export function resolveEmailTranslateModel(
  models: TranslateModelOption[],
  defaultModel: ResolvedModelRef | null,
  preferred?: ResolvedModelRef,
): ResolvedModelRef | null {
  const emailModels = models.filter(isEmailCapableModel);
  if (emailModels.length === 0) return null;

  if (preferred) {
    const match = emailModels.find((m) => matchesModel(m, preferred));
    if (match) return { providerId: match.providerId, model: match.model };
  }

  if (defaultModel) {
    const match = emailModels.find((m) => matchesModel(m, defaultModel));
    if (match) return { providerId: match.providerId, model: match.model };
  }

  const first = emailModels[0]!;
  return { providerId: first.providerId, model: first.model };
}
