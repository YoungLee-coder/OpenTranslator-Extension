export function removeReactShadowHost(host: Element | null | undefined): void {
  host?.remove()
}

export function createReactShadowHost(): HTMLElement {
  const el = document.createElement("span")
  el.style.display = "none"
  return el
}
