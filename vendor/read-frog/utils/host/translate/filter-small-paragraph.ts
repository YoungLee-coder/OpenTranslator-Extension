import type { Config } from "#rf/types/config/config"
import { getEffectiveSiteRule } from "#rf/utils/site-rules/effective"

const PURE_HANDLE_RE = /^@\S+$/u

function countWords(text: string): number {
  try {
    const segmenter = new Intl.Segmenter("en", { granularity: "word" })
    return [...segmenter.segment(text)].filter((s) => s.isWordLike).length
  } catch {
    return text.trim().split(/\s+/).filter(Boolean).length
  }
}

export async function shouldFilterSmallParagraph(text: string, config: Config): Promise<boolean> {
  if (PURE_HANDLE_RE.test(text.trim())) return true

  const siteRule = getEffectiveSiteRule(config, window.location.href)
  const minCharactersPerNode = siteRule.minCharacters ?? config.translate.page.minCharactersPerNode
  const minWordsPerNode = siteRule.minWords ?? config.translate.page.minWordsPerNode

  if (minCharactersPerNode > 0 && text.length < minCharactersPerNode) return true
  if (minWordsPerNode > 0 && countWords(text) < minWordsPerNode) return true
  return false
}
