import { Globe } from "lucide-react";
import { useLanguage } from "../hooks/useLanguage";

// 로그인 전에도 언어를 고를 수 있게 로그인/회원가입 화면 상단에 두는 작은
// 셀렉터. useLanguage의 선택값은 localStorage에 저장되므로, 여기서 고른
// 언어가 로그인 후 모바일 앱 전체에도 그대로 이어진다.
export default function LanguagePicker({ className = "" }) {
  const { lang, setLang, languages } = useLanguage();
  return (
    <label className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-muted ${className}`}>
      <Globe size={13} className="text-primary" />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        className="bg-transparent text-xs font-medium text-ink outline-none"
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
