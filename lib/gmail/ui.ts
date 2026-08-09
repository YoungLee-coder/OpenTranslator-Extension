import type { GmailTranslateMode } from "@/types";
import { OT_BTN_ATTR, OT_HOST_ATTR } from "./dom";

export type ButtonPhase = "idle" | "loading" | "done" | "error" | "stop" | "show-translation";

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="18" height="18" aria-hidden="true">
  <rect width="32" height="32" rx="8" fill="#F5F2EF"/>
  <path fill="#21201C" d="M16 5 C18.8 9.5 18.8 13.4 27 16 C18.8 18.6 18.8 22.5 16 27 C13.2 22.5 13.2 18.6 5 16 C13.2 13.4 13.2 9.5 16 5 Z"/>
  <polygon fill="#F5F2EF" points="25.75 22.25 29.25 25.75 25.75 29.25 22.25 25.75"/>
  <polygon fill="#21201C" points="25.75 23 28.5 25.75 25.75 28.5 23 25.75"/>
</svg>`;

const GMAIL_LAYOUT_STYLE_ID = "ot-gmail-layout-fix";

/**
 * From read-frog site rule for mail.google.com — allow translated rows to grow.
 */
export function ensureGmailLayoutCss(): void {
  if (document.getElementById(GMAIL_LAYOUT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = GMAIL_LAYOUT_STYLE_ID;
  style.textContent =
    "[role='listitem'] > div { height:auto!important; white-space:unset!important; }";
  document.documentElement.appendChild(style);
}

export function createTranslateButton(mode: GmailTranslateMode = "replace"): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ot-gmail-btn";
  btn.setAttribute(OT_BTN_ATTR, "1");
  btn.dataset.otMode = mode;
  btn.innerHTML = `${LOGO_SVG}<span class="ot-gmail-btn-label">翻译</span>`;
  setButtonPhase(btn, "idle", undefined, mode);
  return btn;
}

export function setButtonPhase(
  btn: HTMLButtonElement,
  phase: ButtonPhase,
  detail?: string,
  mode: GmailTranslateMode = (btn.dataset.otMode as GmailTranslateMode) || "replace",
): void {
  btn.dataset.otPhase = phase;
  btn.dataset.otMode = mode;
  btn.classList.toggle(
    "ot-gmail-btn--active",
    phase === "done" || phase === "loading" || phase === "stop" || phase === "show-translation",
  );
  btn.classList.toggle("ot-gmail-btn--error", phase === "error");
  btn.disabled = phase === "loading";

  const label = btn.querySelector(".ot-gmail-btn-label");
  if (!(label instanceof HTMLElement)) return;

  const bilingual = mode === "bilingual";

  switch (phase) {
    case "idle":
      label.textContent = "翻译";
      btn.title = bilingual ? "OpenTranslator 双语对照" : "OpenTranslator 整封翻译";
      btn.setAttribute("aria-label", btn.title);
      break;
    case "loading":
      label.textContent = detail ?? "翻译中";
      btn.title = bilingual ? "正在翻译，点击可停止" : "正在整封翻译，点击可停止";
      btn.setAttribute("aria-label", btn.title);
      btn.disabled = false;
      break;
    case "stop":
      label.textContent = "停止";
      btn.title = "停止翻译";
      btn.setAttribute("aria-label", btn.title);
      btn.disabled = false;
      break;
    case "done":
      if (bilingual) {
        label.textContent = "清除";
        btn.title = "清除对照译文";
      } else {
        label.textContent = "原文";
        btn.title = "显示原文";
      }
      btn.setAttribute("aria-label", btn.title);
      break;
    case "show-translation":
      label.textContent = "译文";
      btn.title = "显示译文";
      btn.setAttribute("aria-label", btn.title);
      break;
    case "error":
      label.textContent = "重试";
      btn.title = detail || "翻译失败，点击重试";
      btn.setAttribute("aria-label", btn.title);
      break;
  }
}

export function mountButton(
  button: HTMLButtonElement,
  toolbar: HTMLElement | null,
  body: HTMLElement,
): HTMLElement {
  if (toolbar) {
    toolbar.appendChild(button);
    return toolbar;
  }

  const existing = body.previousElementSibling;
  if (existing instanceof HTMLElement && existing.hasAttribute(OT_HOST_ATTR)) {
    existing.appendChild(button);
    return existing;
  }

  const host = document.createElement("div");
  host.className = "ot-gmail-host";
  host.setAttribute(OT_HOST_ATTR, "1");
  host.appendChild(button);
  body.parentElement?.insertBefore(host, body);
  return host;
}

export function showToast(message: string, ms = 3200): void {
  document.querySelectorAll(".ot-gmail-toast").forEach((el) => el.remove());
  const toast = document.createElement("div");
  toast.className = "ot-gmail-toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.documentElement.appendChild(toast);
  window.setTimeout(() => toast.remove(), ms);
}

/** Remove injected translate controls (buttons + fallback hosts). */
export function removeTranslateControls(): void {
  document.querySelectorAll(`[${OT_BTN_ATTR}]`).forEach((node) => node.remove());
  document.querySelectorAll(`[${OT_HOST_ATTR}]`).forEach((node) => {
    if (node.childNodes.length === 0) node.remove();
  });
}
