// ======================= src/AiAssistant.jsx =======================
// 🤖 2026-11-07 배차 AI 비서(Claude) — 서버 설명은 functions/aiAssistant.js 맨 위, 순수 계산은 src/aiAssistantCore.js
//  · 말로 묻고 시키기: 오더 조회·수정·등록·삭제·기사 배정·일괄 수정, 매출·미수금·기사 위치 질문, 안내 문자 초안, 화면 열기, 개인일정
//  · 바꾸는 일은 전부 확인 카드([적용]·[등록]) → 화면의 원래 저장 함수(orderApi = patchDispatch · addDispatch · removeDispatch)로 저장
//    → 손으로 고칠 때와 같은 기록·시트 연동·허브 동기화·알림·운임 계산. [되돌리기]는 바꾸기 전 값으로 다시 저장
//  · 카톡 캡처·오더 글(카카오톡 내보내기 포함)을 붙여넣으면 오더 스캔(정밀 인식 + 회사별 학습)으로 등록 카드를 만든다
//  · AI 서버를 못 쓰면(키 없음·오류·횟수 초과) 화면에 있는 데이터로 답하는 기본 답변으로 이어간다
//  · 경리(acct)·인사(hr)·임원(exec) 화면은 그 팀 비서(인사말·빠른 버튼·서버 도구가 다르다)
import React, { useState, useRef, useEffect, useCallback } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { FabButton, useWinSize, ResizeGrip, WinHeader } from "./FloatDock";
import { AI_MODES, useTeamData, teamButtons, teamAnswer } from "./aiTeamModes";
import { auth, db } from "./firebase";
import { askAssistant } from "./aiAssistantApi";
import { mainScanAi } from "./orderScanApi";
import { parseOrderScan, splitOrders } from "./orderScanParser";
import { normalizeAiFields, mergeAiInto, applyAliases, applyLabelRemaps, reconcileRoles, kstToday, needsCheck } from "./orderScanAi";
import OrderScanModal, { normPlaces, prepImage, toUploadJpeg } from "./OrderScanModal";
import { remindAtOf } from "./PersonalSchedule";
import {
  buildUpdate, buildCreateRecord, scanValsToFields, splitPasted, looksLikeOrderText, intentOf, pickerRows, localEditProposal, localAnswer,
  mdBlocks, mdInline, serializeChat, deserializeChat, labelOf, fmtVal, CREATE_FIELDS, missingOf, todayYmd, isUnassigned, won,
} from "./aiAssistantCore";

const NAVY = "#1B2B4B";
const BLUE = "#2D4C82";
const LINE = "#E3E8F0";
const SUB = "#5B6B85";
const rid = (r) => r?._id || r?.id || "";
const uidGen = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const withTimeout = (pr, ms) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
const FALLBACK_CODES = new Set(["failed-precondition", "unavailable", "resource-exhausted", "unauthenticated", "deadline-exceeded", "internal", "permission-denied", "401", "403", "404", "500", "503"]);

const DISPATCH_CHIPS = ["오더 수정", "오늘 미배차 몇 건이야?", "이번 달 매출", "오더 등록할게", "기사님 배차 안내 문자 써줘", "이 기능 어디 있어?"];
const TEAM_CHIPS = { acct: ["이번 달 미수금 많은 거래처", "이번 달 매출·매입", "부가세 계산해줘"], hr: ["오늘 출근·휴가 현황", "근태 결재 대기", "인사 공지 초안 써줘"], exec: ["이번 달 경영 요약", "미수금 위험 거래처", "지난달과 매출 비교"] };
const FOCUS_CHIPS = [["화물 수정", "화물을 "], ["운임 수정", "청구운임 "], ["기사 배정", "기사 배정 "], ["상차지 변경", "상차지를 "], ["하차지 변경", "하차지를 "], ["시간 변경", "상차시간 "], ["기사 안내 문자", "이 오더 기사님 안내 문자 써줘"], ["삭제", "이 오더 삭제"]];

const rowSummary = (r) => (r ? `${r.거래처명 || "-"} · ${r.상차지명 || "-"} → ${r.하차지명 || "-"}` : "");
const rowTime = (r) => `${String(r?.상차일 || "").slice(5).replace("-", "/")} ${r?.상차시간 || ""}`.trim();

// ── 짧은 마크다운 ──
function Inline({ s }) {
  return mdInline(s).map((p, i) => (p.t === "b" ? <b key={i} style={{ fontWeight: 800 }}>{p.v}</b> : p.t === "code" ? <code key={i} style={{ background: "#EEF2F8", borderRadius: 4, padding: "0 4px", fontSize: "0.92em" }}>{p.v}</code> : <React.Fragment key={i}>{p.v}</React.Fragment>));
}
function Md({ text }) {
  const bl = mdBlocks(text);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {bl.map((b, i) => {
        if (b.t === "gap") return <div key={i} style={{ height: 6 }} />;
        if (b.t === "h") return <div key={i} style={{ fontWeight: 900, marginTop: 4 }}><Inline s={b.v} /></div>;
        if (b.t === "li") return <div key={i} style={{ display: "flex", gap: 6 }}><span style={{ color: BLUE }}>•</span><span><Inline s={b.v} /></span></div>;
        if (b.t === "oli") return <div key={i} style={{ display: "flex", gap: 6 }}><span style={{ color: BLUE, fontWeight: 800, minWidth: 14 }}>{b.n}.</span><span><Inline s={b.v} /></span></div>;
        if (b.t === "table") return <GridTable key={i} head={b.head.map((h) => <Inline s={h} />)} rows={b.rows.map((r) => r.map((c) => <Inline s={c} />))} />;
        return <div key={i}><Inline s={b.v} /></div>;
      })}
    </div>
  );
}

// 표 — 프로그램 전체 표 스타일(행 높이 50px 등)이 대화창에 번지지 않게 <table> 대신 격자로
function GridTable({ head, rows, maxHeight }) {
  const n = head.length;
  const cell = (k, v, isHead, r) => <div key={k} style={{ padding: "5px 8px", fontSize: 12.5, lineHeight: 1.45, whiteSpace: "nowrap", background: isHead ? "#F1F4F9" : r % 2 ? "#FBFCFE" : "#fff", fontWeight: isHead ? 800 : 500, borderBottom: "1px solid #EEF1F6", color: isHead ? "#33415C" : "#0F1A30", position: isHead ? "sticky" : "static", top: 0 }}>{v}</div>;
  return (
    <div data-testid="ai-table" style={{ overflow: "auto", maxHeight: maxHeight || "none", margin: "4px 0", border: `1px solid ${LINE}`, borderRadius: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, minmax(max-content, 1fr))` }}>
        {head.map((h, j) => cell(`h${j}`, h, true, 0))}
        {rows.map((r, i) => r.map((c, j) => cell(`${i}-${j}`, c, false, i)))}
      </div>
    </div>
  );
}

const btn = (kind = "primary", disabled = false) => ({
  height: 34, padding: "0 14px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
  border: kind === "primary" ? "none" : kind === "danger" ? "none" : `1px solid ${LINE}`,
  background: kind === "primary" ? NAVY : kind === "danger" ? "#D92D20" : "#fff", color: kind === "primary" || kind === "danger" ? "#fff" : "#33415C",
});
const cardBox = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: 12, boxShadow: "0 1px 2px rgba(16,24,40,0.04)" };
const tagStyle = (c = BLUE) => ({ display: "inline-flex", alignItems: "center", height: 20, padding: "0 7px", borderRadius: 6, fontSize: 11, fontWeight: 800, background: `${c}14`, color: c });

function StatusLine({ status, note }) {
  if (!status || status === "pending") return null;
  const m = { applied: ["#067647", "적용했어요"], created: ["#067647", "등록했어요"], deleted: ["#067647", "삭제했어요"], undone: [SUB, "되돌렸어요"], cancelled: [SUB, "취소했어요"], failed: ["#D92D20", "저장하지 못했어요"], opened: ["#067647", "등록 화면에 넣었어요"] }[status] || [SUB, status];
  return <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 800, color: m[0] }}>{m[1]}{note ? ` · ${note}` : ""}</div>;
}

// ── 오더 고르기 ──
function OrderPicker({ msg, rows, onPick, today }) {
  const [filter, setFilter] = useState(msg.data?.filter || { range: "today" });
  const [more, setMore] = useState(false);
  const list = pickerRows(rows, filter, today);
  const chips = [["today", "오늘"], ["tomorrow", "내일"], ["yesterday", "어제"], ["week", "이번 주"]];
  return (
    <div style={{ ...cardBox, padding: 10 }} data-testid="ai-picker">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {chips.map(([k, l]) => <button key={k} type="button" onClick={() => setFilter((f) => ({ ...f, range: k }))} style={{ ...chipStyle(filter.range === k) }}>{l}</button>)}
        <button type="button" onClick={() => setFilter((f) => ({ ...f, unassigned: !f.unassigned }))} style={chipStyle(!!filter.unassigned)}>미배차</button>
        <input value={filter.client || ""} onChange={(e) => setFilter((f) => ({ ...f, client: e.target.value }))} placeholder="거래처·장소·차량" style={{ flex: 1, minWidth: 90, height: 28, borderRadius: 8, border: `1px solid ${LINE}`, padding: "0 8px", fontSize: 12.5 }} />
      </div>
      {!list.length && <div style={{ fontSize: 13, color: SUB, padding: "10px 4px" }}>조건에 맞는 오더가 없어요.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
        {(more ? list : list.slice(0, 12)).map((r) => (
          <button key={rid(r)} type="button" data-testid="ai-pick-row" onClick={() => onPick(r, filter.purpose || msg.data?.filter?.purpose)}
            style={{ textAlign: "left", border: `1px solid ${LINE}`, borderRadius: 12, padding: "8px 10px", background: "#fff", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: SUB, fontWeight: 700 }}>
              <span>{rowTime(r)} · {r.거래처명 || "-"}</span>
              <span style={tagStyle(isUnassigned(r) ? "#B54708" : "#067647")}>{isUnassigned(r) ? "미배차" : r.배차상태 || "배차완료"}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0F1A30", marginTop: 2 }}>{r.상차지명 || "-"} → {r.하차지명 || "-"}</div>
            <div style={{ fontSize: 12, color: SUB, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[r.화물내용, [r.차량톤수, r.차량종류].filter(Boolean).join(" "), r.차량번호 && `${r.차량번호} ${r.이름 || ""}`, r.청구운임 && won(r.청구운임)].filter(Boolean).join(" · ")}</div>
          </button>
        ))}
      </div>
      {!more && list.length > 12 && <button type="button" onClick={() => setMore(true)} style={{ ...btn("ghost"), width: "100%", marginTop: 6 }}>{list.length - 12}건 더 보기</button>}
    </div>
  );
}
const chipStyle = (on) => ({ height: 28, padding: "0 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, cursor: "pointer", border: on ? `1px solid ${NAVY}` : `1px solid ${LINE}`, background: on ? NAVY : "#fff", color: on ? "#fff" : "#33415C", whiteSpace: "nowrap" });

// ── 바꾸기 확인 카드(한 건) ──
function DiffRows({ diff }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      {diff.map((d) => (
        <div key={d.field} style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 8, alignItems: "start", fontSize: 13 }}>
          <span style={{ color: SUB, fontWeight: 800 }}>{labelOf(d.field)}{d.auto ? " (자동)" : ""}</span>
          <span style={{ wordBreak: "break-all" }}>
            <span style={{ color: "#98A2B3", textDecoration: "line-through" }}>{fmtVal(d.field, d.before)}</span>
            <span style={{ color: SUB, margin: "0 6px" }}>→</span>
            <b style={{ color: "#0F1A30" }}>{fmtVal(d.field, d.after)}</b>
          </span>
        </div>
      ))}
    </div>
  );
}
function UpdateCard({ msg, row, canWrite, onApply, onUndo, onCancel }) {
  const d = msg.data;
  const live = msg.status === "applied" || msg.status === "undone" ? null : buildUpdate(row || {}, d.changes.map((c) => ({ field: c.field, after: c.after })));
  const diff = live ? (row ? live.diff : d.changes) : msg.result?.diff || d.changes;
  const title = d.kind === "assign" ? "이 기사로 배정할까요?" : d.kind === "unassign" ? "배차를 취소할까요?" : "이렇게 바꿀까요?";
  return (
    <div style={cardBox} data-testid="ai-diff-card">
      <div style={{ fontSize: 14.5, fontWeight: 900, color: "#0F1A30" }}>{title}</div>
      <div style={{ fontSize: 12.5, color: SUB, marginTop: 2 }}>{rowTime(row || d.summary)} · {rowSummary(row || d.summary)}</div>
      {!diff.length ? <div style={{ fontSize: 13, color: SUB, marginTop: 8 }}>이미 같은 값이라 바꿀 내용이 없어요.</div> : <DiffRows diff={diff} />}
      {d.reason && <div style={{ fontSize: 12, color: SUB, marginTop: 6 }}>{d.reason}</div>}
      {(!msg.status || msg.status === "pending") && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button type="button" data-testid="ai-apply" disabled={!canWrite || !diff.length || msg.busy} onClick={onApply} style={btn("primary", !canWrite || !diff.length || msg.busy)}>{msg.busy ? "적용 중" : "적용"}</button>
          <button type="button" onClick={onCancel} style={btn("ghost")}>취소</button>
        </div>
      )}
      {!canWrite && (!msg.status || msg.status === "pending") && <div style={{ fontSize: 12, color: "#B54708", marginTop: 6 }}>조회 전용 권한이라 적용할 수 없어요.</div>}
      <StatusLine status={msg.status} note={msg.note} />
      {msg.status === "applied" && msg.result?.undo && <button type="button" data-testid="ai-undo" onClick={onUndo} disabled={msg.busy} style={{ ...btn("ghost", msg.busy), marginTop: 6 }}>되돌리기</button>}
    </div>
  );
}
function BulkCard({ msg, rowOf, canWrite, onApply, onUndo, onCancel }) {
  const items = msg.data.items || [];
  const fields = [...new Set(items.flatMap((x) => x.changes.map((c) => c.field)))];
  return (
    <div style={cardBox} data-testid="ai-bulk-card">
      <div style={{ fontSize: 14.5, fontWeight: 900 }}>{items.length}건을 한꺼번에 바꿀까요?</div>
      {msg.data.reason && <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>{msg.data.reason}</div>}
      <GridTable maxHeight={260}
        head={["오더", ...fields.map(labelOf)]}
        rows={items.map((x) => {
          const r = rowOf(x.id) || x.summary;
          return [
            <span key="o">{rowTime(r)} {r.거래처명 || ""}<br /><span style={{ color: SUB }}>{r.상차지명 || "-"} → {r.하차지명 || "-"}</span></span>,
            ...fields.map((f) => { const c = x.changes.find((y) => y.field === f); return c ? <span key={f}><span style={{ color: "#98A2B3", textDecoration: "line-through" }}>{fmtVal(f, c.before)}</span><br /><b>{fmtVal(f, c.after)}</b></span> : "-"; }),
          ];
        })} />
      {(!msg.status || msg.status === "pending") && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button type="button" data-testid="ai-apply" disabled={!canWrite || msg.busy} onClick={onApply} style={btn("primary", !canWrite || msg.busy)}>{msg.busy ? "적용 중" : `모두 적용(${items.length}건)`}</button>
          <button type="button" onClick={onCancel} style={btn("ghost")}>취소</button>
        </div>
      )}
      {!canWrite && (!msg.status || msg.status === "pending") && <div style={{ fontSize: 12, color: "#B54708", marginTop: 6 }}>조회 전용 권한이라 적용할 수 없어요.</div>}
      <StatusLine status={msg.status} note={msg.note} />
      {msg.status === "applied" && msg.result?.undo?.length > 0 && <button type="button" data-testid="ai-undo" onClick={onUndo} disabled={msg.busy} style={{ ...btn("ghost", msg.busy), marginTop: 6 }}>모두 되돌리기</button>}
    </div>
  );
}

// ── 등록 카드(여러 건 · 칸 고치기) ──
function CreateCard({ msg, canWrite, onChange, onCreate, onUndo, onCancel, mobile }) {
  const orders = msg.data.orders || [];
  const [open, setOpen] = useState(() => (orders.length === 1 ? 0 : -1));
  const states = msg.result?.states || [];
  const pendingN = orders.filter((_, i) => !states[i]).length;
  return (
    <div style={cardBox} data-testid="ai-create-card">
      <div style={{ fontSize: 14.5, fontWeight: 900 }}>{orders.length > 1 ? `오더 ${orders.length}건을 등록할까요?` : "이 오더를 등록할까요?"}</div>
      <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>{msg.data.source === "scan" ? `붙여넣은 글에서 찾았어요${msg.data.ai ? " (정밀 인식)" : ""}. 노란 칸은 확인이 필요해요.` : "칸을 눌러 고칠 수 있어요."}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        {orders.map((o, i) => {
          const f = o.fields; const miss = missingOf(f); const st = states[i];
          return (
            <div key={i} style={{ border: `1px solid ${st ? "#ABEFC6" : LINE}`, borderRadius: 12, padding: 10, background: st ? "#F6FEF9" : "#FBFCFE" }}>
              <button type="button" onClick={() => setOpen(open === i ? -1 : i)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 12, color: SUB, fontWeight: 700 }}>
                  <span>{orders.length > 1 ? `${i + 1}. ` : ""}{String(f.상차일 || "").slice(5).replace("-", "/")} {f.상차시간 || ""} · {f.거래처명 || "거래처 없음"}</span>
                  <span>{st ? <span style={tagStyle("#067647")}>{st === "opened" ? "등록 화면" : "등록됨"}</span> : miss.length ? <span style={tagStyle("#B54708")}>{miss.join("·")} 확인</span> : <span style={tagStyle()}>{open === i ? "접기" : "고치기"}</span>}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{f.상차지명 || f.상차지주소 || "-"} → {f.하차지명 || f.하차지주소 || "-"}</div>
                <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>{[f.화물내용, [f.차량톤수, f.차량종류].filter(Boolean).join(" "), f.청구운임 && won(f.청구운임), f.지급방식].filter(Boolean).join(" · ")}</div>
              </button>
              {open === i && !st && (
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 6, marginTop: 8 }}>
                  {CREATE_FIELDS.map((k) => (
                    <label key={k} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11.5, color: SUB, fontWeight: 800 }}>
                      {labelOf(k)}
                      <input data-testid={`ai-field-${k}`} value={f[k] ?? ""} onChange={(e) => onChange(i, k, e.target.value)}
                        style={{ height: 32, borderRadius: 8, border: `1px solid ${o.checks?.includes(k) ? "#FEC84B" : LINE}`, background: o.checks?.includes(k) ? "#FFFAEB" : "#fff", padding: "0 8px", fontSize: 13, color: "#0F1A30", fontWeight: 600 }} />
                    </label>
                  ))}
                </div>
              )}
              {!st && (!msg.status || msg.status === "pending") && (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button type="button" data-testid="ai-create" disabled={!canWrite || msg.busy || miss.includes("상차지") || miss.includes("하차지")} onClick={() => onCreate([i])} style={btn("primary", !canWrite || msg.busy || miss.includes("상차지") || miss.includes("하차지"))}>{mobile ? "등록 화면에 넣기" : "등록"}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {(!msg.status || msg.status === "pending") && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {orders.length > 1 && pendingN > 0 && !mobile && <button type="button" data-testid="ai-create-all" disabled={!canWrite || msg.busy} onClick={() => onCreate(orders.map((_, i) => i).filter((i) => !states[i]))} style={btn("primary", !canWrite || msg.busy)}>{msg.busy ? "등록 중" : `남은 ${pendingN}건 모두 등록`}</button>}
          <button type="button" onClick={onCancel} style={btn("ghost")}>{states.some(Boolean) ? "닫기" : "취소"}</button>
        </div>
      )}
      {!canWrite && <div style={{ fontSize: 12, color: "#B54708", marginTop: 6 }}>조회 전용 권한이라 등록할 수 없어요.</div>}
      <StatusLine status={msg.status} note={msg.note} />
      {msg.result?.ids?.length > 0 && msg.status !== "undone" && !mobile && <button type="button" data-testid="ai-undo" onClick={onUndo} disabled={msg.busy} style={{ ...btn("ghost", msg.busy), marginTop: 6 }}>등록 되돌리기(삭제)</button>}
    </div>
  );
}
function DeleteCard({ msg, rowOf, canWrite, onDelete, onCancel }) {
  const [sure, setSure] = useState(false);
  const items = msg.data.items || [];
  return (
    <div style={{ ...cardBox, borderColor: "#FECDCA" }} data-testid="ai-delete-card">
      <div style={{ fontSize: 14.5, fontWeight: 900, color: "#B42318" }}>{items.length}건을 삭제할까요?</div>
      <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>삭제한 오더는 되돌릴 수 없어요.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {items.map((x) => { const r = rowOf(x.id) || x.summary; return <div key={x.id} style={{ fontSize: 13 }}>· {rowTime(r)} {rowSummary(r)}{x.done ? <span style={{ ...tagStyle("#B54708"), marginLeft: 6 }}>운송완료</span> : null}</div>; })}
      </div>
      {(!msg.status || msg.status === "pending") && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {!sure ? <button type="button" disabled={!canWrite} onClick={() => setSure(true)} style={btn("danger", !canWrite)}>삭제</button>
            : <button type="button" data-testid="ai-delete-confirm" disabled={!canWrite || msg.busy} onClick={onDelete} style={btn("danger", !canWrite || msg.busy)}>{msg.busy ? "삭제 중" : "정말 삭제해요"}</button>}
          <button type="button" onClick={onCancel} style={btn("ghost")}>취소</button>
        </div>
      )}
      <StatusLine status={msg.status} note={msg.note} />
    </div>
  );
}
function ScheduleCard({ msg, onSave, onCancel }) {
  const it = msg.data.item;
  return (
    <div style={cardBox} data-testid="ai-schedule-card">
      <div style={{ fontSize: 14.5, fontWeight: 900 }}>내 개인일정에 넣을까요?</div>
      <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 6 }}>{it.title}</div>
      <div style={{ fontSize: 12.5, color: SUB, marginTop: 2 }}>{it.date} {it.allDay ? "종일" : `${it.start}${it.end ? `~${it.end}` : ""}`}{it.place ? ` · ${it.place}` : ""}{it.remind && it.remind !== "none" ? ` · 알림 ${{ morning: "당일 아침", "10m": "10분 전", "30m": "30분 전", "1h": "1시간 전", "1d": "하루 전" }[it.remind] || it.remind}` : ""}</div>
      {it.memo && <div style={{ fontSize: 12.5, color: SUB, marginTop: 4 }}>{it.memo}</div>}
      {(!msg.status || msg.status === "pending") && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button type="button" disabled={msg.busy} onClick={onSave} style={btn("primary", msg.busy)}>등록</button>
          <button type="button" onClick={onCancel} style={btn("ghost")}>취소</button>
        </div>
      )}
      <StatusLine status={msg.status === "created" ? "created" : msg.status} note={msg.note} />
    </div>
  );
}

/**
 * props
 *  dispatches · clients · places · drivers — 화면이 이미 들고 있는 우리 회사 데이터(고르기 목록 · 기본 답변 · 확인 카드의 지금 값)
 *  orderApi { canWrite, update(id, patch, row), create(record) → id | "opened", remove(ids) } — 화면의 원래 저장 함수
 *  onNavigate(menu) — 없으면 kp-go-menu 이벤트(PC 메뉴 이동)
 *  variant "pc" | "mobile"
 */
export default function AiAssistant({ dispatches = [], clients = [], places = [], drivers = [], controlledOpen, onOpenChange, mode = null, company = "", uid = "", userName = "", orderApi = null, onNavigate = null, variant = "pc", screen = "" }) {
  const M = AI_MODES[mode] || null;
  const mobile = variant === "mobile";
  const hello = M ? `${M.hello}\n궁금한 것을 편하게 물어보세요.` : "안녕하세요, 배차 AI 비서예요.\n오더 수정·등록, 매출·미배차 질문, 기사 안내 문자까지 말로 시켜 주세요.\n카톡 캡처나 오더 글을 붙여넣으면 바로 등록 카드로 만들어 드려요.";
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v) => { if (onOpenChange) onOpenChange(v); else setInternalOpen(v); };
  const storeKey = `kpAiChat:${uid || "anon"}:${mode || "dispatch"}`;
  const helloMsg = useCallback(() => [{ id: "hello", role: "assistant", kind: "text", content: hello }], [hello]);
  const [messages, setMessages] = useState(helloMsg);
  const [history, setHistory] = useState([]);
  const [focus, setFocus] = useState(null); // 고른 오더 id
  const [busy, setBusy] = useState("");
  const [input, setInput] = useState("");
  const [aiState, setAiState] = useState(""); // "" 모름 | "on" | "off"
  const [scanModal, setScanModal] = useState(null); // { image } — 서버 인식이 안 되면 기존 오더 스캔 창으로
  const [drag, setDrag] = useState(false);
  const notesRef = useRef([]); // 다음 질문 앞에 붙일 "[화면 알림]"(적용·취소 결과)
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const today = todayYmd();
  const canWrite = !!orderApi?.canWrite;

  // 대화 불러오기(사람·화면별) · 저장
  const loadedKey = useRef("");
  const skipSave = useRef(false);
  useEffect(() => {
    let st = null;
    try { st = deserializeChat(localStorage.getItem(storeKey)); } catch { st = null; }
    setMessages(st?.messages?.length ? st.messages : helloMsg());
    setHistory(st?.history || []);
    setFocus(null);
    loadedKey.current = storeKey;
    skipSave.current = true; // 같은 순간 도는 저장 효과는 불러오기 전 값(인사말)을 들고 있다 — 한 번 건너뛴다
  }, [storeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (loadedKey.current !== storeKey) return;
    if (skipSave.current) { skipSave.current = false; return; }
    try { localStorage.setItem(storeKey, serializeChat({ messages, history })); } catch { /* 무시 */ }
  }, [messages, history, storeKey]);
  useEffect(() => { if (open) setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 30); }, [messages, busy, open]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 60); }, [open]);

  const rowById = useCallback((id) => dispatches.find((d) => rid(d) === id) || null, [dispatches]);
  const push = (m) => setMessages((p) => [...p, { id: uidGen(), role: "assistant", kind: "text", ...m }]);
  const patchMsg = (id, up) => setMessages((p) => p.map((m) => (m.id === id ? { ...m, ...(typeof up === "function" ? up(m) : up) } : m)));
  const note = (s) => { notesRef.current.push(s); if (notesRef.current.length > 6) notesRef.current.shift(); };

  const T = useTeamData(mode, company, uid, open);
  const tb = teamButtons(mode);

  // ── 서버 제안 → 카드 ──
  const actionToMsg = (a) => {
    if (a.type === "picker") return { kind: "picker", data: { filter: a.filter } };
    if (a.type === "update") return { kind: "update", data: a };
    if (a.type === "bulk") return { kind: "bulk", data: a };
    if (a.type === "create") return { kind: "create", data: { source: "ai", orders: (a.orders || []).map((f) => ({ fields: { ...f } })) } };
    if (a.type === "delete") return { kind: "delete", data: a };
    if (a.type === "schedule") return { kind: "schedule", data: a };
    if (a.type === "navigate") return { kind: "navigate", data: a };
    return null;
  };

  // ── 서버 없이 답하기 ──
  const fallbackReply = (text, why) => {
    const row = focus ? rowById(focus) : null;
    if (row && /삭제|지워/.test(text)) { push({ kind: "delete", data: { items: [{ id: rid(row), col: row.__col, summary: row, done: row.기사확인상태 === "완료" }] } }); return; }
    if (row && /배정|배차/.test(text)) {
      const q = text.replace(/기사|배정|배차|해줘|해|으로|로|님/g, "").replace(/\s+/g, "");
      const np = (v) => String(v || "").replace(/[\s-]/g, "");
      const hit = q ? drivers.filter((d) => (q.length >= 4 && np(d.차량번호).endsWith(q)) || String(d.이름 || "").replace(/\s+/g, "") === q) : [];
      if (hit.length === 1) { const d = hit[0]; push({ kind: "update", data: { kind: "assign", id: rid(row), col: row.__col, summary: row, reason: [d.등급, d.차량톤수, d.차량종류].filter(Boolean).join(" · "), changes: [["차량번호", d.차량번호], ["이름", d.이름], ["전화번호", d.전화번호]].map(([field, after]) => ({ field, after: after || "", before: row[field] ?? "" })) } }); return; }
      if (hit.length > 1) { push({ content: `기사관리에 ${hit.length}명이 있어요. 차량번호로 말씀해 주세요.\n${hit.slice(0, 6).map((d) => `· ${d.이름} ${d.차량번호} ${d.차량톤수 || ""} ${d.차량종류 || ""}`).join("\n")}` }); return; }
    }
    if (row && /문자|안내|카톡/.test(text)) {
      const t = [`[배차 안내] ${row.상차일 || ""} ${row.상차시간 || ""}`.trim(), `상차: ${row.상차지명 || "-"}${row.상차지주소 ? ` (${row.상차지주소})` : ""}${row.상차지담당자번호 ? ` ${row.상차지담당자번호}` : ""}`, `하차: ${row.하차지명 || "-"}${row.하차지주소 ? ` (${row.하차지주소})` : ""}${row.하차지담당자번호 ? ` ${row.하차지담당자번호}` : ""}`, row.화물내용 ? `화물: ${row.화물내용}` : "", [row.차량톤수, row.차량종류].filter(Boolean).length ? `차량: ${[row.차량톤수, row.차량종류].filter(Boolean).join(" ")}` : "", row.기사운임 ? `운임: ${won(row.기사운임)}` : "", row.전달사항 ? `전달사항: ${row.전달사항}` : "", "안전 운행 부탁드립니다."].filter(Boolean).join("\n");
      push({ content: t, copy: true }); return;
    }
    const ch = row ? localEditProposal(text, row) : null;
    if (ch) { push({ kind: "update", data: { id: rid(row), col: row.__col, summary: row, changes: ch.map((c) => ({ ...c, before: row[c.field] ?? "" })) } }); return; }
    const ans = localAnswer(text, { dispatches, clients, today });
    if (ans) { push({ content: ans }); return; }
    push({ content: `${why || "지금은 AI 서버를 쓸 수 없어요."}\n아래 버튼으로 바로 볼 수 있어요. 오더를 고른 뒤 "3파레트를 2파레트로"처럼 말씀하시면 기본 모드에서도 바꿀 수 있어요.`, chips: ["오더 수정", "오늘 배차 현황", "오늘 미배차", "이번 달 매출", "최근 오더", "거래처 순위"] });
  };

  // ── 붙여넣은 오더 글 → 등록 카드 ──
  const intakeText = async (text, { from = "text" } = {}) => {
    setBusy("오더를 읽고 있어요");
    try {
      const blocks = splitPasted(text, splitOrders).filter((b) => b && b.trim()).slice(0, 12);
      const placesN = normPlaces(places);
      const now = new Date();
      const aiOn = !!auth.currentUser; // 둘러보기(로그인 없음)는 규칙 인식만
      let hints = null;
      if (aiOn) hints = await withTimeout(mainScanAi.hintsFor(blocks[0] || ""), 6000).catch(() => null);
      let aiUsed = false;
      const orders = await Promise.all(blocks.map(async (b) => {
        const txt = applyLabelRemaps(b, hints?.remaps?.labelMap);
        let aiNorm = null;
        if (aiOn) {
          try { const r = await withTimeout(mainScanAi.extract(txt, hints?.examples || []), 30000); aiNorm = normalizeAiFields(r?.fields, { today: kstToday() }); aiUsed = true; } catch { aiNorm = null; }
        }
        const r0 = parseOrderScan(txt, { places: placesN, clients, today: now, aiMerge: (F) => { if (aiNorm) mergeAiInto(F, aiNorm); applyAliases(F, hints?.remaps?.aliases); } });
        const r = reconcileRoles(r0, b);
        const vals = {}; Object.entries(r.fields || {}).forEach(([k, f]) => { vals[k] = f.value; });
        const fields = scanValsToFields(vals, r);
        if (!fields.상차일) fields.상차일 = today;
        const checks = Object.entries(r.fields || {}).filter(([, f]) => needsCheck(f)).map(([k]) => k);
        return { fields, scanned: vals, text: b, checks };
      }));
      const good = orders.filter((o) => o.fields.상차지명 || o.fields.하차지명 || o.fields.상차지주소 || o.fields.하차지주소);
      if (!good.length) { push({ content: "오더 내용을 찾지 못했어요. 상차지·하차지가 들어 있는 글인지 확인해 주세요." }); return; }
      push({ content: `${from === "image" ? "캡처에서" : "붙여넣은 글에서"} 오더 ${good.length}건을 찾았어요. 확인하고 등록해 주세요.` });
      push({ kind: "create", data: { source: "scan", ai: aiUsed, orders: good } });
      note(`사용자가 오더 글을 붙여넣어 등록 카드 ${good.length}건이 떴음`);
    } catch (e) {
      console.warn("[AI 비서] 오더 읽기 실패:", e);
      push({ content: "오더를 읽지 못했어요. 다시 붙여넣어 주시겠어요?" });
    } finally { setBusy(""); }
  };
  const intakeImage = async (dataUrl) => {
    setMessages((p) => [...p, { id: uidGen(), role: "user", kind: "image", content: dataUrl.length < 400000 ? dataUrl : "" }]);
    setBusy("캡처에서 글자를 읽고 있어요");
    try {
      if (!auth.currentUser) throw new Error("로그인 필요");
      const prep = await prepImage(dataUrl);
      const up = toUploadJpeg(prep.canvas);
      const r = await withTimeout(mainScanAi.ocr(up.b64), 30000);
      const text = (r?.lines || []).map((l) => l.text).join("\n") || String(r?.text || "");
      if (!text.trim()) throw new Error("빈 결과");
      setBusy("");
      await intakeText(text, { from: "image" });
    } catch (e) {
      setBusy("");
      console.warn("[AI 비서] 서버 글자 인식 실패 → 오더 스캔 창으로:", e?.message || e);
      setScanModal({ image: dataUrl });
    }
  };

  // ── 보내기 ──
  const send = async (raw, opts = {}) => {
    const text = String(raw ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setMessages((p) => [...p, { id: uidGen(), role: "user", kind: "text", content: text.length > 600 ? `${text.slice(0, 600)}…` : text }]);
    // 1) 오더 글을 붙여넣었으면 → 등록 카드
    if (!opts.noIntake && looksLikeOrderText(text) && (text.split("\n").length >= 3 || text.length > 80)) { await intakeText(text); return; }
    // 2) "오더 수정해야 해"처럼 대상이 없으면 → 고르기 목록(서버 없이 바로)
    const it = intentOf(text);
    if (it === "pick_edit" || it === "pick_delete" || it === "pick_assign") {
      push({ content: it === "pick_delete" ? "삭제할 오더를 골라 주세요." : it === "pick_assign" ? "기사를 배정할 오더를 골라 주세요." : "수정할 오더를 골라 주세요. 고르시면 바꿀 내용을 말씀해 주세요." });
      push({ kind: "picker", data: { filter: { range: "today", unassigned: it === "pick_assign", purpose: it === "pick_delete" ? "delete" : it === "pick_assign" ? "assign" : "edit" } } });
      return;
    }
    if (it === "register_help" && aiState === "off") { push({ content: "카톡 캡처나 오더 글을 여기에 붙여넣거나, \"내일 평택항에서 이천센터 5톤 윙 25만원\"처럼 말씀해 주세요." }); return; }
    // 3) AI
    setBusy("생각하고 있어요");
    const notes = notesRef.current.splice(0);
    const fr = focus ? rowById(focus) : null;
    const prefix = [notes.length ? `[화면 알림] ${notes.join(" / ")}` : "", fr ? `[선택한 오더 ${rowSummary(fr)} ${rowTime(fr)}]` : ""].filter(Boolean).join("\n");
    try {
      const out = await askAssistant({ text: prefix ? `${prefix}\n${text}` : text, history, mode: mode || "dispatch", screen, focusOrderId: focus || "", company });
      setAiState("on");
      if (Array.isArray(out?.history)) setHistory(out.history);
      if (out?.reply) push({ content: out.reply, copy: true });
      (out?.actions || []).forEach((a) => { const m = actionToMsg(a); if (m) push(m); });
    } catch (e) {
      notesRef.current.unshift(...notes);
      const code = String(e?.code || "");
      if (code === "out-of-range") { push({ content: "대화가 길어져서 새 대화로 이어갈게요. 다시 한 번 말씀해 주세요." }); setHistory([]); }
      else {
        if (FALLBACK_CODES.has(code) || !code) setAiState("off");
        fallbackReply(text, code === "resource-exhausted" ? e.message : code === "permission-denied" ? e.message : "");
      }
    } finally { setBusy(""); }
  };

  // ── 카드 동작 ──
  const applyUpdate = async (msg) => {
    const d = msg.data; const row = rowById(d.id);
    const { patch, undo, diff } = buildUpdate(row || {}, d.changes.map((c) => ({ field: c.field, after: c.after })));
    if (!Object.keys(patch).length) { patchMsg(msg.id, { status: "applied", note: "이미 같은 값이에요" }); return; }
    patchMsg(msg.id, { busy: true });
    try {
      const r = await orderApi.update(d.id, { ...patch }, row || undefined);
      if (r === false) { patchMsg(msg.id, { busy: false }); return; }
      patchMsg(msg.id, { busy: false, status: "applied", result: { undo, diff } });
      note(`오더 ${d.id} 적용: ${diff.map((x) => `${x.field} ${fmtVal(x.field, x.before)}→${fmtVal(x.field, x.after)}`).join(", ")}`);
    } catch (e) { patchMsg(msg.id, { busy: false, status: "failed", note: e?.message || "" }); }
  };
  const undoUpdate = async (msg) => {
    const d = msg.data; const u = msg.result?.undo; if (!u) return;
    patchMsg(msg.id, { busy: true });
    try {
      await orderApi.update(d.id, { ...u }, rowById(d.id) || undefined);
      patchMsg(msg.id, { busy: false, status: "undone" });
      note(`오더 ${d.id} 되돌림`);
    } catch (e) { patchMsg(msg.id, { busy: false, note: `되돌리지 못했어요 ${e?.message || ""}` }); }
  };
  const applyBulk = async (msg) => {
    patchMsg(msg.id, { busy: true });
    const undo = []; let ok = 0; let fail = 0;
    for (const x of msg.data.items) {
      const row = rowById(x.id);
      const { patch, undo: u } = buildUpdate(row || {}, x.changes.map((c) => ({ field: c.field, after: c.after })));
      if (!Object.keys(patch).length) continue;
      try { const r = await orderApi.update(x.id, { ...patch }, row || undefined); if (r === false) continue; undo.push({ id: x.id, undo: u }); ok += 1; } catch { fail += 1; }
    }
    patchMsg(msg.id, { busy: false, status: ok ? "applied" : "failed", note: `${ok}건${fail ? ` · 실패 ${fail}건` : ""}`, result: { undo } });
    note(`일괄 수정 ${ok}건 적용`);
  };
  const undoBulk = async (msg) => {
    patchMsg(msg.id, { busy: true });
    for (const x of msg.result?.undo || []) { try { await orderApi.update(x.id, { ...x.undo }, rowById(x.id) || undefined); } catch { /* 계속 */ } }
    patchMsg(msg.id, { busy: false, status: "undone" });
    note("일괄 수정 되돌림");
  };
  const editCreate = (msg, i, k, v) => patchMsg(msg.id, (m) => ({ data: { ...m.data, orders: m.data.orders.map((o, j) => (j === i ? { ...o, fields: { ...o.fields, [k]: v }, checks: (o.checks || []).filter((c) => c !== k) } : o)) } }));
  const doCreate = async (msg, idxs) => {
    patchMsg(msg.id, { busy: true });
    const states = [...(msg.result?.states || [])]; const ids = [...(msg.result?.ids || [])];
    let ok = 0; let fail = 0; let opened = false;
    for (const i of idxs) {
      const o = msg.data.orders[i];
      const rec = buildCreateRecord(o.fields, { today });
      try {
        if (msg.data.source === "scan" && o.text) mainScanAi.setPending({ text: o.text, scanned: o.scanned || {}, applied: { ...o.scanned, ...o.fields } });
        const id = await orderApi.create(rec, { source: msg.data.source });
        if (id === false || id == null) { fail += 1; continue; }
        if (msg.data.source === "scan") mainScanAi.commit(rec).catch(() => {}); // 회사별 학습(고친 칸만 기억)
        if (id === "opened") { states[i] = "opened"; opened = true; break; }
        states[i] = "created"; ids.push(id); ok += 1;
      } catch (e) { fail += 1; console.warn("[AI 비서] 등록 실패:", e); }
    }
    const allDone = msg.data.orders.every((_, i) => states[i]);
    patchMsg(msg.id, { busy: false, status: opened ? "opened" : allDone ? "created" : fail && !ok ? "failed" : "pending", note: ok ? `${ok}건${fail ? ` · 실패 ${fail}건` : ""}` : "", result: { states, ids } });
    if (ok) note(`오더 ${ok}건 등록(id ${ids.slice(-ok).join(",")})`);
    if (opened) setOpen(false);
  };
  const undoCreate = async (msg) => {
    const ids = msg.result?.ids || []; if (!ids.length) return;
    patchMsg(msg.id, { busy: true });
    try { await orderApi.remove(ids); patchMsg(msg.id, { busy: false, status: "undone", result: { ...msg.result, ids: [] } }); note(`등록한 오더 ${ids.length}건 되돌림(삭제)`); }
    catch (e) { patchMsg(msg.id, { busy: false, note: `되돌리지 못했어요 ${e?.message || ""}` }); }
  };
  const doDelete = async (msg) => {
    patchMsg(msg.id, { busy: true });
    try { await orderApi.remove(msg.data.items.map((x) => x.id)); patchMsg(msg.id, { busy: false, status: "deleted" }); note(`오더 ${msg.data.items.length}건 삭제`); if (msg.data.items.some((x) => x.id === focus)) setFocus(null); }
    catch (e) { patchMsg(msg.id, { busy: false, status: "failed", note: e?.message || "" }); }
  };
  const saveSchedule = async (msg) => {
    const it = msg.data.item;
    patchMsg(msg.id, { busy: true });
    try {
      const me = auth.currentUser?.uid || uid;
      if (!me) throw new Error("로그인이 필요해요");
      const data = { uid: me, companyName: company || "", title: it.title, date: it.date, endDate: it.date, allDay: !!it.allDay, start: it.allDay ? "" : it.start || "", end: it.allDay ? "" : it.end || "", place: it.place || "", memo: it.memo || "", color: "#1B2B4B", remind: it.allDay && ["10m", "30m", "1h"].includes(it.remind) ? "morning" : it.remind || "none" };
      const at = remindAtOf(data);
      Object.assign(data, { push: data.remind !== "none", remindAt: at, pushPending: data.remind !== "none" && at > Date.now(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await addDoc(collection(db, "personalSchedules"), data);
      patchMsg(msg.id, { busy: false, status: "created" });
      note(`개인일정 등록: ${it.title}`);
    } catch (e) { patchMsg(msg.id, { busy: false, status: "failed", note: e?.message || "" }); }
  };
  const cancelCard = (msg) => { patchMsg(msg.id, { status: "cancelled" }); note(`사용자가 ${msg.kind} 제안을 취소함`); };
  const goMenu = (menu) => {
    if (onNavigate) onNavigate(menu); else window.dispatchEvent(new CustomEvent("kp-go-menu", { detail: menu }));
    if (mobile) setOpen(false);
  };
  const pickRow = (r, purpose) => {
    setFocus(rid(r));
    setMessages((p) => [...p, { id: uidGen(), role: "user", kind: "text", content: `${rowTime(r)} ${rowSummary(r)} 선택` }]);
    if (purpose === "delete") { push({ kind: "delete", data: { items: [{ id: rid(r), col: r.__col, summary: r, done: r.기사확인상태 === "완료" }] } }); return; }
    push({ kind: "focus", data: { id: rid(r) }, content: purpose === "assign" ? "어느 기사님으로 배정할까요? 차량번호나 이름을 말씀해 주세요." : "무엇을 바꿀까요? 예) \"3파레트를 2파레트로\", \"운임 25만\", \"상차지 평택항으로\"" });
    if (purpose === "assign") setInput("기사 배정 ");
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  const newChat = () => { setMessages(helloMsg()); setHistory([]); setFocus(null); notesRef.current = []; try { localStorage.removeItem(storeKey); } catch { /* 무시 */ } };
  const askTeam = (k, label) => { setMessages((p) => [...p, { id: uidGen(), role: "user", kind: "text", content: label }]); push({ content: teamAnswer(mode, k, T, dispatches) }); };

  // 붙여넣기 · 끌어놓기 · 파일
  const readFile = (file) => {
    if (!file) return;
    if (/^image\//.test(file.type)) { const fr = new FileReader(); fr.onload = () => intakeImage(String(fr.result || "")); fr.readAsDataURL(file); return; }
    if (/text|plain/.test(file.type) || /\.txt$/i.test(file.name)) { const fr = new FileReader(); fr.onload = () => { const t = String(fr.result || ""); setMessages((p) => [...p, { id: uidGen(), role: "user", kind: "text", content: `파일 ${file.name}` }]); intakeText(t); }; fr.readAsText(file); return; }
    push({ content: "이미지(캡처)나 카카오톡 대화 내보내기(.txt) 파일만 읽을 수 있어요." });
  };
  const onPaste = (e) => {
    const items = [...(e.clipboardData?.items || [])];
    const img = items.find((x) => /^image\//.test(x.type));
    if (img) { e.preventDefault(); readFile(img.getAsFile()); return; }
    const t = e.clipboardData?.getData("text") || "";
    if (looksLikeOrderText(t) && t.split("\n").length >= 3 && !busy) {
      e.preventDefault();
      setMessages((p) => [...p, { id: uidGen(), role: "user", kind: "text", content: t.length > 600 ? `${t.slice(0, 600)}…` : t }]);
      intakeText(t);
    }
  };

  const focusRow = focus ? rowById(focus) : null;
  const chips = M ? (TEAM_CHIPS[mode] || []) : DISPATCH_CHIPS;
  const win = useWinSize("ai", { S: { w: 380, h: 520 }, M: { w: 460, h: 680 }, L: { w: 680, h: 860 } });
  const showChips = messages.length <= 2;

  const renderMsg = (m) => {
    if (m.role === "user") {
      if (m.kind === "image") return <div style={{ alignSelf: "flex-end", maxWidth: "75%" }}>{m.content ? <img src={m.content} alt="첨부한 캡처" style={{ maxWidth: "100%", maxHeight: 180, borderRadius: 14, border: `1px solid ${LINE}` }} /> : <div style={bubble(true)}>캡처 이미지</div>}</div>;
      return <div style={{ ...bubble(true), alignSelf: "flex-end" }}>{m.content}</div>;
    }
    const wrap = (child) => <div style={{ alignSelf: "stretch" }}>{child}</div>;
    if (m.kind === "picker") return wrap(<OrderPicker msg={m} rows={dispatches} onPick={pickRow} today={today} />);
    if (m.kind === "update") return wrap(<UpdateCard msg={m} row={rowById(m.data.id)} canWrite={canWrite} onApply={() => applyUpdate(m)} onUndo={() => undoUpdate(m)} onCancel={() => cancelCard(m)} />);
    if (m.kind === "bulk") return wrap(<BulkCard msg={m} rowOf={rowById} canWrite={canWrite} onApply={() => applyBulk(m)} onUndo={() => undoBulk(m)} onCancel={() => cancelCard(m)} />);
    if (m.kind === "create") return wrap(<CreateCard msg={m} canWrite={canWrite} mobile={mobile} onChange={(i, k, v) => editCreate(m, i, k, v)} onCreate={(idxs) => doCreate(m, idxs)} onUndo={() => undoCreate(m)} onCancel={() => cancelCard(m)} />);
    if (m.kind === "delete") return wrap(<DeleteCard msg={m} rowOf={rowById} canWrite={canWrite} onDelete={() => doDelete(m)} onCancel={() => cancelCard(m)} />);
    if (m.kind === "schedule") return wrap(<ScheduleCard msg={m} onSave={() => saveSchedule(m)} onCancel={() => cancelCard(m)} />);
    if (m.kind === "navigate") return <button type="button" onClick={() => goMenu(m.data.menu)} style={{ ...btn("primary"), alignSelf: "flex-start" }}>{m.data.label || `${m.data.menu} 열기`}</button>;
    if (m.kind === "focus") {
      const r = rowById(m.data.id);
      return (
        <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={bubble(false)}>{m.content}</div>
          {r && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{FOCUS_CHIPS.map(([l, fill]) => <button key={l} type="button" onClick={() => { if (fill.endsWith(" ") || fill.endsWith("를 ") || fill.endsWith("을 ")) { setInput(fill); inputRef.current?.focus(); } else send(fill); }} style={chipStyle(false)}>{l}</button>)}</div>}
        </div>
      );
    }
    return (
      <div style={{ alignSelf: "flex-start", maxWidth: "92%", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={bubble(false)} data-testid="ai-reply"><Md text={m.content} /></div>
        {m.copy && m.content && m.content.length > 40 && <button type="button" onClick={() => { try { navigator.clipboard?.writeText(m.content.replace(/\*\*/g, "")); } catch { /* 무시 */ } patchMsg(m.id, { copied: true }); }} style={{ ...chipStyle(false), alignSelf: "flex-start", height: 24, fontSize: 11.5 }}>{m.copied ? "복사했어요" : "복사"}</button>}
        {m.chips && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{m.chips.map((c) => <button key={c} type="button" onClick={() => send(c)} style={chipStyle(false)}>{c}</button>)}</div>}
      </div>
    );
  };

  const panelStyle = mobile
    ? { position: "fixed", inset: 0, zIndex: 2147480000, background: "#0B1428", paddingTop: "env(safe-area-inset-top, 0px)", display: "flex", flexDirection: "column" } // 모바일 알림 띠·토스트보다 위(둘러보기 안내 띠보다는 아래)
    : { position: "fixed", bottom: 24, right: 92, width: win.w, height: win.h, zIndex: 9999 };

  return (
    <>
      {mobile ? (
        !open && <button type="button" data-testid="ai-fab" onClick={() => setOpen(true)} aria-label="AI 비서" style={{ position: "fixed", right: 24, bottom: "calc(94px + env(safe-area-inset-bottom, 0px))", width: 56, height: 56, borderRadius: 18, border: "none", zIndex: 9990, color: "#fff", background: "linear-gradient(145deg,#0B1428,#1B2B4B 55%,#2D4C82)", boxShadow: "0 10px 24px rgba(15,26,48,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>{sparkle}</button>
      ) : (
        <FabButton bottom={24} active={open} title="AI 비서" onClick={() => setOpen(!open)}>{sparkle}</FabButton>
      )}

      {open && (
        <div data-ro-allow data-testid="ai-panel" style={panelStyle} className={mobile ? "" : "bg-white rounded-[22px] shadow-[0_24px_60px_rgba(15,26,48,0.35)] border border-[#DCE3EE] flex flex-col overflow-hidden"}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer?.files?.[0]); }}>
          {!mobile && <ResizeGrip onMouseDown={win.startDrag} />}
          <WinHeader code="AI · ASSISTANT" title={M ? M.title : "배차 AI 비서"} sub={aiState === "off" ? "기본 모드" : aiState === "on" ? "Claude 연결됨" : M ? M.sub : "말로 시키는 배차"} preset={mobile ? undefined : win.preset} onPreset={mobile ? undefined : win.setPreset} onClose={() => setOpen(false)}
            right={<button type="button" data-testid="ai-new" onClick={newChat} style={{ height: 26, padding: "0 9px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>새 대화</button>} />

          <div style={{ flex: 1, overflowY: "auto", padding: 14, background: "#F4F6FA", display: "flex", flexDirection: "column", gap: 10, position: "relative" }} data-testid="ai-messages">
            {messages.map((m) => <div key={m.id} style={{ flexShrink: 0, display: "flex", flexDirection: "column" }}>{renderMsg(m)}</div>)}
            {showChips && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                {chips.map((c) => <button key={c} type="button" onClick={() => send(c)} style={chipStyle(false)}>{c}</button>)}
                {tb && tb.map(([k, l]) => <button key={k} type="button" onClick={() => askTeam(k, l)} style={chipStyle(false)}>{l}</button>)}
              </div>
            )}
            {busy && (
              <div style={{ alignSelf: "flex-start", ...bubble(false), display: "flex", alignItems: "center", gap: 8 }} data-testid="ai-typing">
                <span style={{ display: "flex", gap: 4 }}>{[0, 150, 300].map((d) => <span key={d} className="animate-bounce" style={{ width: 7, height: 7, borderRadius: 9, background: "#98A2B3", animationDelay: `${d}ms` }} />)}</span>
                <span style={{ fontSize: 12.5, color: SUB, fontWeight: 700 }}>{busy}</span>
              </div>
            )}
            <div ref={endRef} />
            {drag && <div style={{ position: "absolute", inset: 8, border: `2px dashed ${BLUE}`, borderRadius: 16, background: "rgba(45,76,130,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: BLUE }}>캡처를 놓으면 오더로 읽어요</div>}
          </div>

          <div style={{ borderTop: `1px solid ${LINE}`, background: "#fff", padding: mobile ? "10px 12px calc(10px + env(safe-area-inset-bottom))" : 10 }}>
            {focusRow && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "6px 10px", borderRadius: 10, background: "#EEF3FC", fontSize: 12.5, color: NAVY, fontWeight: 800 }} data-testid="ai-focus">
                <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>선택한 오더 · {rowTime(focusRow)} {rowSummary(focusRow)}</span>
                <button type="button" onClick={() => setFocus(null)} title="선택 해제" style={{ border: "none", background: "transparent", cursor: "pointer", color: SUB, fontWeight: 900 }}>✕</button>
              </div>
            )}
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
              <button type="button" title="캡처·카톡 파일 첨부" onClick={() => fileRef.current?.click()} style={{ width: 38, height: 38, borderRadius: 12, border: `1px solid ${LINE}`, background: "#fff", cursor: "pointer", color: SUB, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>
              </button>
              <input ref={fileRef} type="file" accept="image/*,.txt,text/plain" style={{ display: "none" }} onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ""; }} />
              <textarea ref={inputRef} data-testid="ai-input" value={input} rows={1} onChange={(e) => setInput(e.target.value)} onPaste={onPaste}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
                placeholder={focusRow ? "바꿀 내용을 말씀해 주세요" : "무엇이든 물어보세요 · 캡처 붙여넣기 가능"}
                style={{ flex: 1, minHeight: 38, maxHeight: 120, resize: "none", borderRadius: 12, border: `1px solid ${LINE}`, padding: "9px 12px", fontSize: 14, lineHeight: "20px", outline: "none", fontFamily: "inherit" }} />
              <button type="button" data-testid="ai-send" onClick={() => send()} disabled={!!busy || !input.trim()} style={{ ...btn("primary", !!busy || !input.trim()), height: 38, flexShrink: 0 }}>보내기</button>
            </div>
          </div>
        </div>
      )}

      {scanModal && (
        <OrderScanModal places={places} clients={clients} initial={scanModal} ai={mainScanAi} applyLabel="AI 비서로 보내기"
          onClose={() => setScanModal(null)}
          onApply={(patch, memo, info = {}) => {
            setScanModal(null);
            const fields = { ...patch, ...(memo ? { 메모: memo } : {}) };
            if (!fields.상차일) fields.상차일 = today;
            push({ content: "캡처에서 오더를 찾았어요. 확인하고 등록해 주세요." });
            push({ kind: "create", data: { source: "scan-modal", orders: [{ fields, text: info.text || "" }] } });
          }} />
      )}
    </>
  );
}
const sparkle = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>;
const bubble = (me) => ({
  maxWidth: me ? "82%" : "100%", padding: "10px 13px", borderRadius: 16, fontSize: 14, lineHeight: 1.55, whiteSpace: me ? "pre-wrap" : "normal", wordBreak: "break-word",
  background: me ? NAVY : "#fff", color: me ? "#fff" : "#0F1A30", border: me ? "none" : `1px solid ${LINE}`,
  borderBottomRightRadius: me ? 6 : 16, borderBottomLeftRadius: me ? 16 : 6, boxShadow: me ? "none" : "0 1px 2px rgba(16,24,40,0.04)",
});
