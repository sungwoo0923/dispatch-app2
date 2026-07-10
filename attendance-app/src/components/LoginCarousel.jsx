import { useEffect, useState } from "react";
import { MapPin, Activity, Wallet, FileSignature } from "lucide-react";
import { useLanguage } from "../hooks/useLanguage";

const SLIDE_KEYS = [
  { gradient: "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)", icon: MapPin, titleKey: "loginCarousel.slide1Title", bodyKey: "loginCarousel.slide1Body" },
  { gradient: "linear-gradient(135deg, #1d4ed8 0%, #0f172a 100%)", icon: Activity, titleKey: "loginCarousel.slide2Title", bodyKey: "loginCarousel.slide2Body" },
  { gradient: "linear-gradient(135deg, #0ea5e9 0%, #1e40af 100%)", icon: Wallet, titleKey: "loginCarousel.slide3Title", bodyKey: "loginCarousel.slide3Body" },
  { gradient: "linear-gradient(135deg, #4338ca 0%, #1e3a8a 100%)", icon: FileSignature, titleKey: "loginCarousel.slide4Title", bodyKey: "loginCarousel.slide4Body" },
];

// PC 로그인/회원가입 화면 왼쪽에 쓰는 그라디언트+아이콘 슬라이드 캐러셀.
// 사진 자산 없이 lucide 아이콘과 그라디언트 배경만으로 구성해, 별도
// 이미지 준비 없이도 유지보수가 쉽다.
export default function LoginCarousel() {
  const { t } = useLanguage();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % SLIDE_KEYS.length), 4500);
    return () => clearInterval(timer);
  }, []);

  const slide = SLIDE_KEYS[index];
  const Icon = slide.icon;

  return (
    <div
      className="relative flex h-full w-full flex-col justify-between overflow-hidden p-12 text-white transition-[background] duration-700"
      style={{ background: slide.gradient }}
    >
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

      <div className="relative z-10">
        <div className="inline-flex items-center rounded-2xl bg-white/95 px-4 py-3 shadow-lg shadow-black/10">
          <img src="/logo.png" alt="KP-Work" className="h-14 w-auto" />
        </div>
      </div>

      <div key={index} className="relative z-10 flex flex-1 flex-col items-center justify-center text-center" style={{ animation: "fadeInUp 0.6s ease" }}>
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 backdrop-blur-sm">
          <Icon size={36} />
        </div>
        <h2 className="max-w-xs text-2xl font-bold leading-snug">{t(slide.titleKey)}</h2>
        <p className="mt-3 max-w-xs whitespace-pre-line text-sm text-white/80">{t(slide.bodyKey)}</p>
      </div>

      <div className="relative z-10 flex items-center justify-center gap-2">
        {SLIDE_KEYS.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`slide ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-1.5 bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}
