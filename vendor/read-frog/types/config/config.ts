import type {
  PageTranslateRange,
  TranslationMode,
  TranslationNodeStyleConfig,
} from "./translate"
import type { TagSetFamily } from "../../utils/constants/dom-rules"

export type LangCode = string

export type EffectiveSiteRule = {
  excludeSelector: string | null
  includeSelector: string | null
  forceBlockNodeSelector: string | null
  forceBlockStyleSelector: string | null
  forceInlineNodeSelector: string | null
  forceInlineStyleSelector: string | null
  preserveTextSelector: string | null
  minCharacters?: number | null
  minWords?: number | null
  injectedCss?: string | null
  /**
   * OpenTranslator/Gmail: translate each labeled paragraph as one unit (no
   * mid-sentence splits on nested block descendants / virtual paragraphs).
   */
  keepParagraphAtomic?: boolean
  /** Always insert bilingual translation after a line break. */
  forceBlockBilingual?: boolean
} & Partial<Record<TagSetFamily, ReadonlySet<string> | null>>

export type Config = {
  language: {
    sourceCode: LangCode | "auto"
    targetCode: LangCode
    level?: string
  }
  translate: {
    mode: TranslationMode
    translationNodeStyle: TranslationNodeStyleConfig
    page: {
      range: PageTranslateRange
      minCharactersPerNode: number
      minWordsPerNode: number
      enableTargetLanguageSkip: boolean
    }
    node: {
      forceRetranslation: boolean
    }
    enableAIContentAware?: boolean
  }
  siteRulesConfig?: unknown
  providersConfig?: unknown
}

export type InputTranslationLang = LangCode | "sourceCode" | "targetCode"
