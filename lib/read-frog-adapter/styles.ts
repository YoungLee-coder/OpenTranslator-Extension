import type { Config } from "#rf/types/config/config"
import { CONTENT_WRAPPER_CLASS, TRANSLATION_ONLY_ATTRIBUTE } from "#rf/utils/constants/dom-labels"
import { isTranslatedWrapperNode } from "#rf/utils/host/dom/filter"
import { deepQueryAllSelector, deepQueryTopLevelSelector } from "#rf/utils/host/dom/find"
import {
  disposeVirtualParagraphGroup,
  removeTranslatedWrapperWithRestore,
  restoreTranslationOnlySwapsForAnchor,
} from "#rf/utils/host/translate/dom/translation-cleanup"
import {
  getPendingBilingualTranslationStates,
  getPendingVirtualParagraphGroups,
  unregisterBilingualTranslationState,
} from "#rf/utils/host/translate/core/translation-state"
import { getEffectiveSiteRule } from "#rf/utils/site-rules/effective"
import { ensurePresetStyles, ensureSiteRuleCSS } from "#rf/utils/host/translate/ui/style-injector"

/** Force translation nodes to inherit host typography (after preset injection). */
const INHERIT_TYPOGRAPHY_CSS = `
.read-frog-translated-block-content,
.read-frog-translated-inline-content,
.read-frog-translated-content-wrapper[lang],
.read-frog-translated-content-wrapper[lang] * {
  color: inherit !important;
  font-family: inherit !important;
  font-size: inherit !important;
  font-weight: inherit !important;
  font-style: inherit !important;
  font-variant: inherit !important;
  letter-spacing: inherit !important;
  line-height: inherit !important;
  text-align: inherit !important;
  text-decoration: inherit !important;
  text-transform: inherit !important;
  text-shadow: inherit !important;
  -webkit-text-fill-color: inherit !important;
}
`

/** Inject translation preset CSS + Gmail height:auto site rule + typography inherit. */
export async function ensureEngineStyles(config: Config): Promise<void> {
  ensurePresetStyles(document)
  const rule = getEffectiveSiteRule(config, window.location.href)
  const parts = [INHERIT_TYPOGRAPHY_CSS]
  if (rule.injectedCss) parts.push(rule.injectedCss)
  await ensureSiteRuleCSS(document, parts.join("\n"))
}


export function hasEngineTranslations(scope: ParentNode): boolean {
  if (scope instanceof Element || scope instanceof Document || scope instanceof ShadowRoot) {
    return (
      scope.querySelector(`.${CONTENT_WRAPPER_CLASS}`) != null ||
      scope.querySelector(`[${TRANSLATION_ONLY_ATTRIBUTE}]`) != null
    )
  }
  return false
}

/**
 * Scoped clear for one Gmail message body (engine's removeAllTranslatedWrapperNodes
 * is Document/ShadowRoot-only).
 */
export function removeTranslationsInScope(scope: HTMLElement): void {
  const isInside = (source: HTMLElement) => scope.contains(source) || scope === source

  getPendingBilingualTranslationStates()
    .filter((state) => isInside(state.layoutSource))
    .forEach(unregisterBilingualTranslationState)
  getPendingVirtualParagraphGroups()
    .filter((group) => isInside(group.layoutSource))
    .forEach(disposeVirtualParagraphGroup)

  const wrappers = deepQueryTopLevelSelector(scope, isTranslatedWrapperNode)
  wrappers.forEach((wrapper) => removeTranslatedWrapperWithRestore(wrapper))

  const swapAnchors = deepQueryAllSelector(scope, (element) =>
    element.hasAttribute(TRANSLATION_ONLY_ATTRIBUTE),
  )
  swapAnchors.forEach((anchor) => restoreTranslationOnlySwapsForAnchor(anchor))
}
