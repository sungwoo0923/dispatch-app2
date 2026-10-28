// ======================= src/BlindMinePanel.jsx =======================
// ⭐ 블라인드 모드(2026-10-26, 최고관리자 전용)
//  ① [블라인드 모드 켜기] — 켜져 있는 동안 최고관리자가 새로 등록하는 오더는 전부 블라인드로 저장(PC·모바일)
//  ② [일괄 블라인드] — 지정 날짜(상차일) 이후 내가 등록한 오더를 한 번에 블라인드 / 해제
//  ③ [등록자 바꾸기](2026-10-28) — 다른 계정(실수로 일반 관리자 아이디 등)으로 등록한 오더를 날짜별로 골라
//     등록자를 최고관리자(나)로 바꾸고 블라인드로 돌린다. 미리보기로 대상 확인 후 실행.
//  - 블라인드 오더는 최고관리자 외 누구의 배차 목록에도 보이지 않는다(기존 블라인드와 동일).
import React from "react";
import { auth, db } from "./firebase";
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where, writeBatch } from "firebase/firestore";
import { useCompanyStaff } from "./InternalMail";

const CARD = "bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";
const CFG = () => doc(db, "siteConfig", "blindMine");
// 오늘(한국시간) YYYY-MM-DD
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
// 등록 시각(createdAt: 숫자·Timestamp·문자) → 한국 날짜
const kstDayOf = (v) => {
  const ms = v?.toMillis ? v.toMillis() : typeof v === "number" ? v : v?.seconds ? v.seconds * 1000 : Date.parse(v || "");
  return Number.isFinite(ms) && ms > 0 ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) : "";
};
const regDayOf = (o) => kstDayOf(o.createdAt) || String(o.등록일 || "").slice(0, 10);

export default function BlindMinePanel() {
  const myEmail = auth.currentUser?.email || "";
  const [cfg, setCfg] = React.useState(null);
  const [from, setFrom] = React.useState("2026-10-27");
  const [to, setTo] = React.useState(""); // 비우면 끝 없음
  const [onlyMine, setOnlyMine] = React.useState(true);
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => onSnapshot(CFG(), (s) => setCfg(s.exists() ? s.data() : {}), () => setCfg({})), []);
  const on = cfg?.enabled === true;

  const toggle = async () => {
    setBusy("toggle"); setMsg("");
    try {
      await setDoc(CFG(), { enabled: !on, email: myEmail, updatedAt: Date.now() }, { merge: true });
    } catch (e) { setMsg(`⚠ ${e.message}`); } finally { setBusy(""); }
  };

  // 상차일 >= from 인 오더(orders·dispatch) 중 대상만 골라 블라인드 값을 바꾼다
  const bulk = async (value) => {
    if (!from) return;
    const label = value ? "블라인드" : "블라인드 해제";
    if (to && to < from) { setMsg("⚠ 종료일이 시작일보다 빠릅니다"); return; }
    if (!window.confirm(`${from} ~ ${to || "끝까지"} ${onlyMine ? "내가 등록한 " : ""}오더를 전부 ${label}할까요?`)) return;
    setBusy(value ? "blind" : "unblind"); setMsg("");
    try {
      const targets = [];
      for (const c of ["orders", "dispatch"]) {
        const snap = await getDocs(query(collection(db, c), where("상차일", ">=", from)));
        snap.forEach((d) => {
          const o = d.data();
          if (o.source === "transport_transmit") return; // 화주사 전송 사본은 제외
          if (to && String(o.상차일 || "") > to) return; // 종료일 이후 제외
          if (onlyMine && o.작성자 !== myEmail && o.createdByEmail !== myEmail) return;
          if ((o.블라인드 === true) === value) return; // 이미 같은 상태
          targets.push(d.ref);
        });
      }
      for (let i = 0; i < targets.length; i += 400) {
        const b = writeBatch(db);
        targets.slice(i, i + 400).forEach((ref) => b.update(ref, { 블라인드: value }));
        await b.commit();
      }
      setMsg(`${targets.length}건 ${label} 완료`);
    } catch (e) { setMsg(`⚠ ${e.message}`); } finally { setBusy(""); }
  };

  // ③ 등록자 바꾸기
  const company = localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "";
  const staff = useCompanyStaff(company);
  const [fromEmail, setFromEmail] = React.useState("");
  const [regDay, setRegDay] = React.useState(kstToday());
  const [found, setFound] = React.useState(null); // [{ref, o}]
  const [pick, setPick] = React.useState(() => new Set());
  const [tMsg, setTMsg] = React.useState("");

  const findOrders = async () => {
    if (!fromEmail) { setTMsg("⚠ 바꿀 계정을 골라 주세요"); return; }
    setBusy("find"); setTMsg(""); setFound(null);
    try {
      const map = new Map();
      for (const c of ["orders", "dispatch"]) {
        for (const f of ["작성자", "createdByEmail"]) {
          const snap = await getDocs(query(collection(db, c), where(f, "==", fromEmail)));
          snap.forEach((d) => {
            const o = d.data();
            if (o.source === "transport_transmit") return; // 화주사 전송 사본 제외
            if (regDayOf(o) !== regDay) return;
            map.set(d.ref.path, { ref: d.ref, o });
          });
        }
      }
      const list = [...map.values()].sort((a, b) => String(a.o.상차일 || "").localeCompare(String(b.o.상차일 || "")) || String(a.o.거래처명 || "").localeCompare(String(b.o.거래처명 || "")));
      setFound(list);
      setPick(new Set(list.map((x) => x.ref.path)));
    } catch (e) { setTMsg(`⚠ ${e.message}`); } finally { setBusy(""); }
  };

  const transfer = async () => {
    const targets = (found || []).filter((x) => pick.has(x.ref.path));
    if (!targets.length) return;
    if (!window.confirm(`선택한 ${targets.length}건의 등록자를 최고관리자(나)로 바꾸고 블라인드로 돌릴까요?`)) return;
    setBusy("transfer"); setTMsg("");
    try {
      const me = auth.currentUser;
      const myDoc = await getDoc(doc(db, "users", me.uid)).catch(() => null);
      const myName = (myDoc?.exists() && myDoc.data().name) || me.email.split("@")[0];
      for (let i = 0; i < targets.length; i += 400) {
        const b = writeBatch(db);
        targets.slice(i, i + 400).forEach(({ ref, o }) => {
          const patch = { 작성자: me.email, createdByEmail: me.email, createdByUid: me.uid, createdByName: myName, 등록자명: myName, 블라인드: true };
          if (o.등록자 !== undefined) patch.등록자 = myName;
          b.update(ref, patch);
        });
        await b.commit();
      }
      setTMsg(`${targets.length}건 → 최고관리자 등록 + 블라인드 완료`);
      setFound(null); setPick(new Set());
    } catch (e) { setTMsg(`⚠ ${e.message}`); } finally { setBusy(""); }
  };
  const won = (n) => (Number(String(n || "").replace(/[^\d.-]/g, "")) || 0).toLocaleString("ko-KR");

  return (
    <div className={CARD}>
      <div className="px-5 sm:px-6 py-5 border-b border-[#EEF1F6]">
        <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">BLIND</div>
        <div className="text-[18px] font-black text-[#0F1A30]">블라인드 모드</div>
        <div className="text-[13.5px] text-[#5B6B85] mt-1">
          블라인드 오더는 <b className="text-[#0F1A30]">최고관리자만</b> 볼 수 있고, 다른 사용자의 배차 목록에는 보이지 않습니다.
        </div>
      </div>

      <div className="px-5 sm:px-6 py-5 space-y-5">
        {/* ① 자동 블라인드 */}
        <div className={`flex items-center justify-between gap-4 px-5 py-4 rounded-2xl ${on ? "bg-[#0F1A30] text-white" : "bg-[#F5F8FD] border border-[#EDF1F7]"}`}>
          <div className="min-w-0">
            <div className={`text-[12.5px] font-bold ${on ? "text-white/60" : "text-[#7A879C]"}`}>새로 등록하는 내 오더</div>
            <div className="text-[20px] font-black">{cfg === null ? "확인 중…" : on ? "자동 블라인드 켜짐" : "꺼짐"}</div>
            <div className={`text-[12.5px] mt-0.5 ${on ? "text-white/75" : "text-[#7A879C]"}`}>켜두면 PC·모바일에서 등록하는 오더가 전부 블라인드로 저장됩니다</div>
          </div>
          <button onClick={toggle} disabled={!!busy || cfg === null}
            className={`shrink-0 h-11 px-5 rounded-xl text-[14px] font-black disabled:opacity-50 ${on ? "bg-white text-[#0F1A30]" : "bg-[#0F1A30] text-white"}`}>
            {busy === "toggle" ? "처리 중…" : on ? "끄기" : "켜기"}
          </button>
        </div>

        {/* ② 이미 등록한 오더 일괄 */}
        <div className="px-5 py-4 rounded-2xl border border-[#E3E8F0] space-y-3">
          <div className="text-[14.5px] font-black text-[#0F1A30]">이미 등록한 오더 일괄 처리</div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[13px] font-bold text-[#7A879C]">상차일</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7]" />
            <span className="text-[13px] font-bold text-[#7A879C]">부터</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}
              className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7]" />
            <span className="text-[13px] font-bold text-[#7A879C]">까지{to ? "" : "(비우면 끝까지)"}</span>
            <label className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#0F1A30]">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              내가 등록한 오더만
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={() => bulk(true)} disabled={!!busy || !from}
              className="flex-1 h-12 rounded-2xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">
              {busy === "blind" ? "처리 중…" : "전체 블라인드"}
            </button>
            <button onClick={() => bulk(false)} disabled={!!busy || !from}
              className="flex-1 h-12 rounded-2xl border border-[#E3E8F0] text-[#0F1A30] text-[15px] font-black disabled:opacity-50">
              {busy === "unblind" ? "처리 중…" : "전체 해제"}
            </button>
          </div>
          {msg && <div className="text-[13px] font-bold text-[#0F1A30]">{msg}</div>}
        </div>

        {/* ③ 다른 계정으로 등록한 오더 → 최고관리자 등록 + 블라인드 */}
        <div className="px-5 py-4 rounded-2xl border border-[#E3E8F0] space-y-3">
          <div>
            <div className="text-[14.5px] font-black text-[#0F1A30]">등록자 바꾸기</div>
            <div className="text-[12.5px] text-[#7A879C] mt-0.5">다른 계정으로 잘못 등록한 오더를 골라 <b className="text-[#0F1A30]">최고관리자(나) 등록</b>으로 바꾸고 <b className="text-[#0F1A30]">블라인드</b>로 돌립니다</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[13px] font-bold text-[#7A879C]">등록한 계정</label>
            <select value={fromEmail} onChange={(e) => { setFromEmail(e.target.value); setFound(null); }}
              className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7] min-w-[220px]">
              <option value="">{staff === null ? "불러오는 중…" : "계정 선택"}</option>
              {(staff || []).filter((u) => u.email && u.email !== myEmail).map((u) => (
                <option key={u.uid} value={u.email}>{u.name || u.email}{u.position ? ` ${u.position}` : ""} · {u.email}</option>
              ))}
            </select>
            <label className="text-[13px] font-bold text-[#7A879C]">등록일</label>
            <input type="date" value={regDay} onChange={(e) => { setRegDay(e.target.value); setFound(null); }}
              className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7]" />
            <button onClick={findOrders} disabled={!!busy || !fromEmail}
              className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50">{busy === "find" ? "찾는 중…" : "오더 찾기"}</button>
          </div>

          {found && (found.length === 0 ? (
            <div className="px-4 py-6 rounded-xl border border-dashed border-[#DCE3EE] text-center text-[13.5px] text-[#9AA9C3]">{regDay}에 이 계정으로 등록한 오더가 없습니다</div>
          ) : (
            <div className="rounded-xl border border-[#E3E8F0] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#F5F8FD] border-b border-[#E3E8F0]">
                <label className="inline-flex items-center gap-2 text-[13px] font-black text-[#0F1A30]">
                  <input type="checkbox" checked={pick.size === found.length} onChange={(e) => setPick(e.target.checked ? new Set(found.map((x) => x.ref.path)) : new Set())} />
                  전체 선택
                </label>
                <span className="text-[13px] font-bold text-[#5B6B85]">{pick.size} / {found.length}건</span>
              </div>
              <div className="max-h-[360px] overflow-y-auto divide-y divide-[#EEF1F6]">
                {found.map(({ ref, o }) => (
                  <label key={ref.path} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#F8FAFD] cursor-pointer">
                    <input type="checkbox" checked={pick.has(ref.path)} onChange={(e) => setPick((p) => { const n = new Set(p); if (e.target.checked) n.add(ref.path); else n.delete(ref.path); return n; })} />
                    <span className="w-[86px] shrink-0 text-[12.5px] font-bold text-[#7A879C] tabular-nums">{o.상차일 || "-"}</span>
                    <span className="w-[120px] shrink-0 text-[13.5px] font-black text-[#0F1A30] truncate">{o.거래처명 || "-"}</span>
                    <span className="flex-1 min-w-0 text-[13px] text-[#3A4A66] truncate">{o.상차지명 || "-"} → {o.하차지명 || "-"}</span>
                    <span className="shrink-0 text-[12.5px] font-bold text-[#5B6B85] tabular-nums">{won(o.청구운임)}원</span>
                    {o.블라인드 === true && <span className="shrink-0 text-[10.5px] font-black px-1.5 py-0.5 rounded bg-[#0F1A30] text-white">블라인드</span>}
                  </label>
                ))}
              </div>
            </div>
          ))}

          {found && found.length > 0 && (
            <button onClick={transfer} disabled={!!busy || !pick.size}
              className="w-full h-12 rounded-2xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">
              {busy === "transfer" ? "바꾸는 중…" : `선택한 ${pick.size}건 → 최고관리자 등록 + 블라인드`}
            </button>
          )}
          {tMsg && <div className="text-[13px] font-bold text-[#0F1A30]">{tMsg}</div>}
        </div>
      </div>
    </div>
  );
}
