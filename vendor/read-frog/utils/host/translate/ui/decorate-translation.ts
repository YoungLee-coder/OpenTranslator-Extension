import type { TranslationNodeStyleConfig } from "#rf/types/config/translate"
import { CUSTOM_TRANSLATION_NODE_ATTRIBUTE } from "#rf/utils/constants/translation-node-style"
import { TRANSLATION_NODE_STYLE } from "#rf/utils/constants/translation-node-style"
import { getContainingShadowRoot } from "../../dom/node"
import { ensureCustomCSS, ensurePresetStyles } from "./style-injector"

const DATASET_KEY = "readFrogCustomTranslationStyle"

function isKnownPreset(preset: string): boolean {
  return (TRANSLATION_NODE_STYLE as readonly string[]).includes(preset)
}

export async function decorateTranslationNode(
  translatedNode: HTMLElement,
  styleConfig: TranslationNodeStyleConfig,
): Promise<void> {
  if (!isKnownPreset(styleConfig.preset)) return

  const root = getContainingShadowRoot(translatedNode) ?? document

  if (styleConfig.isCustom && styleConfig.customCSS) {
    translatedNode.dataset[DATASET_KEY] = "custom"
    translatedNode.setAttribute(`data-${CUSTOM_TRANSLATION_NODE_ATTRIBUTE}`, "custom")
    await ensureCustomCSS(root, styleConfig.customCSS)
    return
  }

  translatedNode.dataset[DATASET_KEY] = styleConfig.preset
  translatedNode.setAttribute(`data-${CUSTOM_TRANSLATION_NODE_ATTRIBUTE}`, styleConfig.preset)
  ensurePresetStyles(root)
}
