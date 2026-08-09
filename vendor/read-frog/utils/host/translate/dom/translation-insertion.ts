import type { Config } from "#rf/types/config/config"
import type { TranslationNodeStyleConfig } from "#rf/types/config/translate"
import type { TransNode } from "#rf/types/dom"
import { getEffectiveSiteRule } from "#rf/utils/site-rules/effective"
import {
  BLOCK_CONTENT_CLASS,
  CONTENT_WRAPPER_CLASS,
  FLOAT_WRAP_ATTRIBUTE,
  INLINE_CONTENT_CLASS,
  NOTRANSLATE_CLASS,
} from "../../../constants/dom-labels"
import {
  isHTMLElement,
  isNaturalBlockTransNode,
  isNaturalInlineTransNode,
  isTextNode,
} from "../../dom/filter"
import { unwrapDeepestOnlyHTMLChild } from "../../dom/find"
import { getOwnerDocument } from "../../dom/node"
import { decorateTranslationNode } from "../ui/decorate-translation"
import { isForceInlineTranslation, isShortInlineTranslationText } from "../ui/translation-utils"

interface TranslationInsertionContext {
  layoutSource: TransNode
  /** Nodes whose source text is represented by this wrapper. */
  styleSources?: readonly TransNode[]
  sourceText: string
  isCurrent?: () => boolean
  // Fired synchronously right after the translated node is appended, BEFORE
  // the decorate await. This is the only sound point to snapshot the wrapper's
  // expected content (#1918): earlier and the isCurrent() entry guard would
  // see a mismatch and self-destruct the translation; later (after the await)
  // and a site rewrite landing in the await window would be canonized as the
  // expected content. Not fired on the no-append early return, so stray empty
  // wrappers never enter tamper surveillance.
  onContentInserted?: (wrapper: HTMLElement) => void
}

function sourceRunMatchesSelector(sources: readonly TransNode[], selector: string | null): boolean {
  if (selector === null) return false

  return sources.some((source) => {
    const element = isHTMLElement(source) ? source : source.parentElement
    return element?.matches(selector) ?? false
  })
}

function isTransparentColor(color: string): boolean {
  const value = color.trim().toLowerCase()
  if (!value || value === "transparent") return true
  const match = value.match(/^rgba?\((.+)\)$/)
  if (!match?.[1]) return false
  const parts = match[1].split(",").map((part) => part.trim())
  if (parts.length === 4) {
    const alpha = Number.parseFloat(parts[3]!)
    return Number.isFinite(alpha) && alpha === 0
  }
  return false
}

/**
 * Prefer a style exemplar that covers (nearly) the whole source run.
 * Sampling the first text node's parent picks Gmail's partial yellow/bold
 * spans and wrongly paints the whole translation.
 */
function resolveTypographySource(
  layoutSource: TransNode,
  styleSources: readonly TransNode[] | undefined,
  config: Config,
): HTMLElement | null {
  if (isHTMLElement(layoutSource)) {
    const unwrapped = unwrapDeepestOnlyHTMLChild(layoutSource, config)
    const layoutText = (layoutSource.textContent ?? "").replace(/\s+/g, "")
    const unwrappedText = (unwrapped.textContent ?? "").replace(/\s+/g, "")
    if (
      unwrapped !== layoutSource &&
      layoutText.length > 0 &&
      unwrappedText.length >= layoutText.length * 0.9
    ) {
      return unwrapped
    }
    return layoutSource
  }

  if (isTextNode(layoutSource) && layoutSource.parentElement) {
    return layoutSource.parentElement
  }

  for (const source of styleSources ?? []) {
    if (isHTMLElement(source)) return source
    if (isTextNode(source) && source.parentElement) return source.parentElement
  }

  return null
}

const TYPOGRAPHY_STYLE_PROPS = [
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "font-stretch",
  "letter-spacing",
  "word-spacing",
  "line-height",
  "text-align",
  "text-transform",
  "text-shadow",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-color",
  "text-decoration-thickness",
  "-webkit-text-fill-color",
] as const

/** Copy computed styles from a paragraph-level exemplar (no ancestor background climb). */
function applyTypographyFromSource(target: HTMLElement, source: HTMLElement): void {
  const style = window.getComputedStyle(source)
  for (const prop of TYPOGRAPHY_STYLE_PROPS) {
    const value = style.getPropertyValue(prop)
    if (value) target.style.setProperty(prop, value, "important")
  }

  // Only keep background when the exemplar itself is highlighted — do not climb
  // into nested partial highlight spans inside mixed Gmail paragraphs.
  const background = style.backgroundColor
  if (!isTransparentColor(background)) {
    target.style.setProperty("background-color", background, "important")
  }
}

function resolveLineHeight(style: CSSStyleDeclaration): number | null {
  const lineHeight = Number.parseFloat(style.lineHeight)
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight

  // `line-height: normal` is a keyword, not a length; approximate from the font.
  const fontSize = Number.parseFloat(style.fontSize)
  if (Number.isFinite(fontSize) && fontSize > 0) return fontSize * 1.5

  return null
}

/** Bottom of everything that precedes the wrapper inside its parent. */
function measureContentBottomBeforeWrapper(wrapper: HTMLElement): number | null {
  const host = wrapper.parentElement
  if (!host) return null

  const range = getOwnerDocument(host).createRange()
  range.setStart(host, 0)
  range.setEndBefore(wrapper)
  const rect = range.getBoundingClientRect()
  // Nothing precedes the wrapper (or the host is not laid out): all-zero rect.
  if (rect.width <= 0 && rect.height <= 0) return null

  return rect.bottom
}

/**
 * A block translation renders as `inline-block` (translation-node-preset.css) so
 * its decoration hugs the text. That makes it an atomic inline: when a float
 * leaves the line too narrow, the browser drops the entire box below the float
 * rather than wrapping the text beside it. Against a tall float — a Wikipedia
 * infobox easily runs a few thousand pixels — the translation is stranded that
 * far below the paragraph it belongs to, leaving a huge blank gap.
 *
 * Detect the drop by measuring where the translation actually landed instead of
 * hunting for the float in the DOM. The float is frequently nowhere near the
 * paragraph in the tree: on ja.wikipedia the infobox floats out of a sibling of
 * an ancestor `<section>`, so a scan of the paragraph's own siblings never sees
 * it. Layout truth is structure-agnostic and costs two rect reads.
 */
function isDisplacedBelowFloat(translatedNode: HTMLElement): boolean {
  const wrapper = translatedNode.parentElement
  if (!wrapper) return false

  const contentBottom = measureContentBottomBeforeWrapper(wrapper)
  if (contentBottom === null) return false

  const translatedRect = translatedNode.getBoundingClientRect()
  if (translatedRect.height <= 0) return false

  const style = window.getComputedStyle(translatedNode)
  const lineHeight = resolveLineHeight(style)
  // Without font metrics there is no scale to judge the gap against, and a zero
  // threshold would flag every ordinary translation. Leave the layout alone.
  if (lineHeight === null) return false
  const marginTop = Number.parseFloat(style.marginTop) || 0

  // Undisplaced, the translation opens the line right after the source text, so
  // the gap is just its top margin plus line leading. Allowing a whole extra
  // line keeps normal spacing well clear of the threshold while any real float
  // drop — at minimum the float's remaining height — stays far above it.
  return translatedRect.top - contentBottom > marginTop + lineHeight
}

export function addInlineTranslation(
  ownerDoc: Document,
  translatedWrapperNode: HTMLElement,
  translatedNode: HTMLElement,
): void {
  const spaceNode = ownerDoc.createElement("span")
  spaceNode.textContent = "\u00A0\u00A0"
  translatedWrapperNode.appendChild(spaceNode)
  translatedNode.className = `${NOTRANSLATE_CLASS} ${INLINE_CONTENT_CLASS}`
}

export function addBlockTranslation(
  ownerDoc: Document,
  translatedWrapperNode: HTMLElement,
  translatedNode: HTMLElement,
): void {
  const brNode = ownerDoc.createElement("br")
  translatedWrapperNode.appendChild(brNode)
  translatedNode.className = `${NOTRANSLATE_CLASS} ${BLOCK_CONTENT_CLASS}`
}

export async function insertTranslatedNodeIntoWrapper(
  translatedWrapperNode: HTMLElement,
  {
    layoutSource,
    styleSources,
    sourceText,
    isCurrent,
    onContentInserted,
  }: TranslationInsertionContext,
  translatedText: string,
  translationNodeStyle: TranslationNodeStyleConfig,
  config: Config,
  forceBlockTranslation: boolean = false,
): Promise<void> {
  if (isCurrent && !isCurrent()) return

  // Use the wrapper's owner document
  const ownerDoc = getOwnerDocument(translatedWrapperNode)
  const translatedNode = ownerDoc.createElement("span")
  const layoutSourceDisplay = isHTMLElement(layoutSource)
    ? window.getComputedStyle(layoutSource).display
    : undefined
  const { forceBlockStyleSelector, forceInlineStyleSelector, forceBlockBilingual } =
    getEffectiveSiteRule(config, window.location.href)
  const wrapperStyleSources = styleSources ?? [layoutSource]
  const siteRuleForceBlockStyle =
    forceBlockBilingual === true ||
    sourceRunMatchesSelector(wrapperStyleSources, forceBlockStyleSelector)
  const siteRuleForceInlineStyle = sourceRunMatchesSelector(
    wrapperStyleSources,
    forceInlineStyleSelector,
  )
  const forceInlineTranslation = isForceInlineTranslation(layoutSource, layoutSourceDisplay, config)
  const shortInlineTranslation =
    isShortInlineTranslationText(sourceText) && layoutSourceDisplay !== "contents"

  // Site style overrides are the explicit outer priority. Existing layout
  // heuristics and the pre-Node-override classification remain fallbacks
  // within that boundary, so Node-only rules cannot change wrapper styling.
  if (siteRuleForceBlockStyle) {
    addBlockTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  } else if (siteRuleForceInlineStyle) {
    addInlineTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  } else if (forceInlineTranslation) {
    addInlineTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  } else if (forceBlockTranslation) {
    addBlockTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  } else if (shortInlineTranslation) {
    addInlineTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  } else if (isNaturalInlineTransNode(layoutSource)) {
    addInlineTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  } else if (isNaturalBlockTransNode(layoutSource)) {
    addBlockTranslation(ownerDoc, translatedWrapperNode, translatedNode)
  } else {
    // not inline or block, maybe notranslate
    return
  }

  translatedNode.textContent = translatedText
  const typographySource = resolveTypographySource(layoutSource, styleSources, config)
  if (typographySource) {
    applyTypographyFromSource(translatedNode, typographySource)
  }
  translatedWrapperNode.appendChild(translatedNode)
  // Synchronous, pre-await: see TranslationInsertionContext.onContentInserted.
  onContentInserted?.(translatedWrapperNode)
  await decorateTranslationNode(translatedNode, translationNodeStyle)

  if (isCurrent && !isCurrent()) return

  if (
    translatedNode.classList.contains(BLOCK_CONTENT_CLASS) &&
    isDisplacedBelowFloat(translatedNode)
  ) {
    translatedNode.setAttribute(FLOAT_WRAP_ATTRIBUTE, "true")
  }
}
