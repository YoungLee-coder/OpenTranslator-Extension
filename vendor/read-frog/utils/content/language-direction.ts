export function getLanguageDirectionAndLang(langCode: string): {
  dir: "ltr" | "rtl"
  lang: string
} {
  const rtl =
    /^(ar|he|fa|ur|yi|ps|dv)([-_]|$)/i.test(langCode) ||
    langCode.toLowerCase() === "ara" ||
    langCode.toLowerCase() === "heb"
  return {
    dir: rtl ? "rtl" : "ltr",
    lang: langCode,
  }
}

export function isRTL(langCode?: string): boolean {
  if (!langCode) return false
  return getLanguageDirectionAndLang(langCode).dir === "rtl"
}

export function getLanguageDirection(langCode?: string): "ltr" | "rtl" {
  if (!langCode) return "ltr"
  return getLanguageDirectionAndLang(langCode).dir
}
