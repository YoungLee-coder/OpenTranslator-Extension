import type { ExtensionState } from "@/lib/messaging";
import { getAuthAndPrefs } from "@/lib/storage";

/** Read extension state from local storage only — no network. */
export async function readExtensionState(): Promise<ExtensionState> {
  const { auth, prefs } = await getAuthAndPrefs();
  if (!auth) {
    return {
      bound: false,
      sourceLang: prefs.sourceLang,
      targetLang: prefs.targetLang,
      modelKey: prefs.modelKey ?? null,
      expertId: prefs.expertId ?? "general",
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
  };
}
