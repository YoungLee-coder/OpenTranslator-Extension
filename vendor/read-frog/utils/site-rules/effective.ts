import type { Config, EffectiveSiteRule } from "#rf/types/config/config"

const GMAIL_INJECTED_CSS =
  "[role='listitem'] > div { height:auto!important;white-space:unset!important; }"

const EMPTY_RULE: EffectiveSiteRule = {
  excludeSelector: null,
  includeSelector: null,
  forceBlockNodeSelector: null,
  forceBlockStyleSelector: null,
  forceInlineNodeSelector: null,
  forceInlineStyleSelector: null,
  preserveTextSelector: null,
  minCharacters: null,
  minWords: null,
  injectedCss: null,
  keepParagraphAtomic: false,
  forceBlockBilingual: false,
}

export function getEffectiveSiteRule(_config: Config | undefined, href: string): EffectiveSiteRule {
  try {
    const host = new URL(href).hostname
    if (host === "mail.google.com" || host.endsWith(".mail.google.com")) {
      return {
        ...EMPTY_RULE,
        // One translation per paragraph, always on the next line. Nested
        // highlight/Word blocks must not open mid-sentence bilingual inserts.
        keepParagraphAtomic: true,
        forceBlockBilingual: true,
        injectedCss: GMAIL_INJECTED_CSS,
      }
    }
  } catch {
    // ignore
  }
  return { ...EMPTY_RULE }
}
