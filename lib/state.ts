import type { ExtensionState } from "@/lib/messaging";
import { getAuth, getPrefs, resolveGmailTranslateMode } from "@/lib/storage";

/** Read extension state from local storage only — no network. */
export async function readExtensionState(): Promise<ExtensionState> {
  const auth = await getAuth();
  const prefs = await getPrefs();
  const gmailEnabled = prefs.gmailEnabled !== false;
  const gmailTranslateMode = resolveGmailTranslateMode(prefs.gmailTranslateMode);
  if (!auth) {
    return {
      bound: false,
      sourceLang: prefs.sourceLang,
      targetLang: prefs.targetLang,
      modelKey: prefs.modelKey ?? null,
      expertId: prefs.expertId ?? "general",
      gmailEnabled,
      gmailTranslateMode,
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
    gmailEnabled,
    gmailTranslateMode,
  };
}
