import type { Config } from "#rf/types/config/config"
import { prepareTranslationText } from "./text-preparation"

export const MIN_LENGTH_FOR_TARGET_LANG_DETECTION = 50

/** Heuristic skip when text already looks like the target language (no franc/LLM). */
export async function shouldSkipAsTargetLanguage(text: string, config: Config): Promise<boolean> {
  if (!config.translate.page.enableTargetLanguageSkip) return false
  const prepared = prepareTranslationText(text)
  if (prepared.length < MIN_LENGTH_FOR_TARGET_LANG_DETECTION) return false

  const target = String(config.language.targetCode).toLowerCase()
  if (target.startsWith("zh") || target === "cmn" || target === "yue") {
    const han = (prepared.match(/\p{Script=Han}/gu) ?? []).length
    const latin = (prepared.match(/[A-Za-z]/g) ?? []).length
    return han >= 8 && han > latin * 1.5
  }
  if (target.startsWith("ja") || target === "jpn") {
    const cjk = (prepared.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? [])
      .length
    const latin = (prepared.match(/[A-Za-z]/g) ?? []).length
    return cjk >= 8 && cjk > latin * 1.5
  }
  if (target.startsWith("ko") || target === "kor") {
    const hangul = (prepared.match(/\p{Script=Hangul}/gu) ?? []).length
    const latin = (prepared.match(/[A-Za-z]/g) ?? []).length
    return hangul >= 8 && hangul > latin * 1.5
  }
  return false
}
