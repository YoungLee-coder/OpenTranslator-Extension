export type PageTranslateRange = "all" | "main" | "selection"

export type TranslationMode = "bilingual" | "translationOnly"

export type TranslationTextFormat = "plain" | "html"

export type TranslationNodeStyleConfig = {
  preset: string
  isCustom?: boolean
  customCSS?: string | null
  customCSSEnabled?: boolean
}

export type TranslateProviderConfig = {
  provider: string
  id: string
  baseURL?: string
}
