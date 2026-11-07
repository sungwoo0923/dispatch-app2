// ======================= src/SheetConnectHub.jsx =======================
// 🔗 2026-11-07 관리자메뉴 › 구글시트 연동 — 연결된 시트 목록 · 상태 · 마지막 동기화 · 오류 · [가져오기][보내기][매핑 수정]
//  예전 메뉴(구글시트 가져오기 · 구글시트 전송)를 한곳에 모았다. 돌캐 배차현황(기존 고정 연동)은 "기존 연동" 카드로 보이고 예전 서버 함수를 그대로 쓴다.
//  가져오기: 시트 읽기 → 미리보기(신규/변경/중복/오류 + 이유, 저장 안 함) → 가져오기(오더 저장 · importBatchId로 되돌리기 가능)
//  보내기: 서버가 연결한 칸만 써 준다(수식 칸 · 연결 안 한 칸은 안 씀). 프로그램과 시트가 둘 다 바뀐 줄은 마지막에 고친 쪽 값으로.
import React from "react";
import { auth, db } from "./firebase";
import { collection, doc, getDoc, getDocs, query, where, writeBatch, setDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { applyMerges, buildImportPreview, previewToCsv, tabsToRead, importedFields, fieldsHash, legacyDolcaeProfile, profileToBoardColumns } from "../functions/sheetProfileCore.mjs";
import { sheetConnectApi, useSheetProfiles, patchSheetProfile, removeSheetProfile, sheetDemo, isOfficeFileError } from "./sheetConnectApi";
import { profileToBoardForm } from "../functions/routeBoardMonth.mjs"; // 📅 날짜 칸 · 월별 탭 배차표
import OfficeSheetCard from "./OfficeSheetCard"; // 📗 엑셀(xlsx) 파일 안내
import SheetConnectWizard from "./SheetConnectWizard";
import SheetImportPanel from "./SheetImportPanel";
import GsheetMinePanel from "./GsheetMinePanel";
import CustomDatePicker from "./CustomDatePicker";
import { kpConfirm, kpAlert } from "./kpDialog";

const card = "rounded-[20px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";
const btn = "h-10 px-4 rounded-xl text-[14px] font-black whitespace-nowrap disabled:opacity-40";
const kst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const monthStart = () => `${kst().slice(0, 7)}-01`;
const fmt = (t) => { const ms = t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : typeof t === "number" ? t : 0; return ms ? new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"; };
const TAB_MODE = { single: "탭 하나", monthly: "월별 탭", all: "전체 탭 합치기" };
const STATUS_TONE = { 신규: "bg-[#E8F7EF] text-[#0F7A43]", 변경: "bg-[#EEF3FF] text-[#2D4C82]", 중복: "bg-[#F1F3F7] text-[#5B6B85]", 오류: "bg-[#FDECEC] text-[#C2352B]", 건너뜀: "bg-[#F7F7F8] text-[#9AA4B5]" };
const FIELD_LABEL = { 이름: "기사명", 화물내용: "화물정보" };
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2)}`);

function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ── 가져오기(미리보기 → 가져오기) ──
function ImportRunner({ profile, company, onClose }) {
  const [range, setRange] = React.useState({ from: "", to: "" }); // 비우면 전체(탭은 최대 24개까지 읽음)
  const [applyChanges, setApplyChanges] = React.useState(true);
  const [pv, setPv] = React.useState(null);
  const [filter, setFilter] = React.useState("all");
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const preview = async () => {
    setBusy("pv"); setMsg(""); setPv(null);
    try {
      const meta = await sheetConnectApi({ action: "tabs", url: profile.sheetUrl });
      const tabs = tabsToRead(profile, meta.tabs.map((t) => t.title), range);
      if (!tabs.length) throw new Error("가져올 탭이 없어요. 기간이나 탭 설정을 확인해 주세요.");
      const d = await sheetConnectApi({ action: "read", url: profile.sheetUrl, tabs });
      const sheetTabs = d.tabs.map((t) => ({ title: t.title, rows: applyMerges(t.rows, t.merges) }));
      let existing = [];
      if (!sheetDemo()) {
        const qs = [where("companyName", "==", company)];
        if (range.from) qs.push(where("상차일", ">=", range.from));
        if (range.to) qs.push(where("상차일", "<=", `${range.to}`));
        existing = (await getDocs(query(collection(db, "orders"), ...qs))).docs.map((x) => ({ id: x.id, ...x.data() }));
        const linked = (await getDocs(query(collection(db, "orders"), where("companyName", "==", company), where("시트프로필Id", "==", profile.id)))).docs.map((x) => ({ id: x.id, ...x.data() }));
        const ids = new Set(existing.map((x) => x.id)); linked.forEach((x) => { if (!ids.has(x.id)) existing.push(x); });
      }
      const p = buildImportPreview(profile, sheetTabs, existing, { sheetModifiedAt: Date.parse(d.modifiedTime || "") || 0, from: range.from, to: range.to });
      setPv({ ...p, tabs });
    } catch (e) { setMsg(e.message); } finally { setBusy(""); }
  };
  const toCreate = pv ? pv.rows.filter((r) => r.status === "신규") : [];
  const toUpdate = pv && applyChanges ? pv.rows.filter((r) => r.status === "변경") : [];
  const commit = async () => {
    if (!toCreate.length && !toUpdate.length) return;
    if (!(await kpConfirm(`신규 ${toCreate.length}건을 오더로 만들고, 변경 ${toUpdate.length}건을 고칠까요?\n가져온 오더는 기록에서 한 번에 되돌릴 수 있어요.`))) return;
    setBusy("go"); setMsg("");
    const fields = importedFields(profile);
    const batchId = `imp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const me = auth.currentUser?.email || "";
    const now = Date.now();
    try {
      if (sheetDemo()) { await new Promise((r) => setTimeout(r, 400)); }
      else {
        await setDoc(doc(db, "importBatches", batchId), { companyName: company, by: me, at: serverTimestamp(), source: "sheetProfile", sheetProfileId: profile.id, sheetTitle: profile.name, spreadsheetId: profile.spreadsheetId || "", tabs: pv.tabs, status: "importing", count: 0 });
        const ops = [
          ...toCreate.map((r) => ({ kind: "new", r })),
          ...toUpdate.map((r) => ({ kind: "upd", r })),
        ];
        for (let i = 0; i < ops.length; i += 400) {
          const b = writeBatch(db);
          ops.slice(i, i + 400).forEach(({ kind, r }) => {
            const link = { 시트프로필Id: profile.id, 시트키: r.key || "", _sheetHash: fieldsHash(r.rec, fields), _sheetSyncAt: now, _lastModified: now, _sheetRow: { tab: r.tab, row: r.rowNo } };
            if (kind === "new") {
              const _id = newId();
              b.set(doc(db, "orders", _id), { ...r.rec, _id, ...link, companyName: company, 작성자: me, 등록기기: "구글시트 연동", importBatchId: batchId, createdAt: serverTimestamp() });
            } else {
              const patch = {}; (r.changes || []).forEach((k) => { patch[k] = r.rec[k]; });
              if (patch.청구운임 != null || patch.기사운임 != null) patch.수수료 = r.rec.수수료;
              b.update(doc(db, "orders", r.match), { ...patch, ...link });
            }
          });
          await b.commit();
        }
        await setDoc(doc(db, "importBatches", batchId), { status: "done", count: toCreate.length, updated: toUpdate.length, errors: pv.counts.오류, dup: pv.counts.중복 }, { merge: true });
        await setDoc(doc(db, "systemConfig", "dataVersion"), { [company]: serverTimestamp() }, { merge: true }).catch(() => {});
      }
      await patchSheetProfile(profile.id, { lastImportAt: sheetDemo() ? Date.now() : serverTimestamp(), lastImport: { created: toCreate.length, updated: toUpdate.length, errors: pv.counts.오류, dup: pv.counts.중복, by: me, batchId }, lastError: "" });
      setMsg(`신규 ${toCreate.length}건 · 변경 ${toUpdate.length}건을 반영했어요.`);
      setPv(null);
    } catch (e) {
      setMsg(`가져오기 실패: ${e.message}`);
      await patchSheetProfile(profile.id, { lastError: String(e.message || e).slice(0, 300) }).catch(() => {});
    } finally { setBusy(""); }
  };
  const rows = pv ? pv.rows.filter((r) => filter === "all" || r.status === filter) : [];
  return (
    <div className="fixed inset-0 z-[95] bg-black/40 flex items-start justify-center overflow-auto p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${card} w-full max-w-[1180px] my-6 p-6`} data-testid="import-runner">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1"><div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">IMPORT</div><div className="text-[20px] font-black text-[#0F1A30]">{profile.name} 가져오기</div></div>
          <button onClick={onClose} className={`${btn} text-[#5B6B85]`}>닫기</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[14px] font-bold text-[#3A4A66]">상차일</span>
          <CustomDatePicker showIcon value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold" />
          <span className="text-[#9AA4B5]">~</span>
          <CustomDatePicker showIcon value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold" />
          <span className="text-[13px] text-[#9AA4B5]">비우면 전체</span>
          <label className="ml-2 flex items-center gap-1.5 text-[14px] font-bold text-[#3A4A66]"><input type="checkbox" checked={applyChanges} onChange={(e) => setApplyChanges(e.target.checked)} className="w-4 h-4 accent-[#1B2B4B]" />바뀐 줄도 반영</label>
          <button onClick={preview} disabled={!!busy} className={`${btn} ml-auto bg-[#0F1A30] text-white`}>{busy === "pv" ? "읽는 중…" : "미리보기(저장 안 함)"}</button>
        </div>
        {msg && <div className="mb-3 px-4 py-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] text-[14px] font-bold text-[#1B2B4B]">{msg}</div>}
        {pv && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {[["all", `전체 ${pv.rows.length}`], ...["신규", "변경", "중복", "오류", "건너뜀"].map((k) => [k, `${k} ${pv.counts[k] || 0}`])].map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} className={`h-9 px-3.5 rounded-full text-[13.5px] font-black ${filter === k ? "bg-[#0F1A30] text-white" : k === "all" ? "bg-[#F4F6F9] text-[#3A4A66]" : STATUS_TONE[k]}`}>{l}</button>
              ))}
              <button onClick={() => download(`${profile.name}_가져오기_보고서.csv`, previewToCsv(pv))} className={`${btn} h-9 ml-auto border border-[#DCE3EE] text-[#3A4A66]`}>오류 보고서 받기</button>
            </div>
            <div className="rounded-xl border border-[#E3E8F0] overflow-auto max-h-[440px]">
              <table className="w-full text-[14px]">
                <thead className="sticky top-0 bg-[#F7F9FC] text-[#5B6B85] text-[13px]"><tr><th className="px-3 py-2.5 text-left">탭 · 줄</th><th className="px-3 text-left">결과</th><th className="px-3 text-left">상차일</th><th className="px-3 text-left">거래처</th><th className="px-3 text-left">상차 → 하차</th><th className="px-3 text-left">차량</th><th className="px-3 text-right">청구</th><th className="px-3 text-left">이유</th></tr></thead>
                <tbody>
                  {rows.slice(0, 400).map((r, i) => (
                    <tr key={i} className="border-t border-[#EEF1F6]">
                      <td className="px-3 py-2 text-[13px] text-[#7A8AA6] whitespace-nowrap">{r.tab} · {r.rowNo}</td>
                      <td className="px-3"><span className={`px-2 py-0.5 rounded-md text-[12.5px] font-black ${STATUS_TONE[r.status]}`}>{r.status}</span></td>
                      <td className="px-3 tabular-nums whitespace-nowrap">{r.rec?.상차일 || ""}</td>
                      <td className="px-3 font-bold text-[#0F1A30] whitespace-nowrap">{r.rec?.거래처명 || ""}</td>
                      <td className="px-3 whitespace-nowrap">{[r.rec?.상차지명, r.rec?.하차지명].filter(Boolean).join(" → ")}</td>
                      <td className="px-3 whitespace-nowrap">{r.rec?.차량번호 || ""}</td>
                      <td className="px-3 text-right tabular-nums">{r.rec?.청구운임 ? Number(r.rec.청구운임).toLocaleString() : ""}</td>
                      <td className="px-3 text-[13px] text-[#5B6B85]">{(r.reasons || []).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-end gap-3">
              <span className="text-[13.5px] text-[#5B6B85]">계산열(#REF! · 수식) 값은 가져오지 않아요. 수수료는 프로그램이 계산해요.</span>
              <button onClick={commit} disabled={!!busy || (!toCreate.length && !toUpdate.length)} className={`${btn} bg-[#2D4C82] text-white px-6`}>{busy === "go" ? "저장 중…" : `가져오기 ${toCreate.length + toUpdate.length}건`}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── 보내기 ──
function ExportRunner({ profile, company, onClose }) {
  const [range, setRange] = React.useState({ from: monthStart(), to: kst() });
  const [res, setRes] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [office, setOffice] = React.useState(false); // 📗 엑셀(xlsx) 파일이면 보내기 대신 변환 안내
  const run = async (dryRun) => {
    if (!dryRun && !(await kpConfirm("연결한 칸만 시트에 써요. 수식 칸과 연결 안 한 칸은 그대로 둬요. 보낼까요?"))) return;
    setBusy(dryRun ? "dry" : "go"); setMsg("");
    try { setRes(await sheetConnectApi({ action: "export", profileId: profile.id, from: range.from, to: range.to, dryRun, company })); }
    catch (e) { if (isOfficeFileError(e)) setOffice(true); else setMsg(e.message); } finally { setBusy(""); }
  };
  return (
    <div className="fixed inset-0 z-[95] bg-black/40 flex items-start justify-center overflow-auto p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${card} w-full max-w-[720px] my-10 p-6`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1"><div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">EXPORT</div><div className="text-[20px] font-black text-[#0F1A30]">{profile.name}로 보내기</div></div>
          <button onClick={onClose} className={`${btn} text-[#5B6B85]`}>닫기</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[14px] font-bold text-[#3A4A66]">상차일</span>
          <CustomDatePicker showIcon value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold" />
          <span className="text-[#9AA4B5]">~</span>
          <CustomDatePicker showIcon value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold" />
        </div>
        <ul className="text-[13.5px] text-[#5B6B85] leading-relaxed mb-4 list-disc pl-5">
          <li>우리 회사가 만든 오더만 보내요. 배차표 · 고정노선 오더와 취소 오더는 빼요.</li>
          <li>시트에 있는 줄은 바뀐 칸만 고치고, 새 오더는 그 달 탭 표 끝에 넣어요. 수식 칸은 윗줄 수식을 이어 붙여요.</li>
          <li>시트에서 더 나중에 고친 줄은 건드리지 않아요. 가져오기로 받아 주세요.</li>
        </ul>
        {msg && <div className="mb-3 px-4 py-3 rounded-xl bg-[#FDECEC] text-[#C2352B] text-[14px] font-bold">{msg}</div>}
        {office && <OfficeSheetCard className="mb-3" onConvert={() => sheetConnectApi({ action: "convert", url: profile.sheetUrl, profileId: profile.id, company })} />}
        {res && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            {[[res.dryRun ? "고칠 줄" : "고친 줄", res.written], [res.dryRun ? "새로 넣을 줄" : "새로 넣은 줄", res.appended], ["보호해서 건너뛴 칸", res.protectedSkipped || 0], ["시트가 더 최근", res.sheetNewer || 0]].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-[#F7F9FC] border border-[#E3E8F0] px-3 py-2.5"><div className="text-[12.5px] font-bold text-[#7A8AA6]">{l}</div><div className="text-[20px] font-black text-[#0F1A30] tabular-nums">{v ?? 0}</div></div>
            ))}
            {res.newTabs?.length > 0 && <div className="col-span-full text-[13.5px] font-bold text-[#A35F00]">새 탭 {res.newTabs.join(", ")}{res.dryRun ? "을 만들어요" : "을 만들었어요"}</div>}
            {(res.notes || []).map((n) => <div key={n} className="col-span-full text-[13.5px] font-bold text-[#C2352B]">{n}</div>)}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={() => run(true)} disabled={!!busy} className={`${btn} border border-[#DCE3EE] text-[#3A4A66]`}>{busy === "dry" ? "확인 중…" : "미리보기"}</button>
          <button onClick={() => run(false)} disabled={!!busy} className={`${btn} bg-[#2D4C82] text-white px-6`}>{busy === "go" ? "보내는 중…" : "보내기"}</button>
        </div>
      </div>
    </div>
  );
}

export default function SheetConnectHub({ company, isTotalMaster }) {
  const list = useSheetProfiles(company);
  const [wizard, setWizard] = React.useState(null); // { initial } | null
  const [run, setRun] = React.useState(null); // { kind, profile }
  const [legacyOpen, setLegacyOpen] = React.useState("");
  const [moveOpen, setMoveOpen] = React.useState(false);

  // ⭐ 돌캐 배차현황(기존 고정 연동) → 시트 프로필로 자동 등록(보기 · 상태용 · 실제 전송은 예전 서버 함수)
  React.useEffect(() => {
    if (!isTotalMaster || company !== "돌캐" || sheetDemo() || !list) return;
    if (list.some((p) => p.id === "legacy_dolcae")) return;
    (async () => {
      const ref = doc(db, "sheetProfiles", "legacy_dolcae");
      const s = await getDoc(ref).catch(() => null);
      if (s && !s.exists()) await setDoc(ref, { ...legacyDolcaeProfile(), createdAt: serverTimestamp(), createdBy: "자동 이전" }).catch(() => {});
    })();
  }, [isTotalMaster, company, list]);

  const del = async (p) => {
    if (!(await kpConfirm(`'${p.name}' 연결을 지울까요? 시트와 오더는 그대로 남아요.`))) return;
    try { await removeSheetProfile(p.id); } catch (e) { kpAlert(e.message); }
  };
  // 📋 배차표 양식 만들기 — 시트 칸 순서 · 이름 그대로(고정노선 › 배차표에서 고칠 수 있음). 시트 자동 연동은 꺼 둔다(배차일지 시트는 날짜 탭이 아니라서)
  const [board, setBoard] = React.useState(null); // { profile, columns }
  const makeBoard = async () => {
    const { profile: p, columns, tabMode = "", tabPattern = null, sheetTab = "" } = board;
    if (!columns.some((c) => c.field === "하차지명")) return kpAlert("하차지명 칸이 없어 배차표를 만들 수 없어요. 매핑 수정에서 하차지명을 연결해 주세요.");
    try {
      if (!sheetDemo()) await addDoc(collection(db, "routeBoards"), { companyName: company, name: p.name, client: "", dropOffset: 0, payMethod: "", sheetUrl: p.sheetUrl || "", sheetProfileId: p.id, autoSync: false, groups: [{ name: "기본", 상차지명: "", 상차지주소: "", defaults: [] }], columns: JSON.parse(JSON.stringify(columns)), tabMode, tabPattern, sheetTab, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" });
      setBoard(null);
      kpAlert(`'${p.name}' 배차표 양식을 만들었어요. 지입차관리 › 고정노선 › 배차표에서 고칠 수 있어요.`);
    } catch (e) { kpAlert(`만들기 실패: ${e.message}`); }
  };
  const status = (p) => {
    if (p.lastError) return { t: "오류", c: "bg-[#FDECEC] text-[#C2352B]" };
    if (p.lastImportAt || p.lastExportAt) return { t: "연결됨", c: "bg-[#E8F7EF] text-[#0F7A43]" };
    return { t: "준비됨", c: "bg-[#EEF3FF] text-[#2D4C82]" };
  };
  const profiles = list || [];

  return (
    <div className="space-y-5" data-testid="sheet-hub">
      <section className={`${card} p-6`}>
        <div className="flex items-start gap-3 pb-4 mb-4 border-b border-[#EEF1F6]">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">GOOGLE SHEETS</div>
            <div className="mt-0.5 text-[19px] font-black text-[#0F1A30]">구글시트 연동</div>
            <div className="text-[14px] text-[#5B6B85] mt-1">쓰던 배차일지 시트를 그대로 연결해요. 칸 이름 · 탭 모양이 달라도 자동으로 맞춰요.</div>
          </div>
          <button onClick={() => setWizard({ initial: null })} className={`${btn} h-11 px-5 bg-[#0F1A30] text-white`} data-testid="new-sheet">새 시트 연결</button>
        </div>
        {list === null ? <div className="py-10 text-center text-[14px] text-[#9AA4B5]">불러오는 중…</div> : !profiles.length ? (
          <div className="py-12 text-center">
            <div className="text-[16px] font-black text-[#0F1A30]">아직 연결된 시트가 없어요</div>
            <div className="text-[14px] text-[#7A8AA6] mt-1">시트 주소만 붙여넣으면 탭 · 머리줄 · 칸을 찾아 드려요.</div>
          </div>
        ) : (
          <div className="rounded-xl border border-[#E3E8F0] overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="bg-[#F7F9FC] text-[#5B6B85] text-[13px] whitespace-nowrap"><tr><th className="px-4 py-3 text-left">시트</th><th className="px-3 text-left">탭</th><th className="px-3 text-left">상태</th><th className="px-3 text-left">마지막 가져오기</th><th className="px-3 text-left">마지막 보내기</th><th className="px-3 text-right"></th></tr></thead>
              <tbody>
                {profiles.map((p) => {
                  const st = status(p); const legacy = p.engine === "legacy-dolcae";
                  return (
                    <React.Fragment key={p.id}>
                      <tr className="border-t border-[#EEF1F6] align-top">
                        <td className="px-4 py-3">
                          <div className="font-black text-[#0F1A30] flex items-center gap-2">{p.name}{legacy && <span className="px-2 py-0.5 rounded-md bg-[#FFF6E5] text-[#A35F00] text-[12px] font-black">기존 연동</span>}</div>
                          <a href={p.sheetUrl} target="_blank" rel="noreferrer" className="text-[12.5px] text-[#4B6CB7] font-semibold break-all">시트 열기</a>
                          <span className="text-[12.5px] text-[#9AA4B5] ml-2">칸 {p.columns?.filter((c) => c.mode === "data").length || 0}개 연결 · 계산열 {p.columns?.filter((c) => c.mode === "calc").length || 0}개 보호</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">{TAB_MODE[p.tabMode] || "-"}{p.tabMode === "monthly" && p.tabPattern?.sample ? <span className="text-[#9AA4B5] text-[12.5px]"> ({p.tabPattern.sample})</span> : p.tabs?.length ? <span className="text-[#9AA4B5] text-[12.5px]"> ({p.tabs.slice(0, 2).join(", ")})</span> : null}</td>
                        <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-md text-[12.5px] font-black ${st.c}`}>{st.t}</span>{p.lastError && <div className="text-[12.5px] text-[#C2352B] mt-1 max-w-[260px]">{p.lastError}</div>}</td>
                        <td className="px-3 py-3 text-[13px] text-[#3A4A66] whitespace-nowrap">{fmt(p.lastImportAt)}{p.lastImport && <div className="text-[12.5px] text-[#7A8AA6]">신규 {p.lastImport.created} · 변경 {p.lastImport.updated}</div>}</td>
                        <td className="px-3 py-3 text-[13px] text-[#3A4A66] whitespace-nowrap">{fmt(p.lastExportAt)}{p.lastExport && <div className="text-[12.5px] text-[#7A8AA6]">고침 {p.lastExport.written} · 새 줄 {p.lastExport.appended}</div>}</td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1.5">
                            {legacy ? (isTotalMaster ? (
                              <>
                                <button onClick={() => setLegacyOpen(legacyOpen === "send" ? "" : "send")} className={`${btn} h-9 border border-[#DCE3EE] text-[#2D4C82]`}>보내기</button>
                                <button onClick={() => setLegacyOpen(legacyOpen === "import" ? "" : "import")} className={`${btn} h-9 border border-[#DCE3EE] text-[#2D4C82]`}>가져오기</button>
                              </>
                            ) : <span className="text-[12.5px] text-[#9AA4B5]">최고관리자가 관리해요</span>) : (
                              <>
                                <button onClick={() => setRun({ kind: "import", profile: p })} className={`${btn} h-9 bg-[#0F1A30] text-white`}>가져오기</button>
                                <button onClick={() => setRun({ kind: "export", profile: p })} className={`${btn} h-9 border border-[#DCE3EE] text-[#2D4C82]`}>보내기</button>
                                <button onClick={() => setWizard({ initial: p })} className={`${btn} h-9 border border-[#DCE3EE] text-[#3A4A66]`}>매핑 수정</button>
                                <button onClick={() => setBoard({ profile: p, ...profileToBoardForm(p, profileToBoardColumns(p)) })} className={`${btn} h-9 border border-[#DCE3EE] text-[#3A4A66]`}>배차표 양식</button>
                                <button onClick={() => del(p)} className={`${btn} h-9 text-[#C2352B]`}>삭제</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {legacy && isTotalMaster && legacyOpen && (
                        <tr><td colSpan={6} className="px-4 pb-4">{legacyOpen === "send" ? <GsheetMinePanel /> : <SheetImportPanel />}</td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isTotalMaster && (
        <section className={`${card} p-5`}>
          <button onClick={() => setMoveOpen((v) => !v)} className="w-full flex items-center gap-3 text-left">
            <div className="flex-1"><div className="text-[15.5px] font-black text-[#0F1A30]">다른 운송사 배차일지 옮기기</div><div className="text-[13.5px] text-[#7A8AA6]">최고관리자 전용 · 새 운송사가 쓰던 시트나 엑셀을 한 번에 옮겨요</div></div>
            <span className="text-[13.5px] font-black text-[#2D4C82]">{moveOpen ? "접기" : "열기"}</span>
          </button>
          {moveOpen && <div className="mt-4"><SheetImportPanel /></div>}
        </section>
      )}

      {board && (
        <div className="fixed inset-0 z-[95] bg-black/40 flex items-start justify-center overflow-auto p-4" onMouseDown={(e) => e.target === e.currentTarget && setBoard(null)}>
          <div className={`${card} w-full max-w-[760px] my-10 p-6`} data-testid="board-from-profile">
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">ROUTE BOARD</div>
            <div className="text-[20px] font-black text-[#0F1A30] mb-1">배차표 양식 만들기</div>
            <div className="text-[14px] text-[#5B6B85] mb-4">‘{board.profile.name}’ 칸 순서 · 이름 그대로 만들어요. 계산열은 빼요. 만든 뒤 배차표에서 고칠 수 있어요.</div>
            <div className="rounded-xl border border-[#E3E8F0] overflow-auto max-h-[420px]">
              <table className="w-full text-[14px]">
                <thead className="sticky top-0 bg-[#F7F9FC] text-[#5B6B85] text-[13px]"><tr><th className="px-3 py-2.5 text-left w-12">#</th><th className="px-3 text-left">칸 이름</th><th className="px-3 text-left">종류</th><th className="px-3 text-left">프로그램 칸</th></tr></thead>
                <tbody>
                  {board.columns.map((c, i) => (
                    <tr key={c.id} className="border-t border-[#EEF1F6]"><td className="px-3 py-2 text-[#9AA4B5] font-black">{i + 1}</td><td className="px-3 font-black text-[#0F1A30]">{c.label}</td><td className="px-3">{{ field: "프로그램 칸", no: "순번(자동)", extra: "참고(보관)", date: "날짜(월별 탭)" }[c.kind] || c.kind}</td><td className="px-3 text-[#2D4C82] font-bold">{c.field ? (FIELD_LABEL[c.field] || c.field) : "-"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setBoard(null)} className={`${btn} border border-[#DCE3EE] text-[#3A4A66]`}>취소</button>
              <button onClick={makeBoard} className={`${btn} bg-[#2D4C82] text-white px-6`}>양식 만들기</button>
            </div>
          </div>
        </div>
      )}
      {wizard && <SheetConnectWizard company={company} initial={wizard.initial} onClose={() => setWizard(null)} onSaved={() => setWizard(null)} />}
      {run?.kind === "import" && <ImportRunner profile={run.profile} company={company} onClose={() => setRun(null)} />}
      {run?.kind === "export" && <ExportRunner profile={run.profile} company={company} onClose={() => setRun(null)} />}
    </div>
  );
}
