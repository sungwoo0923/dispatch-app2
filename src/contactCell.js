// ======================= src/contactCell.js =======================
// ☎ 2026-11-12 엑셀 "담당자번호" 칸에 번호 말고 다른 글자가 섞여 있을 때 나눠 담기
//  · "김해룡총괄: 010-8357-4918"      → 이름 김해룡총괄 · 번호 010-8357-4918
//  · "백종훈님(055-540-1360)"          → 이름 백종훈님 · 번호 055-540-1360
//  · "010-2600-6818 / 안전목 + 고임목" → 번호 010-2600-6818 · 나머지(안전목 + 고임목)는 메모로
//  · 번호가 두 개면 첫 번호만 담당자번호, 나머지는 메모로
//  ⚠ 다른 파일을 가져오지 않는다(node 테스트에서 그대로 읽음)
const PHONE_RX = /0\d{1,2}[-.\s)]?\d{3,4}[-.\s]?\d{4}/;
export function fmtTel(s) {
  const d = String(s || "").replace(/\D/g, "");
  if (/^01\d{8,9}$/.test(d)) return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (/^02\d{7,8}$/.test(d)) return d.length === 10 ? `02-${d.slice(2, 6)}-${d.slice(6)}` : `02-${d.slice(2, 5)}-${d.slice(5)}`;
  if (/^0\d{9,10}$/.test(d)) return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return String(s || "").trim();
}
export const isCleanPhone = (v) => /^[\d\-\s]*$/.test(String(v || ""));
const tidy = (s) => String(s || "").replace(/^[\s:：/·,()\-+]+|[\s:：/·,(\-+]+$/g, "").replace(/\(\s*\)/g, "").trim();

// 담당자 칸 · 담당자번호 칸 → { name, phone, extra(메모로 보낼 나머지) }
export function splitContactCell(nameCell, phoneCell) {
  let name = String(nameCell || "").trim();
  const raw = String(phoneCell || "").trim();
  if (!raw) return { name, phone: "", extra: "" };
  const m = raw.match(PHONE_RX);
  if (!m) return { name, phone: "", extra: raw }; // 번호가 아닌 글자만 있으면 메모로
  const before = tidy(raw.slice(0, m.index));
  const after = tidy(raw.slice(m.index + m[0].length));
  let extra = "";
  if (before && !name && before.length <= 14 && !/\d/.test(before)) name = before; else if (before) extra = before;
  if (after) extra = extra ? `${extra} / ${after}` : after;
  return { name, phone: fmtTel(m[0]), extra };
}

// ── 🧹 2026-11-12 [담당자 정리] — 이미 등록된 상하차지의 담당자 · 담당자번호 칸을 깨끗하게 ──
//  · 담당자번호: 번호만(하이픈 넣어서) — 섞여 있던 글자는 메모로
//  · 담당자: 이름만 — "님" · 직함(차장 · 과장 · 매니저 · 총괄 …)은 떼고, 이름이 아닌 글(주소 · 안내문)은 메모로
const TITLES = ["선임매니저", "책임매니저", "수석매니저", "부팀장", "팀장", "파트장", "센터장", "지점장", "공장장", "본부장", "부사장", "사장", "대표이사", "대표", "전무", "상무", "이사", "부장", "차장", "과장", "대리", "주임", "계장", "사원", "실장", "소장", "반장", "조장", "매니저", "총괄", "담당자", "담당", "기사", "프로", "선임", "책임", "수석"];
const NAME_RX = /^[가-힣]{2,5}$|^[A-Za-z][A-Za-z .]{1,20}$/;
export function cleanPersonName(raw) {
  const src = String(raw || "").replace(/\s+/g, " ").trim();
  if (!src) return { name: "", extra: "" };
  // 주소 · 안내문처럼 긴 글, 숫자 · 쌍점이 든 글은 이름이 아니다
  if (src.length > 16 || /\d|[:：]/.test(src)) return { name: "", extra: src };
  let t = src.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    const before = t;
    t = t.replace(/\s*님$/, "").trim();
    for (const k of TITLES) if (t.length > k.length + 1 && t.endsWith(k)) { t = t.slice(0, -k.length).trim(); break; }
    if (t === before) break;
  }
  if (NAME_RX.test(t)) return { name: t, extra: "" };
  const first = t.split(" ")[0];
  if (/^[가-힣]{2,4}$/.test(first) && t.split(" ").length <= 2) return { name: first, extra: "" }; // "홍길동 물류" 같은 두 낱말은 앞 낱말
  return { name: "", extra: src };
}
// 담당자 한 명 { name, phone } → 정리한 값 + 메모로 보낼 나머지
export function cleanContact(c = {}) {
  const sp = splitContactCell("", c.phone);
  const nm = cleanPersonName(c.name);
  let name = nm.name; const extras = [nm.extra];
  if (!name && sp.name) { const n2 = cleanPersonName(sp.name); name = n2.name; extras.push(n2.extra); } // 번호 칸 앞에 적힌 이름
  else if (sp.name && cleanPersonName(sp.name).name !== name) extras.push(sp.name);
  extras.push(sp.extra);
  return { name, phone: sp.phone, extra: extras.filter(Boolean).join(" / ") };
}
// 상하차지 한 곳 → { changed, contacts, 메모, before, after } (changed가 false면 고칠 것 없음)
export function cleanPlaceContacts(p = {}) {
  const raw = Array.isArray(p._rawContacts) && p._rawContacts.length ? p._rawContacts : Array.isArray(p.contacts) && p.contacts.length ? p.contacts : (p.담당자 || p.담당자번호 ? [{ name: p.담당자 || "", phone: p.담당자번호 || "", isPrimary: true }] : []);
  const memo0 = String(p.메모 || "").trim(); const extras = [];
  const cleaned = raw.map((c) => { const x = cleanContact(c); if (x.extra) extras.push(x.extra); return { ...c, name: x.name, phone: x.phone }; }).filter((c) => c.name || c.phone);
  if (cleaned.length && !cleaned.some((c) => c.isPrimary)) cleaned[0] = { ...cleaned[0], isPrimary: true };
  const add = extras.filter((e, i, a) => e && a.indexOf(e) === i && !memo0.includes(e));
  const 메모 = [memo0, ...add].filter(Boolean).join(" / ");
  const sig = (list) => JSON.stringify(list.map((c) => [String(c.name || "").trim(), String(c.phone || "").trim()]));
  const prim = (list) => list.find((c) => c.isPrimary) || list[0] || {};
  const changed = sig(raw) !== sig(cleaned) || 메모 !== memo0 || String(p.담당자 || "").trim() !== String(prim(cleaned).name || "") || String(p.담당자번호 || "").trim() !== String(prim(cleaned).phone || "");
  return { changed, contacts: cleaned, 메모, before: `${prim(raw).name || ""} | ${prim(raw).phone || ""}`.trim(), after: `${prim(cleaned).name || ""} | ${prim(cleaned).phone || ""}`.trim() };
}
