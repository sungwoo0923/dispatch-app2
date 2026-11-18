// ======================= src/videoStudio.js =======================
// 🎬 2026-11-18 홍보팀 영상 작업실 — 기획안(functions/aiVideo.js)을 파일로 만드는 계산(화면 없이 · scripts/videoStudio.test.mjs 가 검사)
//  · toSrt      : 장면별 자막 줄 → SRT 자막 파일 글자(캡컷 · 프리미어 · 유튜브에 그대로 올린다)
//  · cueSheetCsv: 배경음악 큐시트(장면 · 시간 · 음악 · 볼륨 · 동작) → 엑셀에서 여는 CSV
//  · planText   : 기획안 전체를 글로(복사해서 메신저 · 메일로 공유)
const pad = (n, w = 2) => String(Math.max(0, Math.floor(n))).padStart(w, "0");
// 초 → "00:01:02,500"
export function srtTime(sec) {
  const ms = Math.round(Math.max(0, Number(sec) || 0) * 1000);
  return `${pad(ms / 3600000)}:${pad((ms % 3600000) / 60000)}:${pad((ms % 60000) / 1000)},${pad(ms % 1000, 3)}`;
}
// 초 → "0:05"
export const clock = (sec) => { const s = Math.max(0, Math.round(Number(sec) || 0)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };

// 장면 안 자막 줄을 장면 시간에 고르게 나눈다(줄이 없으면 내레이션을 문장으로 나눠 쓴다)
export function subtitleCues(scenes = []) {
  const out = [];
  for (const s of scenes || []) {
    const start = Number(s.start) || 0; const end = Math.max(start + 0.5, Number(s.end) || start + 1);
    let lines = (s.subtitles || []).map((x) => String(x || "").trim()).filter(Boolean);
    if (!lines.length && s.narration) lines = String(s.narration).split(/(?<=[.!?。]|[요다죠까])\s+/).map((x) => x.trim()).filter(Boolean);
    if (!lines.length) continue;
    const step = (end - start) / lines.length;
    lines.forEach((text, i) => out.push({ start: Math.round((start + step * i) * 1000) / 1000, end: Math.round((start + step * (i + 1)) * 1000) / 1000, text }));
  }
  return out;
}
export function toSrt(scenes = []) {
  return subtitleCues(scenes).map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n");
}

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function cueSheetCsv(plan) {
  const tracks = new Map((plan?.tracks || []).map((t) => [t.id, t]));
  const head = ["장면", "시작", "끝", "장면 이름", "음악", "분위기 · 장르", "BPM", "볼륨(0~100)", "음악 동작", "검색어"];
  const rows = (plan?.scenes || []).map((s) => {
    const t = tracks.get(s.bgm?.track) || {};
    return [s.no, clock(s.start), clock(s.end), s.title, s.bgm?.track || "", [t.mood, t.genre].filter(Boolean).join(" · "), t.bpm || "", s.bgm?.volume ?? "", s.bgm?.action || "", (t.keywords || []).join(" / ")];
  });
  return `﻿${[head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n")}\n`; // 엑셀에서 한글이 안 깨지게 BOM
}

export function planText(plan, input = {}) {
  if (!plan) return "";
  const tracks = plan.tracks || [];
  const L = [];
  L.push(`🎬 ${plan.title}`);
  L.push(`${input.kind || ""} · ${input.seconds || ""}초 · ${input.platform || ""}`.trim());
  L.push("");
  L.push(`[첫 2초] ${plan.hook}`);
  L.push(`[핵심] ${plan.summary}`);
  L.push(`[형식] ${plan.format}`);
  L.push("");
  L.push("■ 장면");
  (plan.scenes || []).forEach((s) => {
    L.push(`${s.no}. ${clock(s.start)}~${clock(s.end)} ${s.title}`);
    L.push(`   화면: ${s.visual}`);
    if (s.narration) L.push(`   내레이션: ${s.narration}`);
    if (s.subtitles?.length) L.push(`   자막: ${s.subtitles.join(" / ")}`);
    L.push(`   음악: ${s.bgm?.track || "-"} · 볼륨 ${s.bgm?.volume ?? "-"} · ${s.bgm?.action || ""}`);
  });
  L.push("");
  L.push("■ 배경음악");
  tracks.forEach((t) => L.push(`${t.id}. ${t.mood} · ${t.genre} · ${t.bpm}BPM — 검색어: ${(t.keywords || []).join(", ")} (${t.where})`));
  if (plan.captions?.length) { L.push(""); L.push("■ 올릴 때 설명 글"); plan.captions.forEach((c) => L.push(`[${c.platform}] ${c.text}`)); }
  if (plan.hashtags?.length) L.push(`\n${plan.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`);
  if (plan.thumbnails?.length) { L.push(""); L.push(`■ 썸네일 문구: ${plan.thumbnails.join(" / ")}`); }
  if (plan.tips?.length) { L.push(""); L.push("■ 촬영 · 편집 팁"); plan.tips.forEach((t) => L.push(`- ${t}`)); }
  return L.join("\n");
}

// 파일 내려받기(브라우저)
export function downloadText(name, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export const safeName = (s) => String(s || "영상").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "영상";
