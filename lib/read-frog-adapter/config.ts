import type { Config } from "#rf/types/config/config"
import { DEFAULT_TRANSLATION_NODE_STYLE } from "#rf/utils/constants/translation-node-style"

export type BilingualConfigInput = {
  sourceLang: string
  targetLang: string
}

/** Minimal Config shape for Gmail bilingual page translation. */
export function buildBilingualConfig(input: BilingualConfigInput): Config {
  return {
    language: {
      sourceCode: input.sourceLang || "auto",
      targetCode: input.targetLang || "zh",
      level: "intermediate",
    },
    translate: {
      mode: "bilingual",
      translationNodeStyle: {
        preset: DEFAULT_TRANSLATION_NODE_STYLE,
        isCustom: false,
        customCSS: null,
      },
      page: {
        range: "all",
        minCharactersPerNode: 0,
        minWordsPerNode: 0,
        enableTargetLanguageSkip: true,
      },
      node: {
        forceRetranslation: false,
      },
      enableAIContentAware: false,
    },
  }
}
