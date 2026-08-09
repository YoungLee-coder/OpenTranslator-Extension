import { translateOne } from "@/lib/gmail/client"
import { setTranslateTextForPageImpl } from "#rf/utils/host/translate/translate-variants"

let activeSignal: AbortSignal | null = null
let langs = { sourceLang: "auto", targetLang: "zh" }

/** Serialize page translate calls — parallel ports race and often disconnect. */
let translateQueue: Promise<unknown> = Promise.resolve()

function enqueueTranslate<T>(task: () => Promise<T>): Promise<T> {
  const run = translateQueue.then(task, task)
  translateQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export function setTranslateSession(
  sourceLang: string,
  targetLang: string,
  signal: AbortSignal | null,
): void {
  langs = { sourceLang, targetLang }
  activeSignal = signal
}

/** Wire engine translateTextForPage → background translate port. */
export function registerTranslateTextForPage(): void {
  setTranslateTextForPageImpl(async (text) =>
    enqueueTranslate(async () => {
      const signal = activeSignal
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError")
      }
      const controller = new AbortController()
      const onAbort = () => controller.abort()
      signal?.addEventListener("abort", onAbort)

      try {
        const result = await translateOne(
          text,
          langs.sourceLang,
          langs.targetLang,
          controller.signal,
        )
        if (!result.ok) {
          if (result.error === "已取消") {
            throw new DOMException("Aborted", "AbortError")
          }
          throw new Error(result.error)
        }
        return result.text
      } finally {
        signal?.removeEventListener("abort", onAbort)
      }
    }),
  )
}
