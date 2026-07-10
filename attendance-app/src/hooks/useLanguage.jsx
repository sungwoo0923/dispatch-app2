import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DICTIONARY, SUPPORTED_LANGUAGES } from "../i18n/dictionary";

const STORAGE_KEY = "kpwork_lang";
const LanguageContext = createContext(null);

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? String(vars[key]) : `{{${key}}}`));
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_LANGUAGES.some((l) => l.code === saved) ? saved : "ko";
  });

  const setLang = useCallback((code) => {
    setLangState(code);
    localStorage.setItem(STORAGE_KEY, code);
  }, []);

  // 아직 번역되지 않은 화면/문자열은 한국어 원문을 그대로 key로 넘겨도
  // 사전에 없으면 그 문자열 자체가 그대로 표시되므로 안전하게 동작한다.
  const t = useCallback(
    (key, vars) => {
      const dict = DICTIONARY[lang] || DICTIONARY.ko;
      const template = dict[key] ?? DICTIONARY.ko[key] ?? key;
      return interpolate(template, vars);
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t, languages: SUPPORTED_LANGUAGES }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
