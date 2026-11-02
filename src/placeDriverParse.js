// ======================= src/placeDriverParse.js =======================
// ⭐ 2026-11-02 구글시트 → 상하차지·기사 뽑기(화면 없는 순수 함수 — SheetPlaceDriverImport.jsx에서 사용)
//  상하차지: ① 위쪽 오더표("구 분" + "비고" 제목줄) — 업체명 칸 + 비고(주소 담당자 직급 번호)를 나눔
//           ② 아래쪽 발주서표("납품처" + "주소" 제목줄) — 납품처/담당자/휴대전화/전화/주소 그대로
//  기사:    "차량번호" + "성명(기사명)" + "휴대전화(연락처)" 제목줄 아래 줄들
//  업체명·주소·담당자·전화번호만 뽑는다(그 외 글은 버림).

const cell = (v) => String(v ?? "").replace(/ /g, " ").trim();
export const normKey = (s) => String(s || "").replace(/[\s()（）[\]·.,\-_/]/g, "").toLowerCase();
const hasHangul = (s) => /[가-힣]/.test(s);

const PHONE_RE = /(0\d{1,2})[-.\s]?(\d{3,4})[-.\s]?(\d{4})(?!\d)/g;
export const fmtPhone = (s) => {
  const d = String(s || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("02")) return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : d.length === 10 ? `02-${d.slice(2, 6)}-${d.slice(6)}` : d;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return d;
};
const REGION_RE = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|충청|전북|전남|전라|경북|경남|경상|제주)/;
const TITLES = "부장|차장|과장|대리|주임|사원|팀장|실장|소장|센터장|대표|이사|상무|전무|반장|계장|매니저|선임|책임|점장|부점장|기사";
const NOT_NAME = new Set(["담당자", "담당", "이후", "제품", "생산분", "무라벨", "동일제조일자", "이내", "센터", "물류", "유통", "창고"]);
// 글 끝에 붙은 "이름 (직급)" 찾기
const NAME_TAIL = new RegExp(`(?:^|[\\s,(:：/])([가-힣]{2,4})(\\s*(?:${TITLES}))?[\\s,:：]*$`);

// "주소 이름 직급 010-…  이름 010-…" → { 주소, contacts:[{name, phone}] }
export function splitMemo(text) {
  const t = cell(text).replace(/\s+/g, " ");
  if (!t) return { 주소: "", contacts: [] };
  const phones = [...t.matchAll(PHONE_RE)];
  const contacts = [];
  let 주소 = "";
  const takeName = (seg) => {
    const m = seg.match(NAME_TAIL);
    if (!m || NOT_NAME.has(m[1])) return { name: "" };
    return { name: (m[1] + (m[2] ? ` ${m[2].trim()}` : "")).trim() };
  };
  if (!phones.length) {
    return { 주소: cleanAddr(t), contacts: [] };
  }
  let prevEnd = 0;
  phones.forEach((p, i) => {
    const seg = t.slice(prevEnd, p.index);
    const nm = takeName(seg);
    if (i === 0) {
      const nameAt = nm.name ? seg.lastIndexOf(nm.name.split(" ")[0]) : seg.length;
      주소 = cleanAddr(seg.slice(0, nameAt));
    }
    const phone = fmtPhone(p[0]);
    if (nm.name) contacts.push({ name: nm.name, phone });
    else if (contacts.length && !seg.trim().replace(/[,/]/g, "")) contacts[contacts.length - 1].phone += `, ${phone}`; // "이름010-… 031-…" 번호 두 개
    else contacts.push({ name: "", phone });
    prevEnd = p.index + p[0].length;
  });
  return { 주소, contacts };
}
function cleanAddr(s) {
  return cell(s).replace(/[\s(,:：/]*(담당자|담당)?[\s:：(]*$/, "").replace(/\(\s*$/, "").trim();
}

// 표 제목줄의 칸 번호 찾기
const findCol = (row, names) => row.findIndex((c) => { const n = normKey(c); return n && names.some((x) => n === x || (x.length >= 3 && n.includes(x))); });

// 한 탭(2차원 배열) → 상하차지 후보
export function parsePlacesFromGrid(grid, tab = "") {
  const out = [];
  const rows = grid.map((r) => (r || []).map(cell));
  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    // ② 발주서표
    const cName = findCol(r, ["납품처", "납품처명", "거래처명", "업체명", "상호"]);
    const cAddr = findCol(r, ["주소", "납품주소", "배송지주소"]);
    if (cName >= 0 && cAddr >= 0 && findCol(r, ["차량번호"]) < 0) {
      const cMgr = findCol(r, ["담당자", "담당자명"]);
      const cMob = findCol(r, ["휴대전화번호", "휴대전화", "휴대폰", "핸드폰", "휴대폰번호"]);
      const cTel = r.findIndex((c, i) => i !== cMob && ["전화번호", "전화", "연락처"].includes(normKey(c)));
      let blank = 0;
      for (let j = ri + 1; j < rows.length; j++) {
        const x = rows[j];
        if (findCol(x, ["납품처", "주소"]) >= 0 && findCol(x, ["주소"]) >= 0) break; // 다음 표
        const name = x[cName] || "";
        if (!name) { if (++blank >= 3) break; continue; }
        blank = 0;
        if (/^(합계|소계|총계|계)$/.test(name.replace(/\s/g, ""))) continue;
        const addr = cell(x[cAddr]);
        const phone = fmtPhone(cMob >= 0 && x[cMob] ? x[cMob] : cTel >= 0 ? x[cTel] : "");
        const mgr = cMgr >= 0 ? cell(x[cMgr]) : "";
        if (!addr && !mgr && !phone) continue;
        out.push({ 업체명: name, 주소: addr, contacts: mgr || phone ? [{ name: mgr, phone }] : [], __tab: tab, __row: j + 1, __from: "발주서" });
        ri = j;
      }
      continue;
    }
    // ① 오더표("구 분" … "비고") — 배차내역표(차량번호 칸 있음)는 제외
    const cGu = findCol(r, ["구분"]);
    const cMemo = findCol(r, ["비고"]);
    if (cGu >= 0 && cMemo > cGu && findCol(r, ["차량번호", "도착지"]) < 0) {
      let blank = 0;
      for (let j = ri + 1; j < rows.length; j++) {
        const x = rows[j];
        if (findCol(x, ["구분"]) >= 0 && findCol(x, ["비고"]) >= 0) break;
        const memo = x[cMemo] || "";
        const name = x[cGu + 1] && hasHangul(x[cGu + 1]) ? x[cGu + 1] : x[cGu] || "";
        if (!name && !memo) { if (++blank >= 3) break; continue; }
        blank = 0;
        if (!name || /^(합계|소계|총계|PLT)$/i.test(name.replace(/\s/g, ""))) continue;
        const sp = splitMemo(memo);
        if (!sp.주소 || !REGION_RE.test(sp.주소)) continue; // 주소가 없는 줄(시간·메모만)은 건너뜀
        out.push({ 업체명: name, 주소: sp.주소, contacts: sp.contacts, __tab: tab, __row: j + 1, __from: "오더표" });
      }
    }
  }
  return out;
}

// 같은 업체명+주소는 1건(담당자는 합침)
export function dedupePlaces(list) {
  const map = new Map();
  list.forEach((p) => {
    const k = `${normKey(p.업체명)}|${normKey(p.주소)}`;
    const cur = map.get(k);
    if (!cur) { map.set(k, { ...p, contacts: [...p.contacts], __dupCount: 1 }); return; }
    cur.__dupCount += 1;
    p.contacts.forEach((c) => {
      const same = cur.contacts.find((x) => normKey(x.name) === normKey(c.name) && (x.name || x.phone === c.phone));
      if (!same) cur.contacts.push(c);
      else if (!same.phone && c.phone) same.phone = c.phone;
    });
  });
  return [...map.values()];
}

// ---------------- 기사 ----------------
export const normPlate = (s = "") => String(s).replace(/\s+/g, "").toUpperCase();
const FULL_PLATE = /^([가-힣]{2})?\d{2,3}[가-힣]\d{4}$/;
export function parseDriversFromGrid(grid, tab = "") {
  const out = [];
  const rows = grid.map((r) => (r || []).map(cell));
  let cols = null;
  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    const cPlate = findCol(r, ["차량번호", "차번"]);
    const cName = findCol(r, ["성명", "기사명", "기사", "이름"]);
    if (cPlate >= 0 && cName >= 0) {
      cols = { cPlate, cName, cPhone: findCol(r, ["휴대전화", "휴대폰", "핸드폰", "연락처", "전화번호"]), cCarrier: findCol(r, ["운송업체", "운송사"]) };
      continue;
    }
    if (!cols) continue;
    const plate = normPlate(r[cols.cPlate]);
    if (!plate || !/\d{4}/.test(plate)) continue;
    const rawName = r[cols.cName] || "";
    const name = /^[가-힣]{2,5}$/.test(rawName.replace(/\s/g, "")) ? rawName.replace(/\s/g, "") : "";
    const phone = cols.cPhone >= 0 ? fmtPhone((r[cols.cPhone] || "").match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/)?.[0] || "") : "";
    out.push({
      차량번호: plate, 이름: name, 전화번호: phone,
      운송업체: cols.cCarrier >= 0 ? r[cols.cCarrier] || "" : "",
      __full: FULL_PLATE.test(plate), __tab: tab, __row: ri + 1,
    });
  }
  return out;
}
// 같은 차량번호는 1건 — 뒤쪽 탭(최근) 값 우선, 빈 칸은 앞 값으로 채움
export function dedupeDrivers(list) {
  const map = new Map();
  list.forEach((d) => {
    const cur = map.get(d.차량번호);
    if (!cur) { map.set(d.차량번호, { ...d, __dupCount: 1 }); return; }
    map.set(d.차량번호, {
      ...cur, ...d,
      이름: d.이름 || cur.이름, 전화번호: d.전화번호 || cur.전화번호, 운송업체: d.운송업체 || cur.운송업체,
      __dupCount: cur.__dupCount + 1,
    });
  });
  return [...map.values()];
}

// ---------------- 그림(캡처) 글자 읽기 결과 → 상하차지 (2026-11-03) ----------------
//  서버(sheetOcr)가 돌려준 단어+위치로 줄을 다시 만들고(같은 높이끼리), 단어 사이가 크게 벌어지면 칸이 바뀐 것으로 본다.
//  줄 모양 2가지:
//   ① 오더표:  [구분] 업체명  - - 18 18  주소 담당자 직급 010-…        (주소가 전화번호보다 앞)
//   ② 발주서:  납품처 담당자 [전화] 010-…  주소  수량…                 (전화번호가 주소보다 앞)
const ADDR_START = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|충청|전북|전남|전라|경북|경남|경상|제주)(특별시|광역시|특별자치시|특별자치도|도|시)?\s+\S+(시|군|구)/;
const CATEGORY = new Set(["온라인", "편의점", "에브리데이", "익스프레스", "대리점", "할인점", "특판", "총계", "합계", "소계"]);
export function wordsToLines(words) {
  const ws = (words || []).filter((w) => w && w.t).map((w) => ({ ...w, cy: (w.y0 + w.y1) / 2, h: Math.max(1, w.y1 - w.y0) })).sort((a, b) => a.cy - b.cy);
  const lines = [];
  ws.forEach((w) => {
    const L = lines[lines.length - 1];
    if (L && Math.abs(w.cy - L.cy) < Math.max(L.h, w.h) * 0.55) { L.ws.push(w); L.cy = (L.cy * (L.ws.length - 1) + w.cy) / L.ws.length; L.h = Math.max(L.h, w.h); }
    else lines.push({ cy: w.cy, h: w.h, ws: [w] });
  });
  return lines.map((L) => {
    const s = L.ws.sort((a, b) => a.x0 - b.x0);
    const cells = []; let cur = "";
    s.forEach((w, i) => {
      if (i === 0) { cur = w.t; return; }
      const gap = w.x0 - s[i - 1].x1;
      if (gap > L.h * 1.3) { cells.push(cur); cur = w.t; } // 칸이 바뀜
      else cur += (gap > L.h * 0.18 ? " " : "") + w.t;
    });
    if (cur) cells.push(cur);
    return cells.map((c) => c.trim()).filter(Boolean);
  });
}
const isNum = (c) => /^[\d,.\-\s]+$/.test(c);
export function parsePlacesFromOcrLines(lines, tab = "") {
  const out = [];
  lines.forEach((cells, li) => {
    const ai = cells.findIndex((c) => ADDR_START.test(c));
    if (ai < 0) return;
    const before = cells.slice(0, ai);
    const phoneBefore = before.some((c) => new RegExp(PHONE_RE.source).test(c));
    let name = ""; let 주소 = ""; let contacts = [];
    if (phoneBefore) {
      // ② 발주서: 납품처 | 담당자 | 전화 | 휴대 | 주소 | 수량…
      const txt = before.filter((c) => !isNum(c) || new RegExp(PHONE_RE.source).test(c));
      name = txt[0] || "";
      const mgr = txt.slice(1).find((c) => /^[가-힣]{2,4}(\s*[가-힣]{2,3})?$/.test(c) && !new RegExp(PHONE_RE.source).test(c)) || "";
      const phones = [...before.join(" ").matchAll(PHONE_RE)].map((m) => fmtPhone(m[0]));
      const mobile = phones.find((p) => p.startsWith("01")) || phones[0] || "";
      주소 = cells.slice(ai).filter((c) => !isNum(c)).join(" ").replace(/(\s+\d+\.\d+)+$/, "").trim(); // 끝에 붙은 수량(18.00 등)만 뺀다
      contacts = mgr || mobile ? [{ name: mgr, phone: mobile }] : [];
    } else {
      // ① 오더표: [구분] 업체명 | 수량… | 비고(주소 담당자 번호)
      const txt = before.filter((c) => !isNum(c) && /[가-힣A-Za-z]/.test(c));
      name = txt[txt.length - 1] || "";
      const sp = splitMemo(cells.slice(ai).join(" "));
      주소 = sp.주소; contacts = sp.contacts;
    }
    name = name.replace(/^\s*(\S+)\s+/, (m, w) => (CATEGORY.has(w) ? "" : m)).trim();
    if (!name || CATEGORY.has(name) || !주소) return;
    out.push({ 업체명: name, 주소, contacts, __tab: tab, __row: li + 1, __from: "그림" });
  });
  return out;
}
