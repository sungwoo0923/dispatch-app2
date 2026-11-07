// ======================= src/OrderScanModal.jsx =======================
// 📡 오더 스캔(2026-10-28) — "오더 붙여넣기"를 화면 가운데 팝업으로.
//  · Ctrl+V 한 번으로 — 카톡·문자 오더 글(텍스트) 또는 캡처한 오더 이미지 둘 다
//  · 붙여넣으면 스캐너 빛줄이 위에서 아래로 훑으며 줄마다 무엇으로 읽었는지(상차·하차·차량·화물…) 표시
//  · 오른쪽에 인식 결과 — ✓ 인식 / 추정 / ✕ 인식 못함, 확인할 점(주소만 있음·주소 확인 불가 등)을 따로 알려준다
//  · 주소는 지도(T맵)로 실제 있는 주소인지 확인, 등록된 하차지거래처와 맞춰 이름·주소·담당자를 채운다
//  · 한 번에 여러 건이 붙어오면 오더별 탭으로 나눠 하나씩 적용
//  · 결과는 칸마다 바로 고칠 수 있고, [배차관리에 적용]을 눌러야 등록폼에 들어간다(바로 저장되지 않음)
//  ⭐ 2026-11-07 정밀 인식(ai 연결을 넘겨받았을 때 — src/orderScanApi.js · cafe-site/src/hub/hubScanAi.js)
//  · 캡처 이미지는 서버 Google Vision으로 먼저 읽고(줄 위치 포함), 실패·오프라인이면 예전처럼 브라우저 글자 인식(tesseract)
//  · 글은 규칙 인식기로 바로 보여 준 뒤, 서버 AI(Claude)가 칸을 정리하면 합친다 — 애매한 칸은 노란색(확인이 필요한 칸)
//  · 회사별 학습: [적용] 뒤 오더를 저장하면 고친 칸을 기억했다가, 비슷한 양식이 오면 예시 · 라벨 바꾸기 · 이름 바꾸기로 쓴다
//  · AI 키가 없거나 실패하면 아무 말 없이 규칙 인식 결과 그대로
import React from "react";
import { createPortal } from "react-dom";
import { parseOrderScan, splitOrders } from "./orderScanParser";
import { normalizeAiFields, mergeAiInto, applyAliases, applyLabelRemaps, needsCheck, kstToday, reconcileRoles } from "./orderScanAi";
import { verifyAddress } from "./tmapFareCalc";
import { fmtPhone } from "./formatInput";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const ROLE_STYLE = {
  상차: "bg-[#0F1A30] text-white", 하차: "bg-[#4B6CB7] text-white", 경로: "bg-[#2D4C82] text-white",
  시간: "bg-[#E6EEFC] text-[#1B2B4B]", 날짜: "bg-[#E6EEFC] text-[#1B2B4B]", 차량: "bg-[#DCE6F7] text-[#0F1A30]",
  화물: "bg-[#DCE6F7] text-[#0F1A30]", 운임: "bg-[#DCE6F7] text-[#0F1A30]", 거래처: "bg-[#E6EEFC] text-[#1B2B4B]",
  담당자: "bg-[#E6EEFC] text-[#1B2B4B]", 메모: "bg-[#EEF1F6] text-[#5B6B85]", 기타: "bg-[#EEF1F6] text-[#5B6B85]",
  미인식: "bg-white text-[#9AA9C3] ring-1 ring-dashed ring-[#C9D2E0]",
};
const BOX_COLOR = { 상차: "#0F1A30", 하차: "#4B6CB7", 경로: "#2D4C82", 미인식: "#9AA9C3" };

const GROUPS = [
  { title: "상차", en: "PICKUP", keys: [["상차지명", "상차지명"], ["상차지주소", "주소"], ["상차지담당자", "담당자"], ["상차지담당자번호", "연락처"], ["상차시간", "상차시간"], ["상차방법", "상차방법"]] },
  { title: "하차", en: "DROP", keys: [["하차지명", "하차지명"], ["하차지주소", "주소"], ["하차지담당자", "담당자"], ["하차지담당자번호", "연락처"], ["하차시간", "하차시간"], ["하차방법", "하차방법"]] },
  { title: "운송", en: "FREIGHT", keys: [["상차일", "상차일"], ["하차일", "하차일"], ["차량톤수", "톤수"], ["차량종류", "차량종류"], ["화물내용", "화물내용"], ["중량", "중량"], ["청구운임", "청구운임"], ["기사운임", "기사운임"], ["지급방식", "지급방식"], ["거래처명", "거래처"]] },
];
const MONEY_KEYS = ["청구운임", "기사운임"];
const MAIN_PAY = ["계산서", "착불", "선불", "계좌이체"];
const OCR_MAX = 2000; // 서버 글자 인식에 보낼 긴 변(px)

// 밝기 막대(히스토그램) 양 끝 1%를 잘라 0~255로 펴는 자동 대비 — 흐린 캡처 · 회색 배경에 효과
export function autoContrast(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
  const cut = gray.length * 0.01;
  let lo = 0, hi = 255, acc = 0;
  while (lo < 254 && acc + hist[lo] <= cut) { acc += hist[lo]; lo += 1; }
  acc = 0;
  while (hi > lo + 1 && acc + hist[hi] <= cut) { acc += hist[hi]; hi -= 1; }
  const span = Math.max(24, hi - lo);
  for (let i = 0; i < gray.length; i += 1) gray[i] = Math.max(0, Math.min(255, Math.round(((gray[i] - lo) * 255) / span)));
  return { lo, hi };
}
// 바깥 여백(배경과 같은 색) 잘라낼 범위 — 글자 쪽만 남긴다(사방 12px은 남김)
export function trimBox(gray, w, h, thr = 40) {
  const bg = gray[0];
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (Math.abs(gray[y * w + x] - bg) > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h };
  const m = 12;
  const x = Math.max(0, x0 - m), y = Math.max(0, y0 - m);
  return { x, y, w: Math.min(w, x1 + m) - x, h: Math.min(h, y1 + m) - y };
}

// 캡처 이미지 → 글자 인식이 잘 되게 키우고(작은 캡처 2배) 흑백 · 자동 대비 · 바깥 여백 자르기
//  돌려주는 값: canvas(인식용) · scale(원본 → canvas 배율) · ox/oy(잘라낸 왼쪽 위, 원본 px) · w/h(원본 크기)
//  인식 결과 위치를 원본으로 되돌릴 때: 원본 x = canvas x / scale + ox
export async function prepImage(dataUrl) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  // 1) 원본 크기 흑백으로 여백 범위 찾기
  const c0 = document.createElement("canvas");
  c0.width = img.width; c0.height = img.height;
  const g0 = c0.getContext("2d");
  g0.drawImage(img, 0, 0);
  const d0 = g0.getImageData(0, 0, c0.width, c0.height).data;
  const gray0 = new Uint8ClampedArray(c0.width * c0.height);
  for (let i = 0, j = 0; i < d0.length; i += 4, j += 1) gray0[j] = d0[i] * 0.299 + d0[i + 1] * 0.587 + d0[i + 2] * 0.114;
  const box = trimBox(gray0, c0.width, c0.height);
  // 2) 잘라서 키우기/줄이기
  const scale = box.w < 1000 ? 2 : box.w > 2600 ? 2600 / box.w : 1;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(box.w * scale)); c.height = Math.max(1, Math.round(box.h * scale));
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  // 3) 흑백 → (어두운 배경 캡처(카톡 다크모드)는 반전) → 자동 대비
  const gray = new Uint8ClampedArray(c.width * c.height);
  let sum = 0;
  for (let i = 0, j = 0; i < px.length; i += 4, j += 1) { gray[j] = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; sum += gray[j]; }
  const dark = sum / gray.length < 110;
  if (dark) for (let j = 0; j < gray.length; j += 1) gray[j] = 255 - gray[j];
  autoContrast(gray);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 1) { px[i] = px[i + 1] = px[i + 2] = gray[j]; }
  g.putImageData(d, 0, 0);
  return { canvas: c, scale, ox: box.x, oy: box.y, w: img.width, h: img.height };
}

// 서버 글자 인식에 보낼 JPEG(긴 변 2000px 이하) — { b64, k: canvas → 보낸 그림 배율 }
export function toUploadJpeg(canvas) {
  const k = Math.min(1, OCR_MAX / Math.max(canvas.width, canvas.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(canvas.width * k)); c.height = Math.max(1, Math.round(canvas.height * k));
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(canvas, 0, 0, c.width, c.height);
  return { b64: c.toDataURL("image/jpeg", 0.85).replace(/^data:[^,]+,/, ""), k };
}
const withTimeout = (pr, ms, msg) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

// 등록 업체 목록을 인식기가 쓰는 모양으로(PC 하차지거래처 { 업체명 } / 모바일 { 거래처명, contacts } 모두)
export function normPlaces(list) {
  return (list || []).map((p) => {
    const cs = (Array.isArray(p.contacts) ? p.contacts : []).filter((c) => c && (String(c.name || "").trim() || String(c.phone || "").trim()));
    const pri = cs.find((c) => c.isPrimary) || cs[0];
    return { ...p, 업체명: p.업체명 || p.거래처명 || p.하차지명 || "", 주소: p.주소 || p.하차지주소 || "", 담당자: p.담당자 || pri?.name || "", 담당자번호: p.담당자번호 || pri?.phone || "", _contacts: cs };
  }).filter((p) => p.업체명);
}

// "2026-10-30" + n일 → "2026-10-31"
function shiftDay(ymdStr, n) {
  const d = new Date(`${ymdStr}T00:00:00`);
  if (isNaN(d)) return ymdStr;
  d.setDate(d.getDate() + (n || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 스캔에 상차일이 없을 때 — 화면에 이미 있는 상차일 기준으로 하차일(당착/익착)을 맞춘다
export function scanDropDate(patch, info, formPickDate) {
  if (patch.상차일 || !formPickDate || info?.dropRel == null) return {};
  return { 하차일: shiftDay(formPickDate, info.dropRel) };
}

export default function OrderScanModal({ onClose, onApply, places: placesRaw = [], clients = [], initial = null, applyLabel = "배차관리에 적용", ai = null }) {
  const places = React.useMemo(() => normPlaces(placesRaw), [placesRaw]);
  const [stage, setStage] = React.useState("input"); // input | scanning | result
  const [src, setSrc] = React.useState(null); // { type: "text", text } | { type: "image", url, w, h }
  const [typed, setTyped] = React.useState("");
  const [ocr, setOcr] = React.useState({ status: "", pct: 0 });
  const [ocrLines, setOcrLines] = React.useState([]); // [{ text, bbox, i }]
  const [scanPos, setScanPos] = React.useState(0); // 0~1 빛줄 위치
  const [blocks, setBlocks] = React.useState([]);
  const [bi, setBi] = React.useState(0);
  const [result, setResult] = React.useState(null);
  const [vals, setVals] = React.useState({});
  const [addrCheck, setAddrCheck] = React.useState({});
  const [unknownToMemo, setUnknownToMemo] = React.useState(false);
  const [err, setErr] = React.useState("");
  // 정밀 인식 — ocr: 이미지를 읽은 방법(vision | tesseract) · busy: AI 정리 중 · used: AI 정리 결과를 합쳤는지
  const [engine, setEngine] = React.useState({ ocr: "", busy: false, used: false });
  const fileRef = React.useRef(null);
  const today = React.useMemo(() => new Date(), []);
  const aiByBlock = React.useRef({}); // 오더 블록 번호 → AI 정리 결과(맞춘 값)
  const hintsRef = React.useRef(null); // 회사 학습 { examples, remaps }
  const touched = React.useRef(new Set()); // 사용자가 직접 고친 칸(AI 결과가 늦게 와도 덮지 않는다)
  const scannedRef = React.useRef({}); // 스캔 직후 값(학습 기록에서 "무엇을 고쳤나" 비교용)
  const scanSeq = React.useRef(0); // 새로 스캔하면 늦게 온 예전 응답은 버린다
  const biRef = React.useRef(0); // 지금 보고 있는 오더 블록(늦게 온 AI 결과를 그 블록에만 합친다)

  // ── 결과 계산(오더 블록 단위) ── 배운 라벨 바꾸기 → 규칙 인식 → (AI 결과 합치기 · 배운 이름 바꾸기) → 등록 업체 맞추기
  const parseBlock = React.useCallback((bl, i) => {
    const remaps = hintsRef.current?.remaps;
    const aiNorm = aiByBlock.current[i] || null;
    const txt = applyLabelRemaps(bl[i], remaps?.labelMap);
    const r = parseOrderScan(txt, { places, clients, today, aiMerge: (F) => { if (aiNorm) mergeAiInto(F, aiNorm); applyAliases(F, remaps?.aliases); } });
    return reconcileRoles(r, bl[i]);
  }, [places, clients, today]);
  const showParsed = React.useCallback((r, keepTouched) => {
    setResult(r);
    const v = {};
    Object.entries(r.fields).forEach(([k, f]) => { v[k] = f.value; });
    scannedRef.current = { ...v };
    setVals((p) => {
      if (!keepTouched) return v;
      const out = { ...v };
      touched.current.forEach((k) => { out[k] = p[k]; });
      return out;
    });
  }, []);
  const runParse = React.useCallback((text, idx = 0) => {
    const bl = splitOrders(text);
    setBlocks(bl);
    const i = Math.min(idx, bl.length - 1);
    setBi(i); biRef.current = i;
    const r = parseBlock(bl, i);
    touched.current = new Set();
    showParsed(r, false);
    setAddrCheck({});
    return { r, bl, i };
  }, [parseBlock, showParsed]);

  // ── 정밀 인식(AI 칸 정리 + 회사 학습) — 규칙 결과를 먼저 보여 주고 뒤에서 합친다. 실패하면 조용히 규칙 결과 그대로 ──
  const refine = React.useCallback(async (bl, i, seq) => {
    if (!ai || !bl[i]) return;
    setEngine((e) => ({ ...e, busy: true }));
    try {
      if (!hintsRef.current) {
        hintsRef.current = await withTimeout(ai.hintsFor(bl[i]), 6000, "hints").catch(() => ({ examples: [], remaps: null }));
        if (seq !== scanSeq.current) return;
        if (hintsRef.current?.remaps && (Object.keys(hintsRef.current.remaps.labelMap || {}).length || hintsRef.current.remaps.aliases?.length)) showParsed(parseBlock(bl, i), true);
      }
      if (!aiByBlock.current[i]) {
        const txt = applyLabelRemaps(bl[i], hintsRef.current?.remaps?.labelMap);
        const r = await ai.extract(txt, hintsRef.current?.examples || []);
        if (seq !== scanSeq.current) return;
        aiByBlock.current[i] = normalizeAiFields(r?.fields, { today: kstToday() });
      }
      if (biRef.current === i) showParsed(parseBlock(bl, i), true);
      setEngine((e) => ({ ...e, used: true }));
    } catch (e) {
      console.warn("[오더 스캔] 정밀 인식을 쓰지 못해 기본 인식으로 보여 줘요:", e?.message || e);
    } finally {
      if (seq === scanSeq.current) setEngine((e) => ({ ...e, busy: false }));
    }
  }, [ai, parseBlock, showParsed]);
  const newScan = () => { scanSeq.current += 1; aiByBlock.current = {}; hintsRef.current = null; touched.current = new Set(); setEngine({ ocr: "", busy: false, used: false }); return scanSeq.current; };

  // ── 텍스트 스캔(빛줄 애니메이션 → 결과) ──
  const startText = React.useCallback((text) => {
    const t = String(text || "").trim();
    if (!t) return;
    const seq = newScan();
    setErr(""); setSrc({ type: "text", text: t }); setStage("scanning"); setScanPos(0); setOcrLines([]);
    const { bl, i } = runParse(t, 0);
    refine(bl, i, seq);
    const lines = t.split("\n").length;
    const dur = Math.min(2200, 700 + lines * 90);
    const st = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - st) / dur);
      setScanPos(k);
      if (k < 1) requestAnimationFrame(tick); else setStage("result");
    };
    requestAnimationFrame(tick);
  }, [runParse, refine]); // eslint-disable-line react-hooks/exhaustive-deps

  // 브라우저 글자 인식(tesseract) — 서버 인식이 안 될 때
  const tesseractRead = async (prep) => {
    const { createWorker } = await import("tesseract.js");
    setOcr({ status: "한글 인식 모델을 준비하고 있어요(처음 한 번은 조금 걸려요)", pct: 0 });
    // 인식 모델을 못 받으면(인터넷 차단 등) 무한정 기다리지 않게 60초 제한
    const worker = await withTimeout(createWorker("kor+eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") setOcr({ status: "글자를 읽고 있어요", pct: Math.round((m.progress || 0) * 100) });
        else if (/load|initializ/.test(m.status || "")) setOcr((o) => ({ ...o, status: "한글 인식 모델을 준비하고 있어요(처음 한 번은 조금 걸려요)" }));
      },
      errorHandler: () => {},
    }), 60000, "이미지 인식 모델을 불러오지 못했어요. 인터넷 연결을 확인하거나 글로 붙여넣어 주세요");
    await worker.setParameters({ preserve_interword_spaces: "1" }).catch(() => {});
    const { data } = await withTimeout(worker.recognize(prep.canvas, {}, { text: true, blocks: true }), 90000, "이미지가 커서 오래 걸려요. 오더 부분만 잘라서 다시 붙여넣어 주세요");
    worker.terminate().catch(() => {});
    const lines = [];
    const back = (x, o) => x / prep.scale + o;
    (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => {
      const tx = String(l.text || "").replace(/\n/g, " ").trim();
      if (tx) lines.push({ text: tx, bbox: { x0: back(l.bbox.x0, prep.ox), y0: back(l.bbox.y0, prep.oy), x1: back(l.bbox.x1, prep.ox), y1: back(l.bbox.y1, prep.oy) } });
    })));
    return { lines, text: lines.length ? lines.map((l) => l.text).join("\n") : String(data.text || "").trim() };
  };
  // 서버 글자 인식(Google Vision) — 줄 위치를 원본 그림 기준으로 되돌린다
  const visionRead = async (prep) => {
    const up = toUploadJpeg(prep.canvas);
    setOcr({ status: "글자를 읽고 있어요", pct: 0 });
    const r = await ai.ocr(up.b64);
    const f = prep.scale * up.k;
    const lines = (r?.lines || []).filter((l) => l?.text && l.bbox).map((l) => ({
      text: String(l.text).trim(),
      bbox: { x0: l.bbox.x0 / f + prep.ox, y0: l.bbox.y0 / f + prep.oy, x1: l.bbox.x1 / f + prep.ox, y1: l.bbox.y1 / f + prep.oy },
    }));
    const text = lines.length ? lines.map((l) => l.text).join("\n") : String(r?.text || "").trim();
    if (!text) throw new Error("서버 인식 결과가 비었어요");
    return { lines, text };
  };

  // ── 이미지 스캔(글자 인식 OCR) ──
  const startImage = React.useCallback(async (dataUrl) => {
    const seq = newScan();
    setErr(""); setStage("scanning"); setScanPos(0); setOcrLines([]); setResult(null);
    setOcr({ status: "이미지를 준비하고 있어요", pct: 0 });
    let raf = 0; let alive = true;
    const st = performance.now();
    const loop = (now) => { if (!alive) return; setScanPos(((now - st) / 1600) % 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    try {
      const prep = await prepImage(dataUrl);
      setSrc({ type: "image", url: dataUrl, w: prep.w, h: prep.h });
      let read = null; let how = "tesseract";
      if (ai && (typeof navigator === "undefined" || navigator.onLine !== false)) {
        try { read = await visionRead(prep); how = "vision"; } catch (e) { console.warn("[오더 스캔] 서버 글자 인식 실패, 브라우저 인식으로 읽어요:", e?.message || e); }
      }
      if (!read) read = await tesseractRead(prep);
      if (seq !== scanSeq.current) return;
      if (!read.text) throw new Error("이미지에서 글자를 찾지 못했어요");
      setEngine((e) => ({ ...e, ocr: how }));
      setOcrLines(read.lines.map((l, i) => ({ ...l, i })));
      setTyped(read.text);
      const { bl, i } = runParse(read.text, 0);
      refine(bl, i, seq);
      // 마지막으로 한 번 끝까지 훑고 결과
      alive = false; cancelAnimationFrame(raf);
      const st2 = performance.now();
      const fin = (now) => { const k = Math.min(1, (now - st2) / 900); setScanPos(k); if (k < 1) requestAnimationFrame(fin); else setStage("result"); };
      requestAnimationFrame(fin);
    } catch (e) {
      alive = false; cancelAnimationFrame(raf);
      setErr(/importScripts|fetch|network|Failed/i.test(e?.message || "") ? "이미지 인식 모델을 불러오지 못했어요. 인터넷 연결을 확인하거나 글로 붙여넣어 주세요" : (e?.message || "이미지 인식에 실패했어요"));
      setStage("input");
    }
  }, [runParse, refine, ai]); // eslint-disable-line react-hooks/exhaustive-deps

  const readFile = (file) => {
    if (!file || !/^image\//.test(file.type)) return;
    const fr = new FileReader();
    fr.onload = () => startImage(fr.result);
    fr.readAsDataURL(file);
  };

  // ── Ctrl+V — 창이 열려 있는 동안 어디서든 ──
  React.useEffect(() => {
    const onPaste = (e) => {
      const items = [...(e.clipboardData?.items || [])];
      const img = items.find((it) => it.type?.startsWith("image/"));
      if (img) { e.preventDefault(); readFile(img.getAsFile()); return; }
      const tag = (e.target?.tagName || "").toLowerCase();
      const isScanBox = !!e.target?.dataset?.osInput; // 왼쪽 "직접 입력" 칸에 붙여넣으면 바로 스캔
      if ((tag === "textarea" || tag === "input") && !isScanBox) return; // 결과 칸 수정 중 붙여넣기는 그대로
      const t = e.clipboardData?.getData("text");
      if (t) { e.preventDefault(); setTyped(t); startText(t); }
    };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("paste", onPaste); window.removeEventListener("keydown", onKey); };
  }, [startText, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  // 처음 열 때 넘겨받은 내용(배차관리 화면에서 Ctrl+V로 연 경우)
  React.useEffect(() => {
    if (!initial) return;
    if (initial.image) startImage(initial.image);
    else if (initial.text) { setTyped(initial.text); startText(initial.text); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 주소 지도 확인(결과가 나오면) ──
  React.useEffect(() => {
    if (stage !== "result") return;
    let off = false;
    ["상차지", "하차지"].forEach((P) => {
      const a = vals[`${P}주소`];
      if (!a || addrCheck[P]?.addr === a) return;
      setAddrCheck((c) => ({ ...c, [P]: { addr: a, st: "checking" } }));
      verifyAddress(a).then((r) => {
        if (off) return;
        const st = r.status === "ok" ? (r.precise ? "ok" : "approx") : r.status === "notfound" ? "fail" : "error";
        setAddrCheck((c) => (c[P]?.addr !== a ? c : { ...c, [P]: { addr: a, st, area: r.area || "" } }));
      }).catch(() => { if (!off) setAddrCheck((c) => ({ ...c, [P]: { addr: a, st: "error" } })); });
    });
    return () => { off = true; };
  }, [stage, vals.상차지주소, vals.하차지주소]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchBlock = (i) => { const full = src?.type === "text" ? src.text : typed; const { bl } = runParse(full, i); refine(bl, i, scanSeq.current); };

  const apply = () => {
    const v = vals;
    const patch = {};
    const copy = ["거래처명", "상차지명", "상차지주소", "상차지담당자", "상차지담당자번호", "상차시간", "상차시간기준", "상차일", "상차방법",
      "하차지명", "하차지주소", "하차지담당자", "하차지담당자번호", "하차시간", "하차시간기준", "하차일", "하차방법", "차량톤수", "차량종류", "운행유형"];
    copy.forEach((k) => { if (v[k] !== undefined && v[k] !== "") patch[k] = v[k]; });
    // ⭐ 사용자 요청 — 하차 날짜가 따로 안 적혀 있으면 당착(하차일 = 상차일).
    //  "익착/내일하차/낼착"처럼 상대 표기면 상차일 기준 +1일. 하차일을 화면에서 직접 고쳤으면 그대로 둔다.
    const dF = result?.fields?.하차일;
    const dropRel = dF ? (dF.rel ?? null) : (v.하차일 ? null : 0);
    if (v.상차일 && dropRel != null && (!dF || v.하차일 === dF.value)) patch.하차일 = shiftDay(v.상차일, dropRel);
    if (v.청구운임) patch.청구운임 = String(v.청구운임).replace(/[^\d]/g, "");
    if (v.기사운임) patch.기사운임 = String(v.기사운임).replace(/[^\d]/g, "");
    if (MAIN_PAY.includes(v.지급방식)) patch.지급방식 = v.지급방식;
    if (v.화물수량 && /^\d+$/.test(String(v.화물수량))) patch.화물수량 = String(v.화물수량);
    if (v.화물내용) {
      const unit = v.화물단위 || (/(파레트|박스|통)$/.exec(v.화물내용) || [])[1] || "";
      patch.화물내용 = v.화물내용;
      patch.화물타입 = ["파레트", "박스", "통"].includes(unit) ? unit : "";
    }
    if (v.혼적 === true) patch.혼적 = true;
    if (v.긴급 === true) patch.긴급 = true;
    if (v.전달사항) patch.전달사항 = v.전달사항;
    const memo = [v.메모추가, v.중량 && v.중량 !== v.차량톤수 ? `중량 ${v.중량}` : "", unknownToMemo && result?.unknown?.length ? result.unknown.join(" / ") : ""].filter(Boolean).join(" / ");
    // 회사별 학습 — 오더를 저장할 때(화면이 ai.commit을 부른다) 스캔 직후 값과 비교해 고친 칸만 기억한다
    ai?.setPending?.({ text: blocks[bi] || typed || "", scanned: scannedRef.current, applied: { ...v, ...patch } });
    // 등록 업체로 맞춘 경우 그 업체(담당자 여러 명이면 화면에서 담당자 선택창을 띄우게)
    const placeOf = (P) => places.find((p) => p.업체명 === v[`${P}명`]) || null;
    onApply(patch, memo, {
      pickupPlace: placeOf("상차지"), dropPlace: placeOf("하차지"),
      pickupMgrScanned: result?.fields?.상차지담당자 && !result.fields.상차지담당자.via,
      dropMgrScanned: result?.fields?.하차지담당자 && !result.fields.하차지담당자.via,
      dropRel, // 상차일이 스캔에 없을 때 화면의 상차일 기준으로 하차일을 맞추는 데 쓴다
      text: blocks[bi] || typed || "", // ⭐ 2026-11-06 스캔 원문(로지스웹 허브가 결제 방식 · 수수료를 원문에서 찾는다)
      structured: { ...v }, // ⭐ 2026-11-07 정리된 칸 전부(허브가 지급방식 · 중량 · 파레트 수를 쓴다)
      engine: { ocr: engine.ocr, ai: engine.used },
    });
  };

  // ── 화면 ──
  const issues = result ? [...result.issues] : [];
  ["상차지", "하차지"].forEach((P) => {
    const c = addrCheck[P];
    if (c?.st === "fail") issues.unshift({ field: `${P}주소`, level: "error", msg: `${P} 주소를 인식할 수 없습니다. 지도에 없는 주소예요(오타·잘못된 주소 확인)` });
    if (c?.st === "approx") issues.unshift({ field: `${P}주소`, level: "warn", msg: `${P} 주소는 ${c.area || "동네"}까지만 확인됩니다. 번지·건물번호를 확인하세요` });
    if (c?.st === "error") issues.push({ field: `${P}주소확인`, level: "info", msg: `${P} 주소를 지도로 확인하지 못했습니다(통신). 저장 시 다시 확인됩니다` });
  });
  const issueOf = (k) => issues.find((x) => x.field === k && x.level !== "info");
  // 노란 칸 — AI · 규칙 인식이 서로 다르거나 자신 없는 칸(사용자가 고치면 사라진다)
  const checkOf = (k) => !!result && needsCheck(result.fields[k]) && !touched.current.has(k) && vals[k] !== undefined && vals[k] !== "";
  const checkN = result ? GROUPS.reduce((n, g) => n + g.keys.filter(([k]) => checkOf(k)).length, 0) : 0;
  if (checkN > 0) issues.push({ field: "_check", level: "info", msg: `노란 칸 ${checkN}개는 확인이 필요한 칸이에요` });
  const editVal = (k, raw) => {
    touched.current.add(k);
    setVals((p) => ({ ...p, [k]: MONEY_KEYS.includes(k) ? raw.replace(/[^\d]/g, "") : /(담당자번호|연락처)$/.test(k) ? fmtPhone(raw) : raw }));
  };
  const precise = engine.used || engine.ocr === "vision";
  const errN = issues.filter((x) => x.level === "error").length;
  const warnN = issues.filter((x) => x.level === "warn").length;
  const srcLines = src?.type === "text" ? src.text.split("\n") : [];
  // 줄 역할 — 인식기는 오더 블록 기준 줄 번호로 돌려주므로 글자로 맞춰 찾는다(여러 건일 때도)
  const roleByText = React.useMemo(() => {
    const m = new Map();
    if (!result || !blocks[bi]) return m;
    blocks[bi].split("\n").forEach((ln, i) => { const r = result.roles[i]; if (r) m.set(ln.trim(), r); });
    return m;
  }, [result, blocks, bi]);
  const blockSet = React.useMemo(() => new Set((blocks[bi] || "").split("\n").map((x) => x.trim()).filter(Boolean)), [blocks, bi]);
  const roleOfText = (i, text) => roleByText.get(String(text ?? srcLines[i] ?? "").trim());
  const scanning = stage === "scanning";

  return createPortal(
    <div className="fixed inset-0 z-[2000000] flex items-center justify-center p-0 sm:p-5" style={{ background: "rgba(6,13,28,0.62)" }} onMouseDown={onClose}>
      <style>{`
        @keyframes osIn { from { opacity: 0; transform: translateY(10px) scale(.985) } to { opacity: 1; transform: none } }
        @keyframes osTag { from { opacity: 0; transform: translateX(-6px) } to { opacity: 1; transform: none } }
        @keyframes osPulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
      `}</style>
      <div className="w-full max-w-[1180px] h-full sm:h-[min(820px,92vh)] rounded-none sm:rounded-[26px] overflow-hidden flex flex-col bg-[#F4F6FA] shadow-[0_30px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
        style={{ animation: "osIn .28s cubic-bezier(.2,.9,.3,1.1) both" }} onMouseDown={(e) => e.stopPropagation()}>
        {/* 머리 */}
        <div className="relative px-4 sm:px-7 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 text-white shrink-0" style={{ background: "linear-gradient(120deg,#0B1428 0%,#0F1A30 45%,#1B2B4B 80%,#2D4C82 100%)" }}>
          <span className="absolute inset-0 opacity-[0.08] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="relative w-10 h-10 rounded-[12px] bg-white/10 ring-1 ring-white/20 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="2" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M3 12h18" /></svg>
          </div>
          <div className="relative min-w-0">
            <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>ORDER SCAN</div>
            <div className="text-[18px] font-black leading-tight">오더스캔</div>
          </div>
          <div className="relative ml-4 hidden md:flex items-center gap-2 text-[12px] font-bold text-white/60">
            <kbd className="px-2 h-6 inline-flex items-center rounded-md bg-white/10 ring-1 ring-white/15 text-white" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>Ctrl</kbd>+<kbd className="px-2 h-6 inline-flex items-center rounded-md bg-white/10 ring-1 ring-white/15 text-white" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>V</kbd>
            <span>글이나 캡처 이미지를 바로 붙여넣으세요</span>
          </div>
          <button onClick={onClose} className="relative ml-auto w-9 h-9 rounded-[11px] bg-white/10 hover:bg-white/20 text-white text-[16px]">✕</button>
        </div>

        {stage === "input" ? (
          // ── 붙여넣기 화면 ──
          <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-[1.15fr_1fr] gap-3 md:gap-5 p-3 md:p-6">
            <div className="relative rounded-[22px] border-2 border-dashed border-[#C9D2E0] bg-white flex flex-col items-center justify-center text-center px-5 md:px-8 py-6 md:py-0 hover:border-[#4B6CB7] transition"
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); readFile(e.dataTransfer.files?.[0]); }}>
              <div className="w-16 h-16 rounded-[18px] flex items-center justify-center shadow-[0_12px_26px_rgba(15,26,48,0.3)]" style={{ background: "linear-gradient(135deg,#0F1A30,#2D4C82)" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 12h6M9 16h4" /></svg>
              </div>
              <div className="mt-5 text-[20px] font-black text-[#0F1A30]"><span className="hidden md:inline">Ctrl + V 로 붙여넣기</span><span className="md:hidden">캡처 사진으로 스캔</span></div>
              <div className="mt-1.5 text-[13.5px] text-[#5B6B85] leading-relaxed">카톡·문자로 받은 <b className="text-[#0F1A30]">오더 글</b>도, 업체가 보낸 오더를 <b className="text-[#0F1A30]">캡처한 이미지</b>도<br />그대로 붙여넣으면 자동으로 스캔합니다</div>
              <div className="mt-5 flex gap-2">
                <button onClick={() => fileRef.current?.click()} className="h-10 px-4 rounded-[12px] border border-[#E3E8F0] bg-white text-[#0F1A30] text-[13px] font-bold hover:border-[#4B6CB7]">사진 · 이미지 선택</button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <div className="mt-4 text-[11.5px] text-[#9AA9C3]">이미지는 끌어다 놓아도 됩니다 · 여러 건이 한 번에 와도 오더별로 나눠 드려요</div>
              {err && <div className="mt-4 px-4 py-2 rounded-xl bg-[#FFF5F4] border border-[#F3D3CF] text-[12.5px] font-bold text-[#0F1A30]">! {err}</div>}
            </div>
            <div className="flex flex-col min-h-[260px] md:min-h-0 rounded-[22px] bg-white border border-[#E3E8F0] p-4 md:p-5">
              <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>TEXT</div>
              <div className="text-[15px] font-black text-[#0F1A30]">직접 입력 · 붙여넣기</div>
              <textarea data-os-input="1" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={"예)\n상차: ○○식품 인천 서구 ○○동 123-4\n하차: △△물류센터 14시까지\n5톤 냉동윙 6파레트 / 운임 32만"}
                className="mt-3 flex-1 min-h-0 w-full rounded-[14px] border border-[#E3E8F0] bg-[#F7F9FC] px-4 py-3 text-[13.5px] font-semibold text-[#0F1A30] leading-relaxed resize-none outline-none focus:bg-white focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10 placeholder:text-[#A7B3C6]" />
              <button onClick={() => startText(typed)} disabled={!typed.trim()} className="mt-3 h-12 rounded-[14px] text-white text-[14.5px] font-black disabled:opacity-40 shadow-[0_12px_24px_rgba(15,26,48,0.25)]" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>스캔하기</button>
            </div>
          </div>
        ) : (
          // ── 스캔 · 결과 화면 ──
          <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(0,34%)_minmax(0,1fr)] md:grid-rows-1 md:grid-cols-[1.1fr_1fr] gap-3 md:gap-5 p-3 md:p-6">
            {/* 왼쪽: 원문(글/이미지) + 스캔 빛줄 */}
            <div className="relative min-h-0 rounded-[22px] bg-white border border-[#E3E8F0] overflow-hidden flex flex-col">
              <div className="px-5 py-3 flex items-center gap-2 border-b border-[#EEF1F6] shrink-0">
                <span className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{src?.type === "image" ? "IMAGE" : "TEXT"}</span>
                <span className="text-[13.5px] font-black text-[#0F1A30]">{src?.type === "image" ? "캡처 이미지" : "붙여넣은 오더"}</span>
                {scanning && <span className="ml-auto flex items-center gap-1.5 text-[12px] font-bold text-[#4B6CB7]"><span className="w-1.5 h-1.5 rounded-full bg-[#4B6CB7]" style={{ animation: "osPulse 1s infinite" }} />{src?.type === "image" ? `${ocr.status}${ocr.pct ? ` ${ocr.pct}%` : ""}` : "스캔 중"}</span>}
                {!scanning && <button onClick={() => { setStage("input"); setResult(null); setSrc(null); setOcrLines([]); }} className="ml-auto h-8 px-3 rounded-[10px] border border-[#E3E8F0] text-[12px] font-bold text-[#3A4A66] hover:border-[#4B6CB7]">다시 붙여넣기</button>}
              </div>
              <div className="relative flex-1 min-h-0 overflow-auto">
                <div className="relative">
                  {src?.type === "image" ? (
                    <div className="relative">
                      <img src={src.url} alt="" className="w-full block" />
                      {/* 인식된 줄 상자 */}
                      {!scanning && ocrLines.map((l) => {
                        const role = roleOfText(l.i, l.text) || "기타";
                        const col = BOX_COLOR[role] || "#4B6CB7";
                        return (
                          <div key={l.i} className="absolute rounded-[4px]" style={{
                            left: `${(l.bbox.x0 / src.w) * 100}%`, top: `${(l.bbox.y0 / src.h) * 100}%`,
                            width: `${((l.bbox.x1 - l.bbox.x0) / src.w) * 100}%`, height: `${((l.bbox.y1 - l.bbox.y0) / src.h) * 100}%`,
                            border: `1.5px ${role === "미인식" ? "dashed" : "solid"} ${col}`, background: role === "미인식" ? "transparent" : `${col}14`, animation: "osTag .3s ease both",
                          }}>
                            <span className={`absolute -top-[15px] left-0 px-1.5 rounded-[4px] text-[9.5px] font-black whitespace-nowrap ${ROLE_STYLE[role] || ROLE_STYLE.기타}`}>{role}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-5 py-4 space-y-1.5">
                      {srcLines.map((ln, i) => {
                        const passed = !scanning || scanPos >= (i + 0.5) / Math.max(1, srcLines.length);
                        const role = roleOfText(i);
                        const otherBlock = blocks.length > 1 && ln.trim() && !blockSet.has(ln.trim());
                        return (
                          <div key={i} className={`flex items-start gap-2.5 min-h-[24px] rounded-[8px] px-2 py-1 transition-colors ${otherBlock ? "opacity-35" : ""} ${passed && role && role !== "미인식" && !otherBlock ? "bg-[#F2F6FC]" : ""}`}>
                            <span className="w-[54px] shrink-0 pt-0.5">
                              {passed && role && <span className={`inline-flex px-1.5 h-[18px] items-center rounded-[5px] text-[10px] font-black ${ROLE_STYLE[role] || ROLE_STYLE.기타}`} style={{ animation: "osTag .25s ease both" }}>{role}</span>}
                            </span>
                            <span className={`text-[13.5px] leading-[1.65] break-all ${!ln.trim() ? "h-3" : role === "미인식" && passed ? "text-[#9AA9C3] line-through decoration-[#C9D2E0]" : "text-[#0F1A30] font-semibold"}`}>{ln}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* 스캔 빛줄 */}
                  {scanning && (
                    <>
                      <div className="pointer-events-none absolute left-0 right-0 top-0" style={{ height: `${scanPos * 100}%`, background: "linear-gradient(180deg, rgba(75,108,183,0.02), rgba(75,108,183,0.10))" }} />
                      <div className="pointer-events-none absolute left-0 right-0 h-[3px]" style={{ top: `${scanPos * 100}%`, background: "linear-gradient(90deg, transparent, #8FB0F0 15%, #E6EEFC 50%, #8FB0F0 85%, transparent)", boxShadow: "0 0 18px 4px rgba(143,176,240,0.65)" }} />
                    </>
                  )}
                </div>
              </div>
              {/* 역할 범례 */}
              <div className="px-5 py-2.5 border-t border-[#EEF1F6] flex flex-wrap gap-1.5 shrink-0">
                {["상차", "하차", "시간", "차량", "화물", "운임", "미인식"].map((r) => <span key={r} className={`px-1.5 h-[18px] inline-flex items-center rounded-[5px] text-[10px] font-black ${ROLE_STYLE[r]}`}>{r}</span>)}
              </div>
            </div>

            {/* 오른쪽: 인식 결과 */}
            <div className="min-h-0 flex flex-col rounded-[22px] bg-white border border-[#E3E8F0] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#EEF1F6] shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>RESULT</span>
                  <span className="text-[13.5px] font-black text-[#0F1A30]">인식 결과</span>
                  {!scanning && engine.busy && (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-[#5B6B85]" data-testid="os-refining"><span className="w-1.5 h-1.5 rounded-full bg-[#4B6CB7]" style={{ animation: "osPulse 1s infinite" }} />내용을 정리하고 있어요</span>
                  )}
                  {!scanning && !engine.busy && precise && (
                    <span title={`글자 읽기: ${engine.ocr === "vision" ? "정밀 글자 인식" : engine.ocr === "tesseract" ? "기본 글자 인식" : "붙여넣은 글"} · 칸 정리: ${engine.used ? "AI 정리" : "기본 규칙"}`}
                      className="px-1.5 h-[18px] inline-flex items-center rounded-[5px] bg-[#EEF3FF] text-[#2D4C82] text-[10px] font-black" data-testid="os-precise">정밀 인식</span>
                  )}
                  {result && !scanning && (
                    <span className="ml-auto flex items-center gap-1.5 text-[11.5px] font-black" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
                      <span className="px-2 h-6 inline-flex items-center rounded-full bg-[#0F1A30] text-white">✓ {result.recognized}</span>
                      {warnN > 0 && <span className="px-2 h-6 inline-flex items-center rounded-full bg-[#E6EEFC] text-[#1B2B4B]">! {warnN}</span>}
                      {errN > 0 && <span className="px-2 h-6 inline-flex items-center rounded-full bg-white text-[#0F1A30] ring-1 ring-[#0F1A30]">✕ {errN}</span>}
                    </span>
                  )}
                </div>
                {blocks.length > 1 && (
                  <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11.5px] font-bold text-[#5B6B85]">오더 {blocks.length}건 발견</span>
                    {blocks.map((_, i) => (
                      <button key={i} onClick={() => switchBlock(i)} className={`h-7 px-3 rounded-[9px] text-[12px] font-black ${bi === i ? "bg-[#0F1A30] text-white" : "bg-[#F1F4F9] text-[#3A4A66]"}`}>{i + 1}번</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                {scanning && !result ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-[#5B6B85]">
                    <div className="w-12 h-12 rounded-full border-[3px] border-[#E3E8F0] border-t-[#0F1A30] animate-spin" />
                    <div className="mt-4 text-[13.5px] font-bold">{ocr.status || "글자를 읽고 있어요"}</div>
                    {ocr.pct > 0 && <div className="mt-2 w-48 h-1.5 rounded-full bg-[#EEF1F6] overflow-hidden"><div className="h-full bg-[#0F1A30] transition-all" style={{ width: `${ocr.pct}%` }} /></div>}
                  </div>
                ) : result && (
                  <>
                    {/* 확인할 점 */}
                    {!scanning && issues.length > 0 && (
                      <div className="rounded-[14px] border border-[#E3E8F0] bg-[#F7F9FC] px-4 py-3 space-y-1.5">
                        <div className="text-[11.5px] font-black text-[#0F1A30]">확인할 점</div>
                        {issues.map((x, i) => (
                          <div key={i} className="flex items-start gap-2 text-[12.5px] leading-snug">
                            <span className={`mt-[1px] w-4 h-4 shrink-0 rounded-full flex items-center justify-center text-[9.5px] font-black ${x.level === "error" ? "bg-[#0F1A30] text-white" : x.level === "warn" ? "bg-[#4B6CB7] text-white" : "bg-[#DCE6F7] text-[#1B2B4B]"}`}>{x.level === "error" ? "✕" : x.level === "warn" ? "!" : "i"}</span>
                            <span className={x.level === "info" ? "text-[#5B6B85]" : "text-[#0F1A30] font-bold"}>{x.msg}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {GROUPS.map((g, gi) => (
                      <div key={g.title} style={{ animation: `osTag .3s ease ${gi * 0.08}s both` }}>
                        <div className="flex items-baseline gap-2 mb-1.5">
                          <span className="text-[13px] font-black text-[#0F1A30]">{g.title}</span>
                          <span className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#9AA9C3]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{g.en}</span>
                          {(g.title === "상차" || g.title === "하차") && (() => {
                            const c = addrCheck[g.title === "상차" ? "상차지" : "하차지"];
                            if (!c) return null;
                            return <span className={`ml-auto text-[10.5px] font-black px-2 h-5 inline-flex items-center rounded-full ${c.st === "ok" ? "bg-[#0F1A30] text-white" : c.st === "checking" || c.st === "error" ? "bg-[#EEF1F6] text-[#5B6B85]" : c.st === "approx" ? "bg-[#E6EEFC] text-[#1B2B4B]" : "bg-white text-[#0F1A30] ring-1 ring-[#0F1A30]"}`}>
                              {c.st === "ok" ? `지도 확인됨 · ${c.area}` : c.st === "approx" ? `근사 위치 · ${c.area}` : c.st === "checking" ? "주소 확인 중…" : c.st === "fail" ? "없는 주소" : "확인 못함(통신)"}
                            </span>;
                          })()}
                        </div>
                        <div className="rounded-[14px] border border-[#EEF1F6] divide-y divide-[#F1F4F9]">
                          {g.keys.map(([k, label]) => {
                            const f = result.fields[k];
                            const has = vals[k] !== undefined && vals[k] !== "";
                            const iss = issueOf(k);
                            const st = !has ? "none" : f?.conf === "high" && !f?.via ? "ok" : "guess";
                            const chk = checkOf(k);
                            return (
                              <div key={k} className={chk ? "bg-[#FFF6D5]" : ""} data-check={chk ? "1" : undefined}>
                              <div className="flex items-center gap-2.5 px-3 py-1.5">
                                <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black ${iss ? (iss.level === "error" ? "bg-[#0F1A30] text-white" : "bg-[#4B6CB7] text-white") : st === "ok" ? "bg-[#0F1A30] text-white" : st === "guess" ? "bg-white text-[#0F1A30] ring-1 ring-[#0F1A30]" : "bg-[#F1F4F9] text-[#B4BFD0]"}`}>
                                  {iss ? (iss.level === "error" ? "✕" : "!") : st === "none" ? "–" : "✓"}
                                </span>
                                <span className="w-[66px] shrink-0 text-[12px] font-bold text-[#5B6B85] whitespace-nowrap">{label}</span>
                                <input value={MONEY_KEYS.includes(k) && vals[k] ? Number(String(vals[k]).replace(/[^\d]/g, "") || 0).toLocaleString() : (vals[k] === true ? "예" : vals[k] ?? "")}
                                  onChange={(e) => editVal(k, e.target.value)}
                                  placeholder={has ? "" : "인식 못함"}
                                  className={`flex-1 min-w-0 h-8 px-2 rounded-[8px] text-[13px] font-bold outline-none ${chk ? "bg-white/70 ring-1 ring-[#F2C94C] focus:bg-white" : "focus:bg-[#F2F6FC]"} ${has ? "text-[#0F1A30]" : "placeholder:text-[#C2CBD9] placeholder:font-semibold"}`} />
                                {chk ? <span className="shrink-0 text-[10px] font-black text-[#9A6B00] whitespace-nowrap">확인 필요</span>
                                  : f?.via ? <span className="shrink-0 text-[10px] font-bold text-[#4B6CB7] whitespace-nowrap hidden sm:inline">{f.via}</span> : st === "guess" ? <span className="shrink-0 text-[10px] font-bold text-[#9AA9C3]">추정</span> : null}
                              </div>
                              {/* 스캔한 글자와 다른 등록 업체로 맞춘 경우 — 원래 글자로 되돌리기 */}
                              {f?.scanned && vals[k] !== f.scanned && (
                                <div className="flex items-center gap-2 pl-[38px] pr-3 pb-2 -mt-0.5 text-[11px]">
                                  <span className="text-[#9AA9C3] truncate">스캔: {f.scanned}</span>
                                  <button onClick={() => { touched.current.add(k); setVals((p) => ({ ...p, [k]: f.scanned })); }} className="shrink-0 font-bold text-[#4B6CB7] underline underline-offset-2">스캔한 그대로 쓰기</button>
                                </div>
                              )}
                              {f?.scanned && vals[k] === f.scanned && f.value && (
                                <div className="flex items-center gap-2 pl-[38px] pr-3 pb-2 -mt-0.5 text-[11px]">
                                  <span className="text-[#9AA9C3] truncate">등록 업체: {f.value}</span>
                                  <button onClick={() => { touched.current.add(k); setVals((p) => ({ ...p, [k]: f.value })); }} className="shrink-0 font-bold text-[#4B6CB7] underline underline-offset-2">등록 업체로 되돌리기</button>
                                </div>
                              )}
                              {chk && f?.alt !== undefined && f.alt !== "" && String(f.alt) !== String(vals[k]) && (
                                <div className="flex items-center gap-2 pl-[38px] pr-3 pb-2 -mt-0.5 text-[11px]">
                                  <span className="text-[#7A6A3A] truncate">다르게 읽은 값: {MONEY_KEYS.includes(k) ? Number(f.alt || 0).toLocaleString() : f.alt === true ? "예" : String(f.alt)}</span>
                                  <button onClick={() => { touched.current.add(k); setVals((p) => ({ ...p, [k]: f.alt })); }} className="shrink-0 font-bold text-[#4B6CB7] underline underline-offset-2">이 값으로</button>
                                </div>
                              )}
                              {chk && f?.prev !== undefined && f.prev !== "" && String(f.prev) !== String(vals[k]) && (
                                <div className="flex items-center gap-2 pl-[38px] pr-3 pb-2 -mt-0.5 text-[11px]">
                                  <span className="text-[#7A6A3A] truncate">다르게 읽은 값: {MONEY_KEYS.includes(k) ? Number(f.prev || 0).toLocaleString() : String(f.prev)}</span>
                                  <button onClick={() => { touched.current.add(k); setVals((p) => ({ ...p, [k]: f.prev })); }} className="shrink-0 font-bold text-[#4B6CB7] underline underline-offset-2">이 값으로</button>
                                </div>
                              )}
                              {f?.suggest && vals[k] !== f.suggest.업체명 && (
                                <div className="flex items-center gap-2 pl-[38px] pr-3 pb-2 -mt-0.5 text-[11px]">
                                  <span className="text-[#5B6B85] truncate">등록 업체 '{f.suggest.업체명}' · {f.suggest.주소}</span>
                                  <button onClick={() => {
                                    const P = k.startsWith("상차") ? "상차지" : "하차지";
                                    setVals((p) => ({ ...p, [k]: f.suggest.업체명, [`${P}주소`]: f.suggest.주소 || p[`${P}주소`], [`${P}담당자`]: p[`${P}담당자`] || f.suggest.담당자, [`${P}담당자번호`]: p[`${P}담당자번호`] || f.suggest.담당자번호 }));
                                  }} className="shrink-0 h-6 px-2 rounded-md bg-[#0F1A30] text-white font-black">등록 업체로 바꾸기</button>
                                </div>
                              )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {/* 옵션·메모 */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[["혼적", "혼적"], ["긴급", "긴급"]].map(([k, l]) => (
                        <button key={k} onClick={() => setVals((p) => ({ ...p, [k]: !p[k] }))} className={`h-8 px-3 rounded-[10px] text-[12px] font-black ${vals[k] ? "bg-[#0F1A30] text-white" : "bg-[#F1F4F9] text-[#5B6B85]"}`}>{l}</button>
                      ))}
                      <button onClick={() => setVals((p) => ({ ...p, 운행유형: p.운행유형 === "왕복" ? "" : "왕복" }))} className={`h-8 px-3 rounded-[10px] text-[12px] font-black ${vals.운행유형 === "왕복" ? "bg-[#0F1A30] text-white" : "bg-[#F1F4F9] text-[#5B6B85]"}`}>왕복</button>
                    </div>
                    {vals.전달사항 !== undefined && (
                      <div>
                        <div className="flex items-baseline gap-2 mb-1.5">
                          <span className="text-[13px] font-black text-[#0F1A30]">기사 전달사항</span>
                          <span className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#9AA9C3]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>NOTICE</span>
                        </div>
                        <textarea value={vals.전달사항 || ""} onChange={(e) => setVals((p) => ({ ...p, 전달사항: e.target.value }))} rows={Math.min(8, String(vals.전달사항 || "").split("\n").length + 1)}
                          className="w-full rounded-[12px] border border-[#EEF1F6] bg-[#F7F9FC] px-3 py-2 text-[12.5px] font-semibold text-[#0F1A30] leading-relaxed outline-none focus:bg-white focus:border-[#4B6CB7]" />
                      </div>
                    )}
                    {vals.메모추가 && (
                      <div className="rounded-[12px] bg-[#F7F9FC] border border-[#EEF1F6] px-3 py-2 text-[12.5px] text-[#3A4A66]"><b className="text-[#0F1A30]">메모로 들어갈 내용</b> · {vals.메모추가}</div>
                    )}
                    {result.unknown.length > 0 && (
                      <div className="rounded-[12px] border border-dashed border-[#C9D2E0] px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-black text-[#5B6B85]">인식 못한 줄 {result.unknown.length}</span>
                          <label className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#3A4A66] cursor-pointer"><input type="checkbox" checked={unknownToMemo} onChange={(e) => setUnknownToMemo(e.target.checked)} />메모에 함께 넣기</label>
                        </div>
                        <div className="mt-1.5 space-y-0.5">{result.unknown.slice(0, 8).map((u, i) => <div key={i} className="text-[12px] text-[#9AA9C3] truncate">{u}</div>)}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="px-4 md:px-5 py-3 md:py-3.5 border-t border-[#EEF1F6] flex items-center gap-2 shrink-0">
                <span className="hidden md:block text-[11.5px] text-[#9AA9C3] leading-snug">칸을 눌러 바로 고칠 수 있어요<br />적용 후 저장 전에 한 번 더 확인하세요</span>
                <button onClick={onClose} className="ml-auto h-11 px-4 rounded-[13px] border border-[#E3E8F0] text-[#3A4A66] text-[13px] font-bold">취소</button>
                <button onClick={apply} disabled={!result || scanning} className="h-11 px-6 rounded-[13px] text-white text-[14px] font-black disabled:opacity-40 shadow-[0_10px_22px_rgba(15,26,48,0.28)]" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>{applyLabel}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>, document.body);
}

// 붙여넣은 글이 오더처럼 보이는지(배차관리 화면에서 입력칸 밖 Ctrl+V 때 팝업을 띄울지)
export function looksLikeOrder(text) {
  const t = String(text || "");
  if (t.length < 8 || t.length > 6000) return false;
  const hasLabels = /(상차|하차|출발|도착|납품|배송지|픽업)/.test(t);
  const addrCount = (t.match(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|[가-힣]+(?:시|구|군))\s*[가-힣]+(?:구|군|시|동|로|길|읍|면)/g) || []).length;
  return (hasLabels && (addrCount >= 1 || /\d+\s*(?:톤|파레|파렛|p)/i.test(t))) || addrCount >= 2;
}
