import type { AiExpertMeta } from "@/types";

export const GENERAL_EXPERT_ID = "general";

export function expertLabel(expert: AiExpertMeta | undefined): string {
  if (!expert) return "";
  return expert.i18n?.["zh-CN"]?.name ?? expert.name;
}

/** Map stored expert id to API request body (omit for built-in general prompt). */
export function resolveExpertId(stored: string | null | undefined): string | undefined {
  if (!stored || stored === GENERAL_EXPERT_ID) return undefined;
  return stored;
}

export function isModelAvailabilityError(error: string, status?: number): boolean {
  return (
    status === 404 &&
    /model not available|provider not available/i.test(error)
  );
}
