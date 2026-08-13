import type { ExtensionState } from "@/lib/messaging";
import { getAuthAndPrefs, resolveEmailTranslateMode } from "@/lib/storage";

/** Read extension state from local storage only — no network. */
export async function readExtensionState(): Promise<ExtensionState> {
  const { auth, prefs } = await getAuthAndPrefs();
  const emailEnabled = prefs.emailEnabled !== false;
  const emailTranslateMode = resolveEmailTranslateMode(prefs.emailTranslateMode);
  if (!auth) {
    return {
      bound: false,
      sourceLang: prefs.sourceLang,
      targetLang: prefs.targetLang,
      modelKey: prefs.modelKey ?? null,
      expertId: prefs.expertId ?? "general",
      emailEnabled,
      emailTranslateMode,
    };
  }
  return {
    bound: true,
    baseUrl: auth.baseUrl,
    user: auth.user,
    sourceLang: prefs.sourceLang,
    targetLang: prefs.targetLang,
    modelKey: prefs.modelKey ?? null,
    expertId: prefs.expertId ?? "general",
    emailEnabled,
    emailTranslateMode,
  };
}
