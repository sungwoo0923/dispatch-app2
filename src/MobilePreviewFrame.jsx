// ======================= src/MobilePreviewFrame.jsx =======================
// 📱 모바일 화면 미리보기 — 지금 이 창에 로그인한 계정으로 모바일 화면(/app?kpmpv=1)을 iframe 으로 연다
//  · 2026-11-06 처음엔 관리자메뉴 오른쪽 작은 칸 → 🛠 2026-11-14 관리센터 › 운영 › 모바일 화면 에서만, 크게(기기 크기 · 확대 고르기)
//  · iframe 은 부모 창 계정만 받아 쓴다(firebase.js IS_MOBILE_PREVIEW) — 다른 계정 화면이 섞이지 않게
import React from "react";
import { auth } from "./firebase";
import { isPreviewMode } from "./fsTenant";

export const PREVIEW_DEVICES = [
  { key: "iphone", label: "아이폰 15 · 16", w: 393, h: 852 },
  { key: "iphoneMax", label: "아이폰 Pro Max", w: 430, h: 932 },
  { key: "galaxy", label: "갤럭시 S", w: 384, h: 832 },
  { key: "small", label: "작은 휴대폰", w: 360, h: 740 },
];

export default function MobilePreviewFrame({ device = "iphone", zoom = 1, reloadKey = 0 }) {
  const uid = auth.currentUser?.uid || "anon";
  const [loaded, setLoaded] = React.useState(false);
  const d = PREVIEW_DEVICES.find((x) => x.key === device) || PREVIEW_DEVICES[0];
  const src = React.useMemo(() => {
    if (isPreviewMode()) { const q = new URLSearchParams(window.location.search); q.set("kpmpv", "1"); return `/preview?${q.toString()}`; }
    return `/app?kpmpv=1&u=${encodeURIComponent(uid.slice(0, 8))}`;
  }, [uid]);
  React.useEffect(() => { setLoaded(false); }, [src, reloadKey]);
  // 기기 테두리(둥근 휴대폰 모양) 안에 실제 크기로 열고, 확대는 바깥에서 비율만 키운다(글씨 · 배치는 그 기기 그대로)
  return (
    <div style={{ width: (d.w + 24) * zoom, height: (d.h + 24) * zoom }} className="shrink-0" data-mobile-preview>
      <div style={{ width: d.w + 24, height: d.h + 24, transform: `scale(${zoom})`, transformOrigin: "top left" }}
        className="relative rounded-[46px] bg-[#0B1428] p-3 shadow-[0_30px_70px_rgba(11,20,40,0.35)] ring-1 ring-black/40">
        <div className="relative w-full h-full rounded-[36px] overflow-hidden bg-[#0F1A30]">
          <iframe key={`${src}|${reloadKey}`} src={src} title="mobile-preview" onLoad={() => setLoaded(true)} style={{ width: d.w, height: d.h }} className="border-0 block bg-[#0F1A30]" />
          {!loaded && <div className="absolute inset-0 flex items-center justify-center text-[#CFE0FF] text-[14px] font-bold">모바일 화면을 여는 중…</div>}
        </div>
      </div>
    </div>
  );
}

// 관리센터 › 운영 › 모바일 화면
export function MobilePreviewPanel() {
  const [device, setDevice] = React.useState(() => { try { return localStorage.getItem("kpMpvDevice") || "iphone"; } catch { return "iphone"; } });
  const [zoom, setZoom] = React.useState(() => { try { return Number(localStorage.getItem("kpMpvZoom")) || 1; } catch { return 1; } });
  const [k, setK] = React.useState(0);
  const save = (key, v) => { try { localStorage.setItem(key, String(v)); } catch { /* 무시 */ } };
  const chip = (on) => `h-9 px-3.5 rounded-xl text-[13.5px] font-black border whitespace-nowrap ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE] hover:border-[#1B2B4B]"}`;
  return (
    <div className="space-y-4" data-kp="mobile-preview-panel">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-black text-[#5B6B85] mr-1">기기</span>
        {PREVIEW_DEVICES.map((d) => <button key={d.key} type="button" onClick={() => { setDevice(d.key); save("kpMpvDevice", d.key); }} className={chip(device === d.key)}>{d.label}<span className="ml-1 text-[11px] opacity-60 tabular-nums">{d.w}×{d.h}</span></button>)}
        <span className="w-px h-6 bg-[#DCE3EE] mx-1" />
        <span className="text-[13px] font-black text-[#5B6B85] mr-1">확대</span>
        {[1, 1.15, 1.3].map((z) => <button key={z} type="button" onClick={() => { setZoom(z); save("kpMpvZoom", z); }} className={chip(zoom === z)}>{Math.round(z * 100)}%</button>)}
        <button type="button" onClick={() => setK((x) => x + 1)} className="ml-auto h-9 px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-black text-[#1B2B4B]">새로고침</button>
      </div>
      <div className="text-[12.5px] text-[#7A879C]">지금 이 창에 로그인한 계정으로 모바일 화면을 열어요. 미리보기 안에서는 출근 기록 · 로그인 기록을 남기지 않아요.</div>
      <div className="overflow-auto rounded-2xl bg-[#EEF2F8] border border-[#E3E8F0] p-6 flex justify-center">
        <MobilePreviewFrame device={device} zoom={zoom} reloadKey={k} />
      </div>
    </div>
  );
}
