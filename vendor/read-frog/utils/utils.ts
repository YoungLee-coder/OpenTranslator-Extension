export function getRandomUUID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `rf-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
