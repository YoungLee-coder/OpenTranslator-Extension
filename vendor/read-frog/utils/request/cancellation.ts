export class TranslationCancelledError extends Error {
  constructor(message = "translation cancelled") {
    super(message)
    this.name = "TranslationCancelledError"
  }
}

export function isTranslationCancelledError(error: unknown): boolean {
  return error instanceof TranslationCancelledError ||
    (error instanceof Error && error.name === "TranslationCancelledError")
}

export function isTranslationRequestCancelled(_id: string): boolean {
  return false
}

export function markTranslationRequestCancelled(_id: string): void {}

export function clearTranslationRequestCancelled(_id: string): void {}
