// ======================= src/SheetImportPanel.jsx =======================
// ⭐ 구글시트(또는 엑셀) 배차일지 → 프로그램 오더 가져오기 (최고관리자 전용, 2026-10-23)
// 새 운송사가 쓰던 배차일지를 그대로 옮길 때 쓴다. 회사마다 시트 모양이 달라서
//  1) 시트 주소(또는 엑셀 파일) → 2) 가져올 탭 고르기 → 3) 칸 맞추기(제목줄 자동 짝맞춤, 직접 수정 가능)
//  4) 검사(날짜·거래처 누락, 이미 있는 오더 중복) → 5) 가져오기(진행률) 순서로 진행한다.
// 가져온 오더·자동 등록된 거래처/상하차지/기사에는 importBatchId를 남겨 [가져오기 취소]로 한 번에 지울 수 있다.
// 시트 읽기와 취소는 서버(functions/index.js sheetImport), 저장은 이 화면이 직접 한다.
import React from "react";
import * as XLSX from "xlsx";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import {
  collection, doc, getDoc, getDocs, query, where, writeBatch, setDoc, onSnapshot, orderBy, limit, serverTimestamp,
} from "firebase/firestore";

const SERVICE_EMAIL = "dispatch-app-9b92f@appspot.gserviceaccount.com";
const ORDER_COLL = "orders";

async function callApi(fn, body) {
  const token = await auth.currentUser?.getIdToken();
  let res;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("서버 응답을 받지 못했습니다. 서버 배포 여부를 확인하거나 잠시 후 다시 시도해 주세요.");
  }
  let data = {};
  try { data = await res.json(); } catch { /* 무시 */ }
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

// 프로그램 항목 ↔ 시트 제목 후보(회사마다 다르게 부르는 이름들)
const FIELDS = [
  { key: "상차일", req: true, syn: ["상차일", "날짜", "일자", "배차일", "운송일", "작업일", "상차일자"] },
  { key: "상차시간", syn: ["상차시간", "시간", "상차시각"] },
  { key: "하차일", syn: ["하차일", "도착일", "하차일자"] },
  { key: "하차시간", syn: ["하차시간", "도착시간"] },
  { key: "등록일", syn: ["등록일", "접수일"] },
  { key: "거래처명", req: true, syn: ["거래처명", "거래처", "화주", "화주명", "고객사", "고객"] },
  { key: "상차지명", syn: ["상차지명", "상차지", "출발지", "상차처"] },
  { key: "상차지주소", syn: ["상차지주소", "상하지주소", "상차주소", "출발지주소"] },
  { key: "하차지명", syn: ["하차지명", "하차지", "도착지", "하차처", "납품처"] },
  { key: "하차지주소", syn: ["하차지주소", "하차주소", "도착지주소"] },
  { key: "화물내용", syn: ["화물내용", "화물정보", "품목", "화물", "물품"] },
  { key: "차량종류", syn: ["차량종류", "차종"] },
  { key: "차량톤수", syn: ["차량톤수", "톤수", "톤"] },
  { key: "차량번호", syn: ["차량번호", "차번", "차량"] },
  { key: "이름", label: "기사명", syn: ["기사명", "이름", "기사", "성명", "기사이름"] },
  { key: "전화번호", syn: ["전화번호", "연락처", "기사연락처", "휴대폰", "핸드폰"] },
  { key: "청구운임", syn: ["청구운임", "운임", "청구금액", "청구액", "매출", "운송료"] },
  { key: "기사운임", syn: ["기사운임", "기사님요금", "기사요금", "지급운임", "지급액", "매입", "기사금액"] },
  { key: "지급방식", syn: ["지급방식", "선착불", "결제방식", "결제", "계산서"] },
  { key: "배차방식", syn: ["배차방식", "프로그램", "배차경로"] },
  { key: "배차상태", syn: ["배차상태", "상태"] },
  { key: "메모", syn: ["메모", "비고", "특이사항", "비고고유값고정값"] },
];
const norm = (s) => String(s || "").replace(/[\s()（）/·.\-_]/g, "").toLowerCase();

function autoMap(headers) {
  const map = {};
  const used = new Set();
  const H = headers.map((h) => ({ h, n: norm(h) })).filter((x) => x.n);
  // 1차: 정확히 같은 이름, 2차: 포함
  for (const pass of [0, 1]) {
    FIELDS.forEach((f) => {
      if (map[f.key]) return;
      const syn = f.syn.map(norm);
      const hit = H.find((x) => !used.has(x.h) && (pass === 0 ? syn.includes(x.n) : syn.some((s) => s.length >= 2 && x.n.includes(s))));
      if (hit) { map[f.key] = hit.h; used.add(hit.h); }
    });
  }
  return map;
}

// 오더가 들어 있는 탭처럼 보이나(날짜 칸과 거래처 칸이 둘 다 자동으로 연결되는 탭만 처음부터 체크)
const looksLikeOrders = (header) => { const m = autoMap(header); return !!(m.상차일 && m.거래처명); };

// 탭 이름에서 연·월 힌트("25년11월", "2026-01", "11월")
function tabHint(title) {
  const t = String(title || "");
  let m = t.match(/(\d{2,4})\s*년\s*(\d{1,2})\s*월/);
  if (m) return { y: m[1].length === 2 ? 2000 + +m[1] : +m[1], m: +m[2] };
  m = t.match(/(20\d{2})[.\-/](\d{1,2})/);
  if (m) return { y: +m[1], m: +m[2] };
  m = t.match(/(\d{1,2})\s*월/);
  if (m) return { y: new Date().getFullYear(), m: +m[1] };
  return null;
}
const pad = (n) => String(n).padStart(2, "0");
function parseDate(v, hint) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const ok = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : "");
  let m = s.match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return ok(2000 + +m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return ok(hint?.y || new Date().getFullYear(), +m[1], +m[2]);
  if (/^\d{5}(\.\d+)?$/.test(s)) { // 엑셀 날짜 일련번호
    const d = new Date(Math.round((+s - 25569) * 86400000));
    return ok(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  m = s.match(/^(\d{1,2})\s*일?$/);
  if (m && hint) return ok(hint.y, hint.m, +m[1]);
  return "";
}
const parseMoney = (v) => {
  const s = String(v ?? "").replace(/[^\d-]/g, "");
  return s && s !== "-" ? String(parseInt(s, 10)) : "";
};
const normPlate = (s = "") => String(s).replace(/\s+/g, "").toUpperCase();
function makePlaceKey(name = "") {
  return String(name).toLowerCase().replace(/\(주\)|㈜/g, "").replace(/\s+/g, "").replace(/[^\uAC00-\uD7A3a-z0-9]/gi, "").trim();
}
const dupKey = (r) => [r.상차일, norm(r.거래처명), norm(r.상차지명), norm(r.하차지명), normPlate(r.차량번호), parseMoney(r.청구운임)].join("|");
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2)}`);

const CARD = "bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";
const Head = ({ eyebrow, title, desc, right }) => (
  <div className="flex items-start gap-3 pb-4 mb-5 border-b border-[#EEF1F6]">
    <div className="flex-1 min-w-0">
      <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">{eyebrow}</div>
      <div className="mt-0.5 text-[18px] font-black text-[#0F1A30] tracking-tight">{title}</div>
      {desc && <div className="text-[13.5px] text-gray-500 mt-1">{desc}</div>}
    </div>
    {right}
  </div>
);
const fmtTime = (t) => { const ms = t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : 0; return ms ? new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"; };

export default function SheetImportPanel() {
  const [companies, setCompanies] = React.useState([]);
  const [company, setCompany] = React.useState("");
  const [source, setSource] = React.useState("sheet"); // sheet | excel
  const [url, setUrl] = React.useState("");
  const [book, setBook] = React.useState(null); // { title, tabs:[{title,rowCount,headerRow,header, rows?}] , source }
  const [picked, setPicked] = React.useState({}); // title -> headerRow(number) | undefined
  const [mapping, setMapping] = React.useState({});
  const [checked, setChecked] = React.useState(null); // 검사 결과
  const [opts, setOpts] = React.useState({ skipDup: true, register: true, from: "", to: "" }); // from/to = 상차일 기간(비우면 전체)
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [progress, setProgress] = React.useState(null); // { pct, step, done, result, error }
  const [batches, setBatches] = React.useState([]);
  const excelRef = React.useRef(null);

  React.useEffect(() => {
    callApi("companyReset", { action: "companies" }).then((d) => setCompanies(d.companies || [])).catch(() => {});
    return onSnapshot(query(collection(db, "importBatches"), orderBy("at", "desc"), limit(20)),
      (snap) => setBatches(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
  }, []);

  const resetFrom = (step) => {
    if (step <= 1) { setBook(null); setPicked({}); }
    if (step <= 2) setMapping({});
    setChecked(null); setErr("");
  };

  // 1) 시트 열기
  const openSheet = async () => {
    if (!url.trim()) return setErr("구글시트 주소를 붙여넣어 주세요.");
    resetFrom(1); setBusy("open");
    try {
      const d = await callApi("sheetImport", { action: "inspect", url: url.trim() });
      setBook({ ...d, source: "sheet" });
      const auto = {};
      d.tabs.forEach((t) => { if (looksLikeOrders(t.header)) auto[t.title] = t.headerRow; });
      setPicked(auto);
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };
  const openExcel = async (file) => {
    if (!file) return;
    resetFrom(1); setBusy("open");
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const tabs = wb.SheetNames.map((name) => {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" });
        let headerRow = 0, best = -1;
        rows.slice(0, 6).forEach((r, ri) => {
          const n = r.filter((c) => String(c || "").trim() && !/^[\d,.\-\s:/]+$/.test(String(c))).length;
          if (n > best) { best = n; headerRow = ri; }
        });
        return { title: name, rowCount: rows.length, headerRow, header: (rows[headerRow] || []).map((c) => String(c || "").trim()), allRows: rows };
      });
      setBook({ title: file.name, tabs, source: "excel" });
      const auto = {};
      tabs.forEach((t) => { if (t.rowCount > 1 && looksLikeOrders(t.header)) auto[t.title] = t.headerRow; });
      setPicked(auto);
    } catch (e) { setErr(`엑셀 파일을 읽지 못했습니다: ${e?.message || e}`); } finally { setBusy(""); }
  };

  const pickedTabs = book ? book.tabs.filter((t) => picked[t.title] !== undefined) : [];
  const allHeaders = React.useMemo(() => {
    const set = new Set();
    pickedTabs.forEach((t) => {
      const hr = picked[t.title];
      const header = book.source === "excel" ? (t.allRows[hr] || []).map((c) => String(c || "").trim()) : (hr === t.headerRow ? t.header : t.header);
      header.forEach((h) => h && set.add(h));
    });
    return [...set];
  }, [book, picked]); // eslint-disable-line react-hooks/exhaustive-deps

  // 탭을 고르면 칸 자동 맞추기(직접 바꾼 건 유지)
  React.useEffect(() => {
    if (!allHeaders.length) return;
    setMapping((cur) => {
      const auto = autoMap(allHeaders);
      const next = { ...auto };
      Object.entries(cur).forEach(([k, v]) => { if (v === "" || allHeaders.includes(v)) next[k] = v; });
      return next;
    });
  }, [allHeaders.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2) 값 읽기 + 검사
  const runCheck = async () => {
    if (!company) return setErr("가져올 운송사를 먼저 선택하세요.");
    const missing = FIELDS.filter((f) => f.req && !mapping[f.key]).map((f) => f.label || f.key);
    if (missing.length) return setErr(`필수 칸을 연결해 주세요: ${missing.join(", ")}`);
    setErr(""); setBusy("check"); setChecked(null);
    try {
      let tabs;
      if (book.source === "excel") {
        tabs = pickedTabs.map((t) => { const hr = picked[t.title]; return { title: t.title, header: (t.allRows[hr] || []).map((c) => String(c || "").trim()), rows: t.allRows.slice(hr + 1) }; });
      } else {
        const d = await callApi("sheetImport", { action: "read", url: url.trim(), tabs: pickedTabs.map((t) => ({ title: t.title, headerRow: picked[t.title] })) });
        tabs = d.tabs;
      }
      // 기존 오더(중복 확인용)
      const exist = await getDocs(query(collection(db, ORDER_COLL), where("companyName", "==", company)));
      const existKeys = new Set(exist.docs.map((x) => dupKey(x.data())));
      const out = [];
      let skipped = 0;
      tabs.forEach((t) => {
        const hint = tabHint(t.title);
        const idx = {};
        FIELDS.forEach((f) => { const h = mapping[f.key]; idx[f.key] = h ? t.header.indexOf(h) : -1; });
        t.rows.forEach((row, ri) => {
          const get = (k) => (idx[k] >= 0 ? String(row[idx[k]] ?? "").trim() : "");
          const vals = FIELDS.map((f) => get(f.key));
          if (!vals.some(Boolean)) { skipped += 1; return; } // 빈 줄
          const client = get("거래처명");
          if (/^(합계|소계|총계|총)/.test(client)) { skipped += 1; return; }
          const r = {};
          FIELDS.forEach((f) => { r[f.key] = get(f.key); });
          r.상차일 = parseDate(r.상차일, hint);
          r.하차일 = parseDate(r.하차일, hint) || r.상차일;
          r.등록일 = parseDate(r.등록일, hint) || r.상차일;
          r.청구운임 = parseMoney(r.청구운임);
          r.기사운임 = parseMoney(r.기사운임);
          const problems = [];
          if (!r.상차일) problems.push(`상차일 형식 확인("${get("상차일")}")`);
          if (!client) problems.push("거래처명 없음");
          if (!r.상차일 && !client && !r.차량번호) { skipped += 1; return; }
          const dup = existKeys.has(dupKey(r));
          out.push({ ...r, __tab: t.title, __row: ri + 1, __problems: problems, __dup: dup });
        });
      });
      setChecked({ rows: out, skipped, tabs: tabs.map((t) => t.title) });
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };

  // ⭐ 상차일 기간(2026-10-26) — 예: 10-27부터만 가져오기. 기간 밖 줄은 검사 결과에서 빼고 가져오지 않는다
  const inRange = (r) => !r.상차일 ? !(opts.from || opts.to) : ((!opts.from || r.상차일 >= opts.from) && (!opts.to || r.상차일 <= opts.to));
  const toImport = checked ? checked.rows.filter((r) => inRange(r) && !r.__problems.length && !(opts.skipDup && r.__dup)) : [];

  // 3) 저장
  const runImport = async () => {
    if (!toImport.length) return;
    if (!window.confirm(`${company}에 오더 ${toImport.length.toLocaleString()}건을 가져올까요?\n(알림은 보내지 않으며, 나중에 [가져오기 취소]로 한 번에 지울 수 있습니다)`)) return;
    const batchId = `imp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const me = auth.currentUser?.email || "";
    setProgress({ pct: 1, step: "준비 중" });
    try {
      await setDoc(doc(db, "importBatches", batchId), {
        companyName: company, by: me, at: serverTimestamp(), source: book.source, sheetTitle: book.title || "",
        spreadsheetId: book.source === "excel" ? "" : ((url.match(/\/d\/([a-zA-Z0-9_-]+)/) || [])[1] || ""),
        tabs: checked.tabs, status: "importing", count: 0,
      });
      const registered = { clients: 0, places: 0, drivers: 0 };
      if (opts.register) {
        setProgress({ pct: 3, step: "거래처·상하차지·기사 확인 중" });
        const cl = new Map(), pl = new Map(), dr = new Map();
        toImport.forEach((r) => {
          if (r.거래처명 && !r.거래처명.includes("/")) cl.set(r.거래처명, { 거래처명: r.거래처명 });
          [[r.상차지명, r.상차지주소], [r.하차지명, r.하차지주소]].forEach(([n, a]) => { const k = makePlaceKey(n); if (k && !pl.has(k)) pl.set(k, { 업체명: n, 주소: a || "" }); });
          const p = normPlate(r.차량번호);
          if (p && !p.includes("/") && !dr.has(p)) dr.set(p, { 차량번호: r.차량번호, 이름: r.이름 || "", 전화번호: r.전화번호 || "" });
        });
        const createMissing = async (coll, entries, make) => {
          let n = 0;
          for (let i = 0; i < entries.length; i += 300) {
            const chunk = entries.slice(i, i + 300);
            const snaps = await Promise.all(chunk.map(([id]) => getDoc(doc(db, coll, id)).catch(() => null)));
            const b = writeBatch(db);
            chunk.forEach(([id, v], j) => { if (snaps[j] && !snaps[j].exists()) { b.set(doc(db, coll, id), make(id, v)); n += 1; } });
            await b.commit();
          }
          return n;
        };
        const base = { companyName: company, importBatchId: batchId };
        registered.clients = await createMissing("clients", [...cl.entries()], (id, v) => ({ id, ...v, ...base }));
        setProgress({ pct: 6, step: "상하차지 등록 중" });
        registered.places = await createMissing("places", [...pl.entries()], (id, v) => ({ ...v, ...base, createdAt: serverTimestamp() }));
        setProgress({ pct: 9, step: "기사 등록 중" });
        registered.drivers = await createMissing("drivers", [...dr.entries()], (id, v) => ({ id, ...v, ...base, createdAt: serverTimestamp() }));
      }
      let done = 0;
      for (let i = 0; i < toImport.length; i += 400) {
        const b = writeBatch(db);
        toImport.slice(i, i + 400).forEach((r) => {
          const _id = newId();
          const rec = {};
          FIELDS.forEach((f) => { if (r[f.key] !== "" && r[f.key] != null) rec[f.key] = r[f.key]; });
          const status = ["배차중", "배차완료", "배차취소"].includes(r.배차상태) ? r.배차상태 : (normPlate(r.차량번호) ? "배차완료" : "배차중");
          b.set(doc(db, ORDER_COLL, _id), {
            ...rec, _id, 배차상태: status, companyName: company, 작성자: me,
            등록기기: book.source === "excel" ? "엑셀 가져오기" : "구글시트 가져오기", importBatchId: batchId,
          });
        });
        await b.commit();
        done = Math.min(toImport.length, i + 400);
        setProgress({ pct: 10 + Math.round((done / toImport.length) * 88), step: `오더 저장 중 ${done.toLocaleString()} / ${toImport.length.toLocaleString()}` });
      }
      const result = { count: done, skippedDup: checked.rows.filter((r) => r.__dup).length, errors: checked.rows.filter((r) => r.__problems.length).length, registered };
      await setDoc(doc(db, "importBatches", batchId), { status: "done", ...result }, { merge: true });
      // 홈 화면 합계를 다시 계산하라는 표시
      await setDoc(doc(db, "systemConfig", "dataVersion"), { [company]: serverTimestamp() }, { merge: true }).catch(() => {});
      // ⭐ 연결된 구글시트(배차현황)에서 가져왔으면 시트의 원래 줄과 바로 연결 — 이후 프로그램에서 수정·삭제하면 시트에도 반영
      if (book.source !== "excel") {
        setProgress({ pct: 99, step: "구글시트 줄과 연결 중" });
        try { const lk = await callApi("gsheetMine", { action: "linkImport", batchId }); result.linked = lk.linked; result.notLinked = lk.notFound?.length || 0; }
        catch { /* 다른 시트에서 가져온 경우 등 — 연결 없이 끝 */ }
      }
      setProgress({ pct: 100, step: "완료", done: true, result });
    } catch (e) {
      await setDoc(doc(db, "importBatches", batchId), { status: "error", error: String(e?.message || e) }, { merge: true }).catch(() => {});
      setProgress({ pct: 0, step: "", error: `가져오기 실패: ${e?.message || e} — 일부만 저장됐다면 아래 기록에서 [가져오기 취소]로 지울 수 있습니다.` });
    }
  };

  const linkBatch = async (b) => {
    setBusy(`link_${b.id}`);
    try {
      const r = await callApi("gsheetMine", { action: "linkImport", batchId: b.id });
      alert(`구글시트 줄과 ${r.linked}건 연결했습니다.${r.notFound?.length ? `\n시트에서 같은 줄을 못 찾은 ${r.notFound.length}건(날짜·거래처·상하차지가 다르거나 이미 연결됨):\n${r.notFound.slice(0, 15).join("\n")}` : ""}\n\n연결된 오더는 프로그램에서 수정·삭제하면 시트에도 반영됩니다.`);
    } catch (e) { alert(e.message); } finally { setBusy(""); }
  };
  const cancelBatch = async (b) => {
    if (!window.confirm(`${fmtTime(b.at)}에 가져온 ${b.companyName} 오더 ${(b.count || 0).toLocaleString()}건(자동 등록된 거래처·상하차지·기사 포함)을 모두 지울까요?`)) return;
    setBusy(`cancel_${b.id}`);
    try { const r = await callApi("sheetImport", { action: "cancel", batchId: b.id }); alert(`${r.removed.toLocaleString()}건을 지웠습니다.`); } catch (e) { alert(e.message); } finally { setBusy(""); }
  };

  const input = "w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-[14.5px] outline-none focus:border-[#1B2B4B] bg-white";
  const problems = checked ? checked.rows.filter((r) => r.__problems.length && inRange(r)) : [];
  const dups = checked ? checked.rows.filter((r) => r.__dup && inRange(r)) : [];
  const outOfRange = checked ? checked.rows.filter((r) => !inRange(r)).length : 0;

  return (
    <div className="space-y-6">
      {/* STEP 1 */}
      <section className={`${CARD} p-6`}>
        <Head eyebrow="STEP 1" title="가져올 곳" desc="새 운송사가 쓰던 배차일지(구글시트 또는 엑셀)를 이 프로그램 오더로 옮깁니다." />
        <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-5">
          <label className="block">
            <span className="text-[13px] font-semibold text-gray-600">가져올 운송사</span>
            <select value={company} onChange={(e) => { setCompany(e.target.value); setChecked(null); }} className={`mt-1.5 ${input} h-[46px] font-semibold`}>
              <option value="">운송사 선택</option>
              {companies.map((c) => <option key={c.name} value={c.name}>{c.name}{c.code ? ` (${c.code})` : ""}</option>)}
            </select>
          </label>
          <div>
            <div className="inline-flex rounded-xl bg-gray-100 p-1 mb-2">
              {[["sheet", "구글시트 주소"], ["excel", "엑셀 파일"]].map(([k, l]) => (
                <button key={k} onClick={() => { setSource(k); resetFrom(1); }} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold ${source === k ? "bg-white text-[#1B2B4B] shadow-sm" : "text-gray-500"}`}>{l}</button>
              ))}
            </div>
            {source === "sheet" ? (
              <>
                <div className="flex gap-2">
                  <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className={input} />
                  <button onClick={openSheet} disabled={busy === "open"} className="shrink-0 px-6 rounded-xl bg-[#1B2B4B] text-white text-[14.5px] font-bold disabled:opacity-60">{busy === "open" ? "여는 중…" : "시트 열기"}</button>
                </div>
                <div className="mt-2.5 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-4 py-3 text-[13px] text-gray-700 leading-relaxed">
                  먼저 그 시트의 <b>공유</b>에 아래 주소를 <b>뷰어</b>로 추가해 주세요(시트 내용은 바뀌지 않습니다).
                  <div className="mt-1.5 flex items-center gap-2">
                    <code className="px-2 py-1 rounded-md bg-white border border-[#E3E8F0] text-[12.5px] text-[#1B2B4B] break-all">{SERVICE_EMAIL}</code>
                    <button onClick={() => navigator.clipboard?.writeText(SERVICE_EMAIL)} className="shrink-0 px-2.5 py-1 rounded-md border border-gray-300 text-[12px] font-bold text-gray-600 bg-white">복사</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <button onClick={() => excelRef.current?.click()} disabled={busy === "open"} className="px-6 py-3 rounded-xl bg-[#1B2B4B] text-white text-[14.5px] font-bold disabled:opacity-60">{busy === "open" ? "읽는 중…" : "엑셀 파일 선택"}</button>
                <span className="text-[13px] text-gray-500">.xlsx · .xls · .csv</span>
                <input ref={excelRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { openExcel(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
            )}
          </div>
        </div>
        {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-semibold text-red-700">{err}</div>}
      </section>

      {/* STEP 2 탭 고르기 */}
      {book && (
        <section className={`${CARD} p-6`}>
          <Head eyebrow="STEP 2" title="가져올 탭" desc={`${book.title} — 오더가 들어 있는 탭(보통 월별 탭)을 고르세요. 제목줄 위치가 다르면 줄 번호를 바꿔주세요.`} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {book.tabs.map((t) => {
              const on = picked[t.title] !== undefined;
              const hr = on ? picked[t.title] : t.headerRow;
              const header = book.source === "excel" ? (t.allRows[hr] || []).map((c) => String(c || "").trim()) : t.header;
              return (
                <div key={t.title} className={`rounded-2xl border px-4 py-3 ${on ? "border-[#1B2B4B] bg-[#F5F8FD]" : "border-gray-200"}`}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={on} onChange={(e) => { setPicked((p) => { const n = { ...p }; if (e.target.checked) n[t.title] = t.headerRow; else delete n[t.title]; return n; }); setChecked(null); }} className="w-[18px] h-[18px]" />
                    <span className="text-[15px] font-bold text-[#0F1A30]">{t.title}</span>
                    <span className="text-[12.5px] text-gray-500">약 {Math.max(0, t.rowCount - 1).toLocaleString()}줄</span>
                    {on && (
                      <label className="ml-auto flex items-center gap-1.5 text-[12.5px] text-gray-600">제목줄
                        <select value={hr} onChange={(e) => { setPicked((p) => ({ ...p, [t.title]: +e.target.value })); setChecked(null); }} className="border border-gray-300 rounded-md px-1.5 py-0.5 bg-white" disabled={book.source !== "excel" && false}>
                          {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n + 1}번째 줄</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {header.filter(Boolean).slice(0, 14).map((h, i) => <span key={i} className="px-2 py-0.5 rounded-md bg-white border border-gray-200 text-[11.5px] text-gray-600">{h}</span>)}
                    {!header.filter(Boolean).length && <span className="text-[12px] text-gray-400">제목줄이 비어 있습니다</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {book.source === "sheet" && <div className="mt-3 text-[12.5px] text-gray-500">※ 구글시트는 처음 6줄 중 글자가 가장 많은 줄을 제목줄로 자동 선택합니다.</div>}
        </section>
      )}

      {/* STEP 3 칸 맞추기 */}
      {book && pickedTabs.length > 0 && (
        <section className={`${CARD} p-6`}>
          <Head eyebrow="STEP 3" title="칸 맞추기" desc="시트의 어떤 칸이 프로그램의 어떤 항목인지 연결합니다. 제목이 비슷하면 자동으로 연결되며, 다르면 직접 골라주세요."
            right={<button onClick={() => setMapping(autoMap(allHeaders))} className="px-3.5 py-2 rounded-xl border border-gray-300 text-[13px] font-bold text-gray-600 hover:bg-gray-50">자동으로 다시 맞추기</button>} />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-3">
                <span className="w-[86px] shrink-0 text-[14px] font-bold text-[#0F1A30]">{f.label || f.key}{f.req && <span className="text-red-500"> *</span>}</span>
                <select value={mapping[f.key] || ""} onChange={(e) => { setMapping((m) => ({ ...m, [f.key]: e.target.value })); setChecked(null); }}
                  className={`flex-1 min-w-0 border rounded-xl px-3 py-2 text-[14px] bg-white outline-none ${mapping[f.key] ? "border-[#1B2B4B]/40 text-[#0F1A30] font-semibold" : f.req ? "border-red-300 text-gray-400" : "border-gray-300 text-gray-400"}`}>
                  <option value="">— 가져오지 않음 —</option>
                  {allHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button onClick={runCheck} disabled={busy === "check"} className="px-7 py-3 rounded-xl bg-[#1B2B4B] text-white text-[15px] font-bold disabled:opacity-60">{busy === "check" ? "불러와서 검사 중…" : "불러와서 검사하기"}</button>
            <span className="text-[13px] text-gray-500">아직 저장하지 않습니다. 결과를 확인한 뒤 가져옵니다.</span>
          </div>
        </section>
      )}

      {/* STEP 4 검사 결과 */}
      {checked && (
        <section className={`${CARD} p-6`}>
          <Head eyebrow="STEP 4" title="검사 결과" desc={`${company}에 가져올 오더를 확인하세요.`} />
          {/* 상차일 기간 */}
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[#E3E8F0] bg-white px-4 py-3">
            <span className="text-[14px] font-extrabold text-[#0F1A30]">상차일 기간</span>
            <input type="date" value={opts.from} onChange={(e) => setOpts((o) => ({ ...o, from: e.target.value }))} className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold text-[#0F1A30]" />
            <span className="text-[#9AA9C3]">~</span>
            <input type="date" value={opts.to} onChange={(e) => setOpts((o) => ({ ...o, to: e.target.value }))} className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold text-[#0F1A30]" />
            {(opts.from || opts.to) && <button onClick={() => setOpts((o) => ({ ...o, from: "", to: "" }))} className="h-9 px-3 rounded-xl border border-[#E3E8F0] text-[13px] font-bold text-[#5B6B85]">전체</button>}
            <span className="text-[13px] text-[#7A879C]">비우면 전체 · 예) 2026-10-27 부터만 가져오려면 앞칸만 입력</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[["읽은 오더", checked.rows.length, "text-[#0F1A30]"], ["가져올 오더", toImport.length, "text-[#0F1A30]"], ["기간 밖(제외)", outOfRange, "text-[#7A879C]"], ["이미 있는 오더(중복)", dups.length, "text-[#3A4A66]"], ["확인 필요", problems.length, "text-[#3A4A66]"]].map(([k, v, c]) => (
              <div key={k} className="rounded-2xl bg-[#F5F8FD] border border-[#E3E8F0] px-4 py-3">
                <div className="text-[13px] font-semibold text-gray-500">{k}</div>
                <div className={`text-[26px] font-black tabular-nums ${c}`}>{v.toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-5 text-[14px] font-semibold text-gray-800">
            <label className="flex items-center gap-2"><input type="checkbox" checked={opts.skipDup} onChange={(e) => setOpts((o) => ({ ...o, skipDup: e.target.checked }))} className="w-[18px] h-[18px]" />이미 있는 오더는 건너뛰기</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={opts.register} onChange={(e) => setOpts((o) => ({ ...o, register: e.target.checked }))} className="w-[18px] h-[18px]" />거래처·상하차지·기사 자동 등록(없는 것만)</label>
            <span className="text-[13px] font-normal text-gray-500">빈 줄·합계 줄 {checked.skipped.toLocaleString()}개는 자동으로 뺐습니다.</span>
          </div>

          {problems.length > 0 && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <div className="text-[13.5px] font-bold text-red-700 mb-1.5">확인 필요 {problems.length}건 — 이 줄들은 가져오지 않습니다(칸 맞추기를 바꾸거나 시트를 고친 뒤 다시 검사)</div>
              <div className="max-h-[140px] overflow-y-auto text-[12.5px] text-red-700 space-y-0.5">
                {problems.slice(0, 200).map((r, i) => <div key={i}>[{r.__tab} {r.__row}번째 줄] {r.__problems.join(", ")}</div>)}
              </div>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-[#E3E8F0] overflow-x-auto max-h-[420px]">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0">
                <tr className="bg-[#1B2B4B] text-white">
                  {["탭", "상차일", "거래처명", "상차지", "하차지", "차량번호", "기사", "청구운임", "기사운임", "상태"].map((h) => <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF1F6]">
                {((opts.from || opts.to) ? checked.rows.filter(inRange) : checked.rows).slice(0, 150).map((r, i) => (
                  <tr key={i} className={r.__problems.length ? "bg-[#EEF3FB]" : r.__dup ? "bg-[#F5F8FD]" : ""}>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.__tab}</td>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">{r.상차일 || <span className="text-red-600">?</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.거래처명}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.상차지명}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.하차지명}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.차량번호}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.이름}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.청구운임 ? Number(r.청구운임).toLocaleString() : ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.기사운임 ? Number(r.기사운임).toLocaleString() : ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold">{!inRange(r) ? <span className="text-[#9AA9C3]">기간 밖</span> : r.__problems.length ? <span className="text-[#0F1A30] underline">확인 필요</span> : r.__dup ? <span className="text-[#7A879C]">중복</span> : <span className="text-[#0F1A30]">가져옴</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {checked.rows.length > 150 && <div className="mt-2 text-[12.5px] text-gray-500">미리보기는 처음 150줄만 보여줍니다.</div>}
          <button onClick={runImport} disabled={!toImport.length} className="mt-5 w-full py-3.5 rounded-xl bg-[#1B2B4B] text-white text-[15.5px] font-black hover:bg-[#243a60] disabled:opacity-40">
            {toImport.length ? `${company}에 오더 ${toImport.length.toLocaleString()}건 가져오기` : "가져올 오더가 없습니다"}
          </button>
        </section>
      )}

      {/* 가져오기 기록 */}
      <section className={`${CARD} overflow-hidden`}>
        <div className="px-6 pt-6"><Head eyebrow="HISTORY" title="가져오기 기록" desc="잘못 가져왔으면 [가져오기 취소]로 그 묶음(오더·자동 등록된 거래처/상하차지/기사)을 한 번에 지울 수 있습니다." /></div>
        {batches.length === 0 ? (
          <div className="text-[14px] text-gray-500 text-center pb-10">아직 가져온 기록이 없습니다.</div>
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-[#F5F8FD] text-gray-600 border-y border-[#E3E8F0]">
                {["운송사", "일시", "가져온 곳", "오더", "자동 등록", "상태", ""].map((h) => <th key={h} className="px-4 py-3 text-center font-bold whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF1F6]">
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3 text-center font-bold text-[#0F1A30]">{b.companyName}</td>
                  <td className="px-4 py-3 text-center text-gray-700 whitespace-nowrap">{fmtTime(b.at)}</td>
                  <td className="px-4 py-3 text-center text-gray-600 max-w-[260px] truncate">{b.source === "excel" ? "엑셀" : "구글시트"} · {b.sheetTitle}</td>
                  <td className="px-4 py-3 text-center font-semibold">{(b.count || 0).toLocaleString()}건</td>
                  <td className="px-4 py-3 text-center text-gray-600 whitespace-nowrap">{b.registered ? `거래처 ${b.registered.clients} · 상하차지 ${b.registered.places} · 기사 ${b.registered.drivers}` : "-"}</td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {b.status === "done" ? <span className="px-3 py-1 rounded-full text-[12.5px] font-bold bg-emerald-100 text-emerald-700">완료</span>
                      : b.status === "canceled" ? <span className="px-3 py-1 rounded-full text-[12.5px] font-bold bg-gray-100 text-gray-500">취소됨</span>
                        : b.status === "error" ? <span className="px-3 py-1 rounded-full text-[12.5px] font-bold bg-red-100 text-red-700">실패</span>
                          : <span className="px-3 py-1 rounded-full text-[12.5px] font-bold bg-amber-100 text-amber-700">진행 중</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {b.status === "done" && b.source !== "excel" && (
                      <button onClick={() => linkBatch(b)} disabled={busy === `link_${b.id}`} title="시트의 원래 줄과 연결 — 이후 프로그램에서 수정·삭제하면 시트에도 반영"
                        className="mr-2 px-3.5 py-1.5 rounded-xl bg-[#0F1A30] text-white text-[13px] font-bold disabled:opacity-60">
                        {busy === `link_${b.id}` ? "연결 중…" : b.gsheetLinked ? `시트 연결됨 ${b.gsheetLinked}건` : "시트와 연결"}
                      </button>
                    )}
                    {b.status !== "canceled" && <button onClick={() => cancelBatch(b)} disabled={busy === `cancel_${b.id}`} className="px-3.5 py-1.5 rounded-xl border border-red-300 text-red-600 text-[13px] font-bold hover:bg-red-50 disabled:opacity-60">{busy === `cancel_${b.id}` ? "지우는 중…" : "가져오기 취소"}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 진행률 창 */}
      {progress && (
        <div className="fixed inset-0 z-[9999] bg-[#0F1A30]/70 flex items-center justify-center p-4">
          <div className="w-full max-w-[460px] bg-white rounded-[22px] shadow-2xl overflow-hidden">
            <div className={`px-7 py-5 text-white ${progress.error ? "bg-red-600" : "bg-[#1B2B4B]"}`}>
              <div className="text-[11px] font-extrabold tracking-[0.22em] text-white/60">IMPORT</div>
              <div className="text-[19px] font-black mt-0.5">{company} 오더 가져오기{progress.done ? " 완료" : progress.error ? " 실패" : " 진행 중"}</div>
            </div>
            <div className="px-7 py-6">
              {!progress.error && <div className="text-[44px] font-black text-[#0F1A30] tabular-nums leading-none">{progress.pct}%</div>}
              <div className="mt-4 h-3 rounded-full bg-[#EEF1F6] overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${progress.error ? "bg-red-500" : progress.done ? "bg-emerald-500" : "bg-[#1B2B4B]"}`} style={{ width: `${progress.error ? 100 : Math.max(3, progress.pct)}%` }} />
              </div>
              <div className={`mt-3 text-[14px] font-semibold ${progress.error ? "text-red-600" : "text-gray-700"}`}>{progress.error || progress.step}</div>
              {progress.done && (
                <div className="mt-5 rounded-2xl bg-[#F5F8FD] border border-[#E3E8F0] px-5 py-4 text-[14px] text-[#0F1A30] leading-relaxed">
                  오더 <b>{progress.result.count.toLocaleString()}건</b>을 가져왔습니다.
                  {opts.register && <> 자동 등록: 거래처 {progress.result.registered.clients} · 상하차지 {progress.result.registered.places} · 기사 {progress.result.registered.drivers}</>}
                  {progress.result.linked != null && <> · 구글시트 줄 연결 {progress.result.linked}건{progress.result.notLinked ? `(못 찾음 ${progress.result.notLinked}건 — 아래 기록의 [시트와 연결]로 다시 시도)` : ""}</>}
                </div>
              )}
              {(progress.done || progress.error) && <button onClick={() => { setProgress(null); if (progress.done) setChecked(null); }} className="mt-5 w-full py-3.5 rounded-xl bg-[#1B2B4B] text-white text-[15px] font-bold">확인</button>}
              {!progress.done && !progress.error && <div className="mt-4 text-[12.5px] text-gray-500">창을 닫지 말고 기다려 주세요.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
