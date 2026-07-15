import type { TranslateModelOption } from "@/types";

export type ModelKey = string;

export function encodeModelKey(option: TranslateModelOption): ModelKey {
  return `${option.providerId}|${option.model}`;
}

export function decodeModelKey(key: ModelKey): { providerId: string; model: string } {
  const sep = key.indexOf("|");
  if (sep === -1) throw new Error("invalid model key");
  return { providerId: key.slice(0, sep), model: key.slice(sep + 1) };
}

export function modelOptionLabel(option: TranslateModelOption): string {
  return `${option.providerName} · ${option.modelLabel}`;
}
