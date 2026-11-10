// ======================= pnk-site/src/pages/Approvals.jsx =======================
// 전자결재 — 양식 고르기 → 결재선(순서대로) · 참조자 지정 → 올리기 → 차례대로 승인/반려 → 완료
//  결재 문서는 종이 결재판처럼 보인다(결재란 도장 · 문서번호 · 인쇄). 휴가 신청서는 승인되면 휴가 · 일정에 반영된다.
import React from "react";
import { useSearchParams } from "react-router-dom";
import { useMeCtx } from "../App";
import {
  APPROVAL_FORMS, APPROVAL_STATUS, LEAVE_KINDS, addRow, formLabel, kstDateTime, leaveDays, leaveLabel, num, patchRow, useCol, where, won, ymd,
} from "../pnkApi";
import { Btn, Card, Chip, DateInput, Empty, Field, Hero, HeroBtn, Input, Loading, Modal, Select, Tabs, Textarea, cx, fail } from "../ui";
import Icon from "../icons";

const ts = (a) => a.createdAt?.seconds || 0;
const stTone = { pending: "navy", approved: "green", rejected: "red", canceled: "gray" };

export default function Approvals() {
  const me = useMeCtx();
  const uid = me.user.uid;
  const [sp, setSp] = useSearchParams();
  const openId = sp.get("id");
  const [tab, setTab] = React.useState("todo");
  const [write, setWrite] = React.useState(sp.get("new") || null);
  const [mine] = useCol("pnkApprovals", [where("viewers", "array-contains", uid)], [uid]);
  const [all] = useCol(me.isAdmin && tab === "all" ? "pnkApprovals" : null, [], [me.isAdmin, tab]);
  const [members] = useCol("pnkMembers", [where("status", "==", "active")], []);
  const [q, setQ] = React.useState("");
  const rows = (tab === "all" ? all : mine) || [];
  const todo = (mine || []).filter((a) => a.status === "pending" && a.line?.[a.step]?.uid === uid);
  const filt = {
    todo: (a) => a.status === "pending" && a.line?.[a.step]?.uid === uid,
    mine: (a) => a.authorUid === uid,
    wait: (a) => a.status === "pending" && a.authorUid !== uid && a.line?.some((l) => l.uid === uid) && a.line?.[a.step]?.uid !== uid,
    done: (a) => a.status !== "pending" && a.authorUid !== uid,
    cc: (a) => a.cc?.some((c) => c.uid === uid),
    all: () => true,
  }[tab];
  const list = rows.filter(filt).filter((a) => !q || `${a.title} ${a.authorName} ${a.docNo} ${formLabel(a.form)}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => ts(b) - ts(a));
  const cur = openId ? [...(mine || []), ...(all || [])].find((a) => a.id === openId) : null;
  const myPending = (mine || []).filter((a) => a.authorUid === uid && a.status === "pending").length;

  return (
    <div>
      <Hero en="E-APPROVAL" title="전자결재" desc={`내 결재 차례 ${todo.length}건 · 내가 올린 진행 중 문서 ${myPending}건`}>
        <HeroBtn icon="pen" onClick={() => setWrite("pick")}>새 문서 쓰기</HeroBtn>
      </Hero>

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2 mb-5">
        {APPROVAL_FORMS.map((f) => (
          <button key={f.key} type="button" onClick={() => setWrite(f.key)} className="bg-white rounded-2xl border border-line px-3 py-3 text-left hover:border-navy-500 hover:shadow-md transition">
            <div className="w-9 h-9 rounded-xl bg-navy-100 text-navy flex items-center justify-center mb-2"><Icon name={f.icon} size={18} /></div>
            <div className="text-[13.5px] font-black">{f.label}</div>
            <div className="text-[11.5px] text-[#7A8AA8] truncate">{f.hint}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <Tabs value={tab} onChange={(k) => { setTab(k); setSp({}); }} items={[
          { key: "todo", label: "결재할 문서", badge: todo.length }, { key: "mine", label: "내가 올린 문서" }, { key: "wait", label: "결재 예정" },
          { key: "done", label: "처리된 문서" }, { key: "cc", label: "참조" }, ...(me.isAdmin ? [{ key: "all", label: "전체(관리자)" }] : []),
        ]} />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목 · 기안자 · 문서번호 검색" className="md:ml-auto md:w-[280px] mb-4" />
      </div>

      <div className={cx("grid gap-4 md:gap-5", cur ? "xl:grid-cols-[minmax(0,420px)_1fr]" : "")}>
        <Card pad={false} className={cur ? "hidden xl:block" : ""}>
          {!mine ? <Loading /> : list.length === 0 ? <Empty icon="stamp">{tab === "todo" ? "결재할 문서가 없습니다." : "문서가 없습니다."}</Empty> : (
            <ul className="divide-y divide-[#EEF1F6]">
              {list.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setSp({ id: a.id })} className={cx("w-full text-left px-5 py-3.5 hover:bg-navy-50 flex items-center gap-3", a.id === openId && "bg-navy-50")}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5"><Chip tone="gray">{formLabel(a.form)}</Chip><span className="text-[14px] font-black truncate">{a.title}</span></div>
                      <div className="mt-1 text-[12px] text-[#7A8AA8] truncate">{a.docNo} · {a.authorName} · {kstDateTime(a.createdAt).slice(2, 16)}</div>
                      <LineDots a={a} />
                    </div>
                    <Chip tone={stTone[a.status]}>{a.status === "pending" ? `${a.step + 1}/${a.line.length} 진행` : APPROVAL_STATUS[a.status]}</Chip>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {cur && <DocView a={cur} me={me} onClose={() => setSp({})} />}
      </div>

      {write === "pick" && (
        <Modal open title="어떤 문서를 쓸까요?" onClose={() => setWrite(null)}>
          <div className="grid grid-cols-2 gap-2">
            {APPROVAL_FORMS.map((f) => (
              <button key={f.key} type="button" onClick={() => setWrite(f.key)} className="rounded-2xl border border-line px-4 py-3 text-left hover:border-navy-500">
                <div className="flex items-center gap-2"><Icon name={f.icon} size={17} className="text-navy" /><b className="text-[14px]">{f.label}</b></div>
                <div className="text-[12px] text-[#7A8AA8] mt-0.5">{f.hint}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {write && write !== "pick" && <Compose form={write} me={me} members={members || []} onClose={() => { setWrite(null); if (sp.get("new")) setSp({}); }} onDone={(id) => { setWrite(null); setTab("mine"); setSp({ id }); }} />}
    </div>
  );
}

function LineDots({ a }) {
  return (
    <div className="mt-1.5 flex items-center gap-1 flex-wrap">
      {a.line?.map((l, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="w-2 h-px bg-[#C9D3E4]" />}
          <span className={cx("h-5 px-1.5 rounded-md text-[10.5px] font-black flex items-center",
            l.status === "approved" ? "bg-navy text-white" : l.status === "rejected" ? "bg-rose-500 text-white" : i === a.step && a.status === "pending" ? "bg-navy-100 text-navy ring-1 ring-navy-500" : "bg-[#F0F2F6] text-[#7A8AA8]")}>{l.name}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

// 종이 결재판 모양
function DocView({ a, me, onClose }) {
  const uid = me.user.uid;
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const myTurn = a.status === "pending" && a.line?.[a.step]?.uid === uid;
  const act = async (ok) => {
    if (!ok && !comment.trim()) { window.alert("반려 사유를 적어 주세요."); return; }
    if (!window.confirm(ok ? "승인할까요?" : "반려할까요?")) return;
    setBusy(true);
    const line = a.line.map((l, i) => (i === a.step ? { ...l, status: ok ? "approved" : "rejected", at: Date.now(), comment: comment.trim() } : l));
    const last = a.step >= a.line.length - 1;
    try {
      await patchRow("pnkApprovals", a.id, { line, ...(ok && !last ? { step: a.step + 1 } : { status: ok ? "approved" : "rejected", doneAt: Date.now() }) });
      // 휴가 최종 승인 → 일정에 하루씩(주말 빼고) 올린다 — 일정 · 출근 현황 · 휴가 화면이 이것을 본다
      if (ok && last && a.form === "leave") {
        const F = a.fields || {};
        const half = LEAVE_KINDS.find((k) => k.key === F.kind)?.days === 0.5;
        const end = Date.parse(`${F.to || F.from}T12:00:00Z`);
        for (let t = Date.parse(`${F.from}T12:00:00Z`), n = 0; t <= end && n < 60; t += 86400e3, n += 1) {
          const d = new Date(t); if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
          await addRow("pnkEvents", { title: `${a.authorName} ${leaveLabel(F.kind)}`, date: d.toISOString().slice(0, 10), time: F.kind === "half_pm" ? "14:00" : "", type: "leave",
            memo: half ? "반차" : "", leaveUid: a.authorUid, leaveKind: F.kind, approvalId: a.id, days: half ? 0.5 : 1, createdBy: uid, createdByName: me.member?.name || "" });
          if (half) break;
        }
      }
      setComment("");
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const cancel = () => window.confirm("이 문서를 회수할까요? (결재가 멈춥니다)") && patchRow("pnkApprovals", a.id, { status: "canceled", doneAt: Date.now() }).catch(fail);
  const F = a.fields || {};
  const rowsOf = {
    expense: [["사용일", F.date], ["금액", won(a.amount)], ["항목", F.category], ["결제 방법", F.pay], ["거래처", F.vendor]],
    purchase: [["품목", F.item], ["수량", F.qty], ["예상 금액", won(a.amount)], ["구매처", F.vendor], ["필요한 날", F.date]],
    leave: [["종류", leaveLabel(F.kind)], ["기간", `${F.from || ""}${F.to && F.to !== F.from ? ` ~ ${F.to}` : ""}`], ["일수", `${F.days || 0}일`], ["업무 대행", F.backup], ["비상 연락", F.contact]],
    trip: [["기간", `${F.from || ""}${F.to && F.to !== F.from ? ` ~ ${F.to}` : ""}`], ["장소", F.place], ["목적", F.purpose], ["예상 경비", won(a.amount)], ["교통", F.transport]],
    report: [["보고 기간", F.period], ["대상 서비스", F.product]],
    contract: [["상대방", F.party], ["계약 금액", won(a.amount)], ["계약 기간", F.period]],
  }[a.form] || [];
  return (
    <Card pad={false}>
      <div className="px-5 md:px-7 pt-5 pb-3 flex items-center gap-2 border-b border-[#EEF1F6] print:hidden">
        <button type="button" onClick={onClose} className="xl:hidden text-[13px] font-bold text-navy-500 mr-2">← 목록</button>
        <Chip tone={stTone[a.status]}>{APPROVAL_STATUS[a.status]}</Chip>
        <span className="text-[12.5px] text-[#7A8AA8] tnum">{a.docNo}</span>
        <div className="ml-auto flex gap-1.5">
          <Btn kind="ghost" icon="file" onClick={() => window.print()}>인쇄</Btn>
          {a.authorUid === uid && a.status === "pending" && <Btn kind="danger" onClick={cancel}>회수</Btn>}
        </div>
      </div>
      <div className="px-5 md:px-8 py-6" id="pnk-print">
        <div className="flex flex-col md:flex-row md:items-start gap-5">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-extrabold tracking-[0.18em] text-[#7A8AA8]">PnK PROJECT · {formLabel(a.form)}</div>
            <h2 className="mt-1 text-[22px] font-black leading-snug">{a.title}</h2>
          </div>
          {/* 결재란 */}
          <div className="flex border-2 border-navy rounded-lg overflow-hidden shrink-0 self-start">
            <div className="w-7 bg-navy text-white text-[11px] font-black flex items-center justify-center [writing-mode:vertical-rl] tracking-[0.3em] py-2">결재</div>
            {[{ name: a.authorName, title: "기안", status: "approved", at: ts(a) * 1000 }, ...a.line].map((l, i) => (
              <div key={i} className="w-[76px] border-l border-navy/30 text-center">
                <div className="h-6 bg-navy-50 text-[11px] font-black text-navy flex items-center justify-center border-b border-navy/30 truncate px-1">{i === 0 ? "기안" : l.title || `${i}차`}</div>
                <div className="h-[58px] flex items-center justify-center">
                  {l.status === "approved" ? (
                    <span className="w-11 h-11 rounded-full border-[2.5px] border-rose-600 text-rose-600 text-[11px] font-black flex items-center justify-center rotate-[-12deg] leading-none">{i === 0 ? "기안" : "승인"}</span>
                  ) : l.status === "rejected" ? (
                    <span className="w-11 h-11 rounded-full border-[2.5px] border-rose-600 bg-rose-50 text-rose-600 text-[11px] font-black flex items-center justify-center rotate-[-12deg]">반려</span>
                  ) : i - 1 === a.step && a.status === "pending" ? <span className="text-[11px] font-bold text-navy-500 animate-pulse">결재 중</span> : <span className="text-[11px] text-[#C0C8D6]">대기</span>}
                </div>
                <div className="h-6 border-t border-navy/30 text-[11.5px] font-bold flex items-center justify-center truncate px-1">{l.name}</div>
                <div className="h-5 text-[10px] text-[#7A8AA8] tnum">{l.at ? kstDateTime(l.at).slice(5, 10).replace("-", "/") : ""}</div>
              </div>
            ))}
          </div>
        </div>

        <table className="w-full mt-5 text-[13.5px] border border-line rounded-xl overflow-hidden">
          <tbody>
            {[["기안자", `${a.authorName} (${a.authorEmpNo || ""} · ${a.dept || ""})`], ["기안일", kstDateTime(a.createdAt)], ...rowsOf, ...(a.cc?.length ? [["참조", a.cc.map((c) => c.name).join(", ")]] : [])].map(([k, v]) => (
              <tr key={k} className="border-b border-[#EEF1F6] last:border-0"><th className="w-28 bg-[#F8FAFD] text-left px-4 py-2.5 text-[12.5px] text-[#5A6A86] font-bold align-top">{k}</th><td className="px-4 py-2.5 font-semibold">{v || "-"}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="mt-5 text-[15px] leading-[1.85] whitespace-pre-wrap break-words min-h-[120px]">{a.body}</div>

        {a.line.some((l) => l.comment) && (
          <div className="mt-6 rounded-2xl bg-navy-50 p-4 space-y-2">
            <div className="text-[12.5px] font-black text-navy">결재 의견</div>
            {a.line.filter((l) => l.comment).map((l, i) => (
              <div key={i} className="text-[13.5px]"><b>{l.name}</b> <Chip tone={l.status === "rejected" ? "red" : "navy"}>{l.status === "rejected" ? "반려" : "승인"}</Chip> <span className="text-[#3A4A66]">{l.comment}</span></div>
            ))}
          </div>
        )}
      </div>
      {myTurn && (
        <div className="px-5 md:px-8 py-4 border-t border-[#EEF1F6] bg-[#F8FAFD] rounded-b-[20px] print:hidden">
          <div className="text-[13px] font-black mb-2">내 결재 차례입니다 ({a.step + 1}/{a.line.length})</div>
          <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="의견(반려할 때는 꼭)" />
          <div className="mt-2 flex gap-2 justify-end">
            <Btn kind="danger" disabled={busy} onClick={() => act(false)}>반려</Btn>
            <Btn icon="check" disabled={busy} onClick={() => act(true)}>{a.step >= a.line.length - 1 ? "최종 승인" : "승인"}</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

function Compose({ form, me, members, onClose, onDone }) {
  const uid = me.user.uid;
  const meta = APPROVAL_FORMS.find((f) => f.key === form) || APPROVAL_FORMS[0];
  const others = members.filter((m) => m.uid !== uid);
  // 기본 결재선: 대표(가장 마지막). 관리자가 있으면 관리자 → 대표
  const defLine = () => {
    const owner = others.filter((m) => m.role === "owner");
    const admins = others.filter((m) => m.role === "admin");
    return [...admins.slice(0, 1), ...owner.slice(0, 1)].map((m) => m.uid);
  };
  const [line, setLine] = React.useState(defLine);
  const [cc, setCc] = React.useState([]);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState(form === "report" ? "1. 이번 기간 한 일\n\n2. 결과 · 숫자\n\n3. 문제 · 도움 필요\n\n4. 다음 기간 할 일" : "");
  const [F, setFields] = React.useState(form === "leave" ? { kind: "annual", from: ymd(), to: ymd() } : form === "trip" ? { from: ymd(), to: ymd() } : { date: ymd() });
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const setF = (k) => (e) => setFields((x) => ({ ...x, [k]: e.target.value }));
  const days = form === "leave" ? leaveDays(F.kind, F.from, F.to) : 0;
  const pickOpts = others.map((m) => ({ key: m.uid, label: `${m.name} · ${m.title || m.dept || ""}` }));

  const submit = async () => {
    const t = title.trim() || (form === "leave" ? `${leaveLabel(F.kind)} 신청 (${F.from}${F.to !== F.from ? ` ~ ${F.to}` : ""})` : "");
    if (!t) { window.alert("제목을 넣어 주세요."); return; }
    if (!line.length) { window.alert("결재자를 한 명 이상 넣어 주세요."); return; }
    if (form === "leave" && (!F.from || (F.to && F.to < F.from))) { window.alert("휴가 날짜를 확인해 주세요."); return; }
    setBusy(true);
    const lineObjs = line.map((u) => { const m = members.find((x) => x.uid === u); return { uid: u, name: m?.name || "", title: m?.title || "", status: "wait", at: 0, comment: "" }; });
    const ccObjs = cc.map((u) => { const m = members.find((x) => x.uid === u); return { uid: u, name: m?.name || "" }; });
    const d = new Date(Date.now() + 9 * 3600e3);
    const docNo = `PNK-${{ general: "GE", expense: "EX", purchase: "PU", leave: "LV", trip: "TR", report: "RP", contract: "CT" }[form] || "DC"}-${d.toISOString().slice(2, 10).replace(/-/g, "")}-${String(Date.now()).slice(-4)}`;
    try {
      const r = await addRow("pnkApprovals", {
        form, title: t, body, fields: { ...F, ...(form === "leave" ? { days, to: F.to || F.from } : {}) }, amount: num(amount),
        authorUid: uid, authorName: me.member?.name || "", authorEmpNo: me.member?.empNo || "", dept: me.member?.dept || "",
        line: lineObjs, step: 0, cc: ccObjs, viewers: [...new Set([uid, ...line, ...cc])], status: "pending", docNo,
      });
      onDone(r.id);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <Modal open wide title={meta.label} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>취소</Btn><Btn icon="send" onClick={submit} disabled={busy}>{busy ? "올리는 중…" : "결재 올리기"}</Btn></>}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        <div className="space-y-3">
          <Field label="제목"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={form === "leave" ? "비워 두면 자동으로 채웁니다" : ""} autoFocus /></Field>
          {form === "leave" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="종류"><Select value={F.kind} onChange={setF("kind")} options={LEAVE_KINDS.map((k) => ({ key: k.key, label: k.label }))} /></Field>
              <Field label="시작일"><DateInput value={F.from} onChange={(e) => setFields((x) => ({ ...x, from: e.target.value, to: x.to < e.target.value ? e.target.value : x.to }))} /></Field>
              <Field label="종료일"><DateInput value={F.to} onChange={setF("to")} disabled={days === 0.5} /></Field>
              <Field label="일수"><div className="h-10 px-3 rounded-xl bg-navy-50 flex items-center text-[15px] font-black tnum">{days}일</div></Field>
              <Field label="업무 대행" className="col-span-2"><Select custom value={F.backup || ""} onChange={setF("backup")} options={others.map((m) => m.name)} placeholder="선택 · 직접 입력" /></Field>
              <Field label="비상 연락처" className="col-span-2"><Input value={F.contact || ""} onChange={setF("contact")} placeholder="010-" /></Field>
            </div>
          )}
          {form === "expense" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="사용일"><DateInput value={F.date} onChange={setF("date")} /></Field>
              <Field label="금액(원)"><Input inputMode="numeric" value={amount ? Number(num(amount)).toLocaleString() : ""} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="항목"><Select custom value={F.category || ""} onChange={setF("category")} options={["식대 · 회식", "교통 · 유류", "소모품", "소프트웨어 · 구독", "서버 · 클라우드", "광고", "접대", "기타"]} placeholder="선택 · 직접 입력" /></Field>
              <Field label="결제 방법"><Select custom value={F.pay || ""} onChange={setF("pay")} options={["법인카드", "개인카드(정산 요청)", "계좌이체", "현금"]} placeholder="선택" /></Field>
              <Field label="거래처" className="col-span-2"><Input value={F.vendor || ""} onChange={setF("vendor")} /></Field>
            </div>
          )}
          {form === "purchase" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="품목" className="col-span-2"><Input value={F.item || ""} onChange={setF("item")} /></Field>
              <Field label="수량"><Input value={F.qty || ""} onChange={setF("qty")} /></Field>
              <Field label="예상 금액(원)"><Input inputMode="numeric" value={amount ? Number(num(amount)).toLocaleString() : ""} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="구매처"><Input value={F.vendor || ""} onChange={setF("vendor")} /></Field>
              <Field label="필요한 날"><DateInput value={F.date} onChange={setF("date")} /></Field>
            </div>
          )}
          {form === "trip" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="시작일"><DateInput value={F.from} onChange={setF("from")} /></Field>
              <Field label="종료일"><DateInput value={F.to} onChange={setF("to")} /></Field>
              <Field label="장소"><Input value={F.place || ""} onChange={setF("place")} placeholder="고객사 · 지역" /></Field>
              <Field label="교통"><Select custom value={F.transport || ""} onChange={setF("transport")} options={["자차", "법인차", "KTX · 기차", "항공", "대중교통"]} placeholder="선택" /></Field>
              <Field label="목적" className="col-span-2"><Input value={F.purpose || ""} onChange={setF("purpose")} placeholder="예: 로지스웹 도입 시연" /></Field>
              <Field label="예상 경비(원)"><Input inputMode="numeric" value={amount ? Number(num(amount)).toLocaleString() : ""} onChange={(e) => setAmount(e.target.value)} /></Field>
            </div>
          )}
          {form === "report" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="보고 기간"><Select custom value={F.period || ""} onChange={setF("period")} options={["주간", "월간", "분기", "프로젝트"]} placeholder="선택" /></Field>
              <Field label="대상 서비스"><Select custom value={F.product || ""} onChange={setF("product")} options={["로지스웹", "로지스웹 허브", "공식 홈페이지", "기사앱", "공통"]} placeholder="선택" /></Field>
            </div>
          )}
          {form === "contract" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="상대방" className="col-span-2"><Input value={F.party || ""} onChange={setF("party")} /></Field>
              <Field label="계약 금액(원)"><Input inputMode="numeric" value={amount ? Number(num(amount)).toLocaleString() : ""} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="계약 기간"><Input value={F.period || ""} onChange={setF("period")} placeholder="2026.12 ~ 2027.11" /></Field>
            </div>
          )}
          <Field label={form === "leave" ? "사유" : "내용"}><Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[12.5px] font-bold text-[#3A4A66] mb-1.5">결재선 (위에서부터 차례대로)</div>
            <ol className="space-y-1.5">
              <li className="flex items-center gap-2 rounded-xl bg-navy-50 px-3 py-2 text-[13px]"><span className="w-5 h-5 rounded-full bg-navy text-white text-[10px] font-black flex items-center justify-center">기</span><b>{me.member?.name}</b><span className="text-[#7A8AA8] text-[12px]">기안</span></li>
              {line.map((u, i) => { const m = members.find((x) => x.uid === u); return (
                <li key={u} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13px]">
                  <span className="w-5 h-5 rounded-full bg-navy-100 text-navy text-[10px] font-black flex items-center justify-center">{i + 1}</span>
                  <b className="flex-1 truncate">{m?.name}</b><span className="text-[#7A8AA8] text-[12px] truncate">{m?.title}</span>
                  <button type="button" disabled={i === 0} onClick={() => setLine((l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} className="text-[#7A8AA8] disabled:opacity-20" title="위로">▲</button>
                  <button type="button" onClick={() => setLine((l) => l.filter((x) => x !== u))} className="text-[#7A8AA8] hover:text-rose-600" title="빼기"><Icon name="x" size={14} /></button>
                </li>
              ); })}
            </ol>
            <div className="mt-2"><Select value="" onChange={(e) => e.target.value && setLine((l) => (l.includes(e.target.value) || l.length >= 8 ? l : [...l, e.target.value]))} options={pickOpts.filter((o) => !line.includes(o.key))} placeholder="+ 결재자 추가" /></div>
          </div>
          <div>
            <div className="text-[12.5px] font-bold text-[#3A4A66] mb-1.5">참조 (결재 없이 받아 보기)</div>
            <div className="flex flex-wrap gap-1.5 mb-2">{cc.map((u) => <span key={u} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-lg bg-navy-100 text-navy text-[12.5px] font-bold">{members.find((x) => x.uid === u)?.name}<button type="button" onClick={() => setCc((l) => l.filter((x) => x !== u))} className="w-5 h-5 flex items-center justify-center"><Icon name="x" size={12} /></button></span>)}</div>
            <Select value="" onChange={(e) => e.target.value && setCc((l) => (l.includes(e.target.value) ? l : [...l, e.target.value]))} options={pickOpts.filter((o) => !cc.includes(o.key) && !line.includes(o.key))} placeholder="+ 참조자 추가" />
          </div>
          <div className="rounded-2xl bg-navy-50 p-3 text-[12px] text-[#5A6A86] leading-relaxed">결재자가 차례대로 승인하면 완료됩니다. 한 명이라도 반려하면 멈춥니다. 진행 중에는 [회수]할 수 있습니다.{form === "leave" ? " 승인된 휴가는 휴가 · 일정 화면에 자동으로 나옵니다." : ""}</div>
        </div>
      </div>
    </Modal>
  );
}
