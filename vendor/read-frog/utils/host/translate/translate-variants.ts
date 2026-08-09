/** OpenTranslator adapter: page translate → extension background port. */
import type { TranslationTextFormat } from "#rf/types/config/translate"

export type TranslatePageOptions = {
  preserveLineBreaks?: boolean
  forceRetranslation?: boolean
}

type TranslateFn = (
  text: string,
  format: TranslationTextFormat,
  options?: TranslatePageOptions,
) => Promise<string>

let impl: TranslateFn | null = null

/** Called once from the Gmail content script before translating. */
export function setTranslateTextForPageImpl(fn: TranslateFn): void {
  impl = fn
}

export async function translateTextForPage(
  text: string,
  textFormat: TranslationTextFormat = "plain",
  options?: TranslatePageOptions,
): Promise<string> {
  if (!impl) {
    throw new Error("translateTextForPage is not configured")
  }
  void textFormat
  void options
  return impl(text, textFormat, options)
}
