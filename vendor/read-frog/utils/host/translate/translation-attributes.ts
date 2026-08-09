import type { Config } from "#rf/types/config/config"
import { getLanguageDirectionAndLang } from "#rf/utils/content/language-direction"

export function setTranslationDirAndLang(element: HTMLElement, config: Config): void {
  const { dir, lang } = getLanguageDirectionAndLang(config.language.targetCode)
  element.setAttribute("dir", dir)
  if (lang) element.setAttribute("lang", lang)
}
