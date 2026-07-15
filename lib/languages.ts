export interface Language {
  code: string;
  label: string;
}

export const LANGUAGES: Language[] = [
  { code: "auto", label: "自动检测" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文（台灣）" },
  { code: "zh-HK", label: "繁體中文（香港）" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "ru", label: "Русский" },
  { code: "ar", label: "العربية" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "th", label: "ไทย" },
];

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
