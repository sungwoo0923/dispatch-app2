// ======================= src/promo/promoKit.js =======================
// 📣 2026-11-23 관리자센터 › 홍보 — 영상 편집실 · 블로그 원고 공용 재료
//  · 목소리 · 말투 · 배경음악 · 화면 종류 · 장면 기본값 · 시간표(장면마다 언제 시작하는지)
//  · 기본 영상 4편(숏츠 3 · 예고편) — marketing/video 로 만든 것과 같은 내용을 편집할 수 있는 장면 데이터로
import { auth, FUNCTIONS_BASE } from "../firebase";

// Gemini TTS 목소리(이름은 Google 기준 · 설명은 말투)
export const VOICES = [
  ["Puck", "경쾌 · 신나게"], ["Kore", "단단 · 또렷"], ["Charon", "차분 · 설명형(예고편)"], ["Zephyr", "밝게"], ["Fenrir", "흥분 · 힘차게"],
  ["Leda", "젊고 상냥"], ["Orus", "단단 · 신뢰"], ["Aoede", "산뜻 · 가볍게"], ["Callirrhoe", "느긋 · 편안"], ["Autonoe", "밝고 맑게"],
  ["Enceladus", "숨소리 · 부드럽게"], ["Iapetus", "깨끗 · 정확"], ["Umbriel", "편안 · 여유"], ["Algieba", "매끄럽게"], ["Despina", "부드럽고 매끄럽게"],
  ["Erinome", "맑게"], ["Algenib", "거칠고 묵직"], ["Rasalgethi", "정보 전달형"], ["Laomedeia", "경쾌하게"], ["Achernar", "부드럽게"],
  ["Alnilam", "단단하게"], ["Schedar", "고르게 · 담담"], ["Gacrux", "성숙하게"], ["Pulcherrima", "적극적으로"], ["Achird", "친근하게"],
  ["Zubenelgenubi", "편하게 · 일상"], ["Vindemiatrix", "다정하게"], ["Sadachbia", "생기 있게"], ["Sadaltager", "지적으로"], ["Sulafat", "따뜻하게"],
];
export const STYLES = [
  ["숏츠 진행자", "밝고 빠른 유튜브 숏츠 진행자처럼, 친근하고 자신감 있게 말해 주세요"],
  ["예고편 내레이터", "영화 예고편 내레이터처럼, 낮고 차분하고 묵직하게, 문장 사이를 충분히 쉬면서 말해 주세요"],
  ["뉴스 아나운서", "뉴스 아나운서처럼 또박또박, 신뢰감 있게 말해 주세요"],
  ["차분한 설명", "차분하고 친절하게, 천천히 설명하듯 말해 주세요"],
  ["친구처럼", "친한 동료에게 말하듯 편하고 자연스럽게 말해 주세요"],
  ["광고 성우", "라디오 광고 성우처럼 힘 있고 생동감 있게 말해 주세요"],
];
export const MUSIC = [
  ["upbeat", "밝은 팝", "숏츠 · 기능 소개", 112], ["corporate", "기업 홍보", "회사 소개 · 신뢰감", 100], ["tech", "테크 하우스", "빠른 화면 전환", 124],
  ["cinematic", "시네마틱", "예고편 · 감성", 92], ["calm", "잔잔한", "설명 · 교육", 80], ["library", "무료 음악 보관함", "곡 고르기 · 미리 듣기", 0], ["none", "음악 없음", "목소리만", 0], ["custom", "직접 올린 음악", "mp3 · wav", 0],
];
// 🎵 2026-11-24 무료 음악 보관함 — 이 프로그램이 직접 합성한 곡(저작권 걱정 없음 · 마디 단위라 반복해도 자연스럽다) · marketing/bgm/make-library.py
//  관리자가 올린 곡(유튜브 오디오 보관함 · Pixabay Music 등 무료 음원)은 mktMusic 에 쌓여 함께 보인다
export const BGM_LIBRARY = [
  { key: "calm_piano", name: "잔잔한 피아노", use: "교육 · 설명", bpm: 72, url: "/promo/bgm/calm_piano.mp3" },
  { key: "warm_acoustic", name: "따뜻한 어쿠스틱", use: "회사 소개 · 일상", bpm: 92, url: "/promo/bgm/warm_acoustic.mp3" },
  { key: "corporate", name: "기업 홍보", use: "신뢰감 · 발표", bpm: 100, url: "/promo/bgm/corporate.mp3" },
  { key: "tech", name: "모던 비즈니스", use: "서비스 소개 · 화면 설명", bpm: 108, url: "/promo/bgm/tech.mp3" },
];
export const LAYOUTS = [
  ["title", "큰 글자", "질문 · 한 줄 메시지"], ["bubbles", "말풍선 · 목록", "카톡 오더 · 부재중 전화 · 엑셀 창"], ["count", "숫자 강조", "50건 · 2시간 · 21:04"],
  ["media", "실제 화면", "영상 · 사진 + 체크 표시"], ["points", "항목 정리", "1·2·3 또는 → 흐름"], ["logo", "로고 등장", "브랜드 한 방"], ["cta", "마무리 · 신청", "로고 + 버튼 + 주소"],
];
export const TRANSITIONS = [["fade", "부드럽게"], ["flash", "번쩍"], ["slide", "옆으로"], ["zoom", "확대"], ["none", "바로"]];
export const THEMES = [["navy", "네이비(기본)"], ["night", "검정 · 영화"], ["light", "밝은 흰색"]];
export const FRAMES = [["browser", "PC 브라우저"], ["phone", "휴대폰"], ["plain", "테두리 없음"], ["full", "화면 가득"]];

// 실제 프로그램 화면 자료(가상 데이터로 찍은 것) — public/promo/ (같은 주소라 영상 만들기에 쓸 수 있다)
export const LIBRARY = [
  ["scan-text.webm", "오더 스캔(글 붙여넣기)"], ["scan-image.webm", "오더 스캔(캡처 사진)"], ["live-map.webm", "지입차 실시간 위치"], ["approval.webm", "전자결재(PC)"],
  ["d-home.webm", "기사앱 홈(휴대폰)"], ["d-order.webm", "기사앱 오더(휴대폰)"], ["d-log.webm", "기사앱 운행기록(휴대폰)"], ["m-menu.webm", "직원 모바일 메뉴"],
  ["m-list.webm", "모바일 등록내역"], ["m-approval.webm", "모바일 결재"], ["gw-messenger.webm", "사내 메신저"], ["gw-mail.webm", "사내 메일"], ["gw-attendance.webm", "근태"],
  ["hub-board.webm", "허브 오더판(휴대폰)"], ["hub-take.webm", "허브 오더 잡기(휴대폰)"], ["hub-pc-board.webm", "허브 오더판(PC)"], ["hub-pc-post.webm", "허브 오더 올리기(PC)"],
  ["real-scan.jpg", "오더 스캔"], ["real-board.jpg", "실시간배차현황"], ["real-dispatch.jpg", "배차 등록"], ["real-fare.jpg", "운임 조회"], ["real-livemap.jpg", "실시간 위치 지도"],
  ["real-control.jpg", "관제"], ["real-settle.jpg", "지입정산"], ["real-revenue.jpg", "매출 대시보드"], ["real-revenue2.jpg", "매출 분석"], ["real-approval.jpg", "전자결재"],
  ["real-home.jpg", "운영 대시보드"], ["m-home.jpg", "모바일 홈"], ["m-board.jpg", "모바일 배차현황"], ["m-control.jpg", "모바일 관제"], ["m-approval.jpg", "모바일 결재"],
  ["m-driver.jpg", "기사앱"], ["m-driver-order.jpg", "기사앱 오더"], ["m-driver-log.jpg", "기사앱 운행기록"],
];
export const libUrl = (name) => (!name ? "" : /^(https?:|blob:|data:|\/)/.test(name) ? name : `/promo/${name}`);
export const isVideoSrc = (src) => /\.(webm|mp4|mov|m4v)(\?|$)/i.test(String(src || "")) || /%2F[^?]*\.(webm|mp4|mov)/i.test(String(src || ""));

export const uid = () => Math.random().toString(36).slice(2, 9);
export function newScene(layout = "title", extra = {}) {
  const base = { id: uid(), layout, kicker: "", title: "", sub: "", big: "", items: [], narration: "", caption: "", dur: 3, transition: "fade", look: "chat", voice: null, media: null };
  if (layout === "media") base.media = { src: "real-board.jpg", frame: "browser", from: 0, rate: 1, zoom: 1, zoomTo: 1.08, fx: 0.5, fy: 0.3, label: "LogisWeb" };
  if (layout === "cta") Object.assign(base, { title: "", sub: "배차부터 정산까지, 한 화면에서", dur: 4 });
  if (layout === "logo") Object.assign(base, { transition: "flash", dur: 2.5 });
  return { ...base, ...extra, id: extra.id || base.id };
}
export function newProject(format = "shorts") {
  const wide = format === "wide";
  return {
    title: wide ? "새 가로 영상" : "새 숏츠", format, theme: wide ? "night" : "navy", accent: "#4F8BFF", status: "draft",
    voice: { name: wide ? "Charon" : "Puck", style: STYLES[wide ? 1 : 0][1] }, voiceVol: 1, speed: 1,
    music: { preset: wide ? "cinematic" : "upbeat", bpm: wide ? 92 : 112, vol: 0.45, duck: true, url: "", name: "", seed: 7 },
    captions: { on: true, style: "box", size: 1 }, watermark: false,
    cta: { button: "무료 체험 신청하기", url: "검색창에 \"로지스웹\"" },
    scenes: [newScene("title", { kicker: "배차 담당자라면", title: "첫 장면 **질문**을\n적어 보세요", narration: "" }), newScene("cta")],
    youtube: { title: "", description: "", tags: "", privacy: "private" },
  };
}

// 시간표 — 장면 길이 = max(정한 길이, 음성 길이 + 앞 0.25초 + 뒤 0.45초)
export const VOICE_LEAD = 0.25, VOICE_TAIL = 0.45;
export function timeline(p) {
  let t = 0;
  const sc = (p?.scenes || []).map((s) => {
    const vd = Number(s.voice?.dur) || 0;
    const d = Math.max(Number(s.dur) || 1, vd ? vd + VOICE_LEAD + VOICE_TAIL : 0);
    const r = { start: t, dur: d, voiceAt: t + VOICE_LEAD, voiceDur: vd };
    t += d; return r;
  });
  return { scenes: sc, total: Math.max(0.5, t) };
}
export const sceneAt = (tl, t) => { let i = tl.scenes.findIndex((s) => t < s.start + s.dur); if (i < 0) i = tl.scenes.length - 1; return Math.max(0, i); };
export const fmtTime = (s) => { const x = Math.max(0, s); return `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}.${Math.floor((x % 1) * 10)}`; };
// 음성이 지금 글 · 목소리와 맞는지(바뀌었으면 다시 만들어야 함)
export const voiceKey = (p, s) => `${p.voice?.name}|${p.voice?.style}|${s.narration}`;
export const voiceStale = (p, s) => !!s.narration?.trim() && (!s.voice?.url || s.voice.key !== voiceKey(p, s));

// 서버 부르기(관리자센터 공통) — functions/index.js mktAi
export async function mktCall(action, input = {}) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`${FUNCTIONS_BASE}/mktAi`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action, input }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `서버 오류(${r.status})`);
  return j;
}
export function wavB64ToBlob(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: "audio/wav" }); }

// ── 기본 영상 4편 (marketing/video 와 같은 내용) ──
const V = (file, dur, key) => ({ url: `/promo/voice/${file}.flac`, dur, key });
const S1 = "밝고 빠른 유튜브 숏츠 진행자처럼, 친근하고 자신감 있게 말해 주세요";
const S2 = "영화 예고편 내레이터처럼, 낮고 차분하고 묵직하게, 문장 사이를 충분히 쉬면서 말해 주세요";
function seed(title, format, voiceName, style, music, scenes, extra = {}) {
  const p = { ...newProject(format), title, voice: { name: voiceName, style }, music: { ...newProject(format).music, ...music }, ...extra };
  p.scenes = scenes.map(([layout, o, vf, vd]) => {
    const s = newScene(layout, o);
    if (vf) s.voice = V(vf, vd, `${voiceName}|${style}|${s.narration}`);
    return s;
  });
  return p;
}
export const SEED_PROJECTS = () => [
  seed("숏츠 ① 카톡 오더 붙여넣기", "shorts", "Puck", S1, { preset: "upbeat", bpm: 112 }, [
    ["bubbles", { kicker: "배차 담당자라면 공감 100%", title: "카톡 오더,\n아직도 **손으로**\n옮겨 적으세요?", items: ["[오더] 대성식품 → 평택 포승\n11/5 오전 8시 상차 · 11톤 윙", "인천 서구 → 구미 1공단\n5톤 냉장 · 운임 48만 계산서", "급) 이천 → 대구 달서구 · 오후 2시 도착", "김포 → 대전 관평 · 1톤 탑"], narration: "카톡으로 온 오더, 아직도 하나하나 옮겨 적으세요?" }, "shorts-1-01", 3.1],
    ["count", { kicker: "하루 오더", big: "50건", title: "입력에만 매일 **2시간**", sub: "😩 ⌨️ 📋", narration: "하루 오십 건이면, 입력만 두 시간이에요." }, "shorts-1-02", 2.97],
    ["title", { kicker: "LogisWeb", title: "Ctrl + V\n붙여넣기 **한 번이면 끝**", transition: "flash", narration: "로지스웹은 붙여넣기 한 번이면 끝." }, "shorts-1-03", 2.48],
    ["media", { kicker: "실제 화면 · 오더 스캔", title: "카톡 글 그대로 붙이면", items: ["상차지", "하차지", "일시", "차종", "운임"], narration: "상차지, 하차지, 시간, 차종, 운임까지 알아서 칸을 채워요.", media: { src: "scan-text.webm", frame: "browser", from: 2.2, rate: 2.1, zoom: 1.35, zoomTo: 1.5, fx: 0.62, fy: 0.4, label: "LogisWeb · 오더 스캔" } }, "shorts-1-04", 4.6],
    ["media", { kicker: "캡처 이미지 붙여넣기", title: "**사진**으로 받아도 OK", items: ["19개 항목 자동 인식"], narration: "캡처 사진을 붙여도 똑같이 인식해요.", media: { src: "scan-image.webm", frame: "browser", from: 4, rate: 1.7, zoom: 1.3, zoomTo: 1.4, fx: 0.45, fy: 0.4, label: "LogisWeb · 오더 스캔" } }, "shorts-1-05", 2.51],
    ["cta", { narration: "배차 프로그램, 로지스웹. 지금 무료로 써 보세요.", sub: "배차부터 정산까지, 한 화면에서", dur: 5 }, "shorts-1-06", 3.3],
  ]),
  seed("숏츠 ② 실시간 관제", "shorts", "Puck", S1, { preset: "upbeat", bpm: 112 }, [
    ["count", { kicker: "배차실 하루 루틴", title: "\"기사님,\n지금 **어디세요?**\"", big: "27통", sub: "오늘 확인 전화", narration: "기사님 지금 어디세요? 하루에 이 전화, 몇 번 하세요?" }, "shorts-2-01", 3.03],
    ["media", { kicker: "LogisWeb 기사앱", title: "화면 꺼져도 **위치 자동 전송**", items: ["GPS 활성", "운송중"], narration: "로지스웹 기사앱을 켜 두면, 화면이 꺼져 있어도 위치가 올라와요.", media: { src: "d-home.webm", frame: "phone", from: 0, rate: 1.2, zoom: 1, zoomTo: 1, fx: 0.5, fy: 0, label: "" } }, "shorts-2-02", 3.8],
    ["media", { kicker: "실제 화면 · 지입차 실시간 위치", title: "우리 차, **지도 한 장에**", narration: "지도 한 장에 우리 차가 전부 보이고,", media: { src: "live-map.webm", frame: "browser", from: 3, rate: 1.5, zoom: 1.2, zoomTo: 1.35, fx: 0.55, fy: 0.4, label: "LogisWeb · 실시간 위치" } }, "shorts-2-03", 2.43],
    ["points", { kicker: "지오펜스 자동 판정", title: "전화 없이 **상태가 알아서**", items: ["📦 상차지 도착 | 상차지 반경에 들어가면", "🚚 운송중 | 출발하면 자동으로", "🏁 하차지 도착 | 도착하면 바로 표시"], narration: "상차지에 들어가면 상차, 하차지에 들어가면 하차로 자동으로 바뀌어요." }, "shorts-2-04", 4.7],
    ["cta", { title: "확인 전화 대신,\n**지도 한 번**", narration: "확인 전화 대신, 로지스웹.", dur: 5 }, "shorts-2-05", 1.81],
  ]),
  seed("숏츠 ③ 월말 정산", "shorts", "Puck", S1, { preset: "upbeat", bpm: 112 }, [
    ["bubbles", { kicker: "매달 말일 풍경", title: "월말 정산,\n엑셀 **열 개** 띄우셨죠?", look: "excel", items: ["거래처정산_11월.xlsx", "기사지급_최종.xlsx", "기사지급_최종_진짜최종.xlsx", "매출집계(수정3).xlsx"], narration: "월말만 되면 엑셀 열 개 띄워 놓고 정산하시죠?" }, "shorts-3-01", 3.02],
    ["points", { kicker: "LogisWeb은", title: "배차할 때 넣은 운임이\n**그대로 정산**으로", items: ["🚚 배차 운임 입력", "🧾 거래처 청구", "💸 기사 지급", "📒 회계 장부 자동"], narration: "로지스웹은 배차할 때 넣은 운임이, 그대로 정산이 돼요." }, "shorts-3-02", 3.26],
    ["media", { kicker: "실제 화면 · 지입정산", title: "지급명세서 **일괄 발송**", items: ["10명 · 178,321,000원 한 번에"], narration: "거래명세서는 바로 뽑고, 기사님 지급명세서는 앱으로 한 번에 보내요.", media: { src: "real-settle.jpg", frame: "browser", from: 0, rate: 1, zoom: 1.5, zoomTo: 1.8, fx: 0.55, fy: 0.22, label: "LogisWeb · 지입정산" } }, "shorts-3-03", 4.86],
    ["media", { kicker: "모바일 전자결재", title: "결재도 **휴대폰으로**", narration: "결재도 휴대폰으로 바로 승인하고요.", media: { src: "m-approval.webm", frame: "phone", from: 2, rate: 2.2, zoom: 1, zoomTo: 1, fx: 0.5, fy: 0, label: "" } }, "shorts-3-04", 2.14],
    ["cta", { title: "월말 야근,\n**이제 그만**", narration: "월말 야근, 이제 그만. 로지스웹.", dur: 5 }, "shorts-3-05", 2.95],
  ]),
  seed("예고편 · 배차부터 정산까지", "wide", "Charon", S2, { preset: "cinematic", bpm: 92, vol: 0.55 }, [
    ["count", { big: "21:04", title: "배차실의 불은,\n아직 꺼지지 않았습니다.", narration: "밤 아홉 시. 배차실의 불은, 아직 꺼지지 않았습니다.", transition: "fade" }, "trailer-01", 6.78],
    ["bubbles", { title: "쏟아지는 **카톡 오더**", items: ["[오더] 대성식품 → 평택 포승 · 11톤 윙", "인천 서구 → 구미 1공단 · 5톤 냉장", "급) 이천 → 대구 달서 · 오후 2시 도착", "김포 → 대전 관평 · 1톤 탑 · 23만", "내일 오전 상차 3건 추가요", "운임 변경됐어요 52→55"], narration: "쏟아지는 카톡 오더.", transition: "flash", dur: 3.2 }, "trailer-02a", 2.13],
    ["bubbles", { title: "끊이지 않는\n**위치 확인 전화**", look: "call", items: ["이민수 기사님 | 부재중", "박정훈 기사님 | 통화중", "노승철 기사님 | 부재중", "대성식품 담당자 | \"차 어디쯤이에요?\""], narration: "끊이지 않는, 위치 확인 전화.", dur: 4 }, "trailer-02b", 3.34],
    ["bubbles", { title: "그리고, **월말 정산**", look: "excel", items: ["거래처정산_11월.xlsx", "기사지급_최종_진짜최종.xlsx", "매출집계(수정3).xlsx", "미수금_확인필요.xlsx"], narration: "그리고, 월말 정산.", dur: 3.6 }, "trailer-02c", 2.72],
    ["title", { sub: "문제는 사람이 아니었습니다.", title: "일이, **손에** 의존하고 있었던 겁니다.", narration: "문제는 사람이 아니었습니다. 일이, 손에 의존하고 있었던 겁니다." }, "trailer-03", 6.52],
    ["title", { kicker: "그래서,", title: "**10년** 배차 현장이\n직접 만들었습니다.", narration: "그래서, 십 년 배차 현장이 직접 만들었습니다." }, "trailer-04", 4.72],
    ["logo", { narration: "로지스웹.", transition: "flash", dur: 2.6 }, "trailer-05", 0.97],
    ["media", { kicker: "ORDER SCAN", title: "오더는,\n**붙여넣기 한 번으로**", narration: "오더는, 붙여넣기 한 번으로.", media: { src: "scan-text.webm", frame: "browser", from: 4, rate: 2.4, zoom: 1, zoomTo: 1.05, fx: 0.5, fy: 0.3, label: "LogisWeb · 오더 스캔" } }, "trailer-06", 2.57],
    ["media", { kicker: "LIVE BOARD", title: "배차는,\n**모두가 실시간으로**", narration: "배차는, 모두가 실시간으로.", media: { src: "real-board.jpg", frame: "browser", from: 0, rate: 1, zoom: 1, zoomTo: 1.12, fx: 0.3, fy: 0.3, label: "LogisWeb · 실시간배차현황" } }, "trailer-07", 2.95],
    ["media", { kicker: "REAL-TIME CONTROL", title: "차량은,\n**지도 위에서**", narration: "차량은, 지도 위에서.", media: { src: "live-map.webm", frame: "browser", from: 2, rate: 1.6, zoom: 1, zoomTo: 1.05, fx: 0.5, fy: 0.4, label: "LogisWeb · 실시간 위치" } }, "trailer-08", 2.81],
    ["media", { kicker: "SETTLEMENT · E-APPROVAL", title: "정산과\n**결재까지.**", narration: "정산과, 결재까지.", media: { src: "approval.webm", frame: "browser", from: 6, rate: 2.5, zoom: 1, zoomTo: 1.05, fx: 0.5, fy: 0.3, label: "LogisWeb · 전자결재" } }, "trailer-09a", 2.57],
    ["points", { title: "한 번 입력한 데이터로, **끝까지.**", look: "chain", items: ["오더", "배차", "관제", "인수증", "정산", "매출"], narration: "한 번 입력한 데이터로, 끝까지." }, "trailer-09b", 6.04],
    ["cta", { title: "배차부터 정산까지,\n운송사 업무를 **한 화면에서**", sub: "운송사 통합 운송관리시스템(TMS) · PC · 모바일 · 기사앱", narration: "배차부터 정산까지, 운송사 업무를 한 화면에서. 로지스웹.", dur: 9 }, "trailer-10", 8.74],
  ], { cta: { button: "무료 체험 신청", url: "logisweb.co.kr" } }),
];
