/**
 * Lightweight spinner only — React/Shadow error UI stripped for OpenTranslator.
 * Based on read-frog createLightweightSpinner / createSpinnerInside.
 */
import type { TranslationTextFormat } from "#rf/types/config/translate"
import { isTranslationCancelledError } from "#rf/utils/request/cancellation"
import { SPINNER_CLASS, TRANSLATION_ERROR_CONTAINER_CLASS } from "../../../constants/dom-labels"
import { getContainingShadowRoot, getOwnerDocument } from "../../dom/node"
import { translateTextForPage } from "../translate-variants"
import { ensurePresetStyles } from "./style-injector"

export const MAX_ANIMATED_SPINNERS = 60

const spinnerAnimations = new WeakMap<HTMLElement, Animation>()
let activeSpinnerAnimationCount = 0

export function cancelSpinnerAnimation(spinner: HTMLElement): void {
  const animation = spinnerAnimations.get(spinner)
  if (animation) {
    spinnerAnimations.delete(spinner)
    activeSpinnerAnimationCount = Math.max(0, activeSpinnerAnimationCount - 1)
    animation.cancel()
    return
  }
  spinner.getAnimations?.().forEach((liveAnimation) => liveAnimation.cancel())
}

export function createLightweightSpinner(ownerDoc: Document): HTMLElement {
  const spinner = ownerDoc.createElement("span")
  spinner.className = SPINNER_CLASS
  spinner.style.cssText = `
    display: inline-block !important;
    width: 6px !important;
    height: 6px !important;
    min-width: 6px !important;
    min-height: 6px !important;
    max-width: 6px !important;
    max-height: 6px !important;
    aspect-ratio: 1 / 1 !important;
    margin: 0 4px !important;
    padding: 0 !important;
    vertical-align: middle !important;
    border: 1.5px solid transparent !important;
    border-top: 1.5px solid var(--read-frog-muted-foreground, #888) !important;
    border-radius: 50% !important;
    box-sizing: content-box !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    align-self: center !important;
  `

  const prefersReducedMotion = ownerDoc.defaultView?.matchMedia
    ? ownerDoc.defaultView.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false
  if (
    !prefersReducedMotion &&
    spinner.animate &&
    activeSpinnerAnimationCount < MAX_ANIMATED_SPINNERS
  ) {
    const animation = spinner.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      { duration: 600, iterations: Infinity, easing: "linear" },
    )
    spinnerAnimations.set(spinner, animation)
    activeSpinnerAnimationCount++
  }

  return spinner
}

export function createSpinnerInside(translatedWrapperNode: HTMLElement): HTMLElement {
  const ownerDoc = getOwnerDocument(translatedWrapperNode)
  const root = getContainingShadowRoot(translatedWrapperNode) ?? ownerDoc
  ensurePresetStyles(root)
  const spinner = createLightweightSpinner(ownerDoc)
  translatedWrapperNode.appendChild(spinner)
  return spinner
}

export async function getTranslatedTextAndRemoveSpinner(
  _nodes: ChildNode[],
  textContent: string,
  spinner: HTMLElement,
  translatedWrapperNode: HTMLElement,
  isCurrent: () => boolean = () => true,
  textFormat: TranslationTextFormat = "plain",
  translateRequest: () => Promise<string> = () => translateTextForPage(textContent, textFormat),
): Promise<string | undefined> {
  let translatedText: string | undefined

  try {
    if (!isCurrent()) return undefined
    translatedText = await translateRequest()
    if (!isCurrent()) return undefined
  } catch (error) {
    if (isTranslationCancelledError(error)) return undefined
    if (!isCurrent()) return undefined

    const err = translatedWrapperNode.ownerDocument.createElement("span")
    err.className = TRANSLATION_ERROR_CONTAINER_CLASS
    err.style.cssText = "color:#b00020;font-size:0.85em;margin-left:4px;"
    err.textContent = error instanceof Error ? error.message : "翻译失败"
    translatedWrapperNode.appendChild(err)
  } finally {
    cancelSpinnerAnimation(spinner)
    spinner.remove()
  }

  return translatedText
}
