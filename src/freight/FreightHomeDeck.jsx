// ======================= src/freight/FreightHomeDeck.jsx =======================
// 🧭 2026-11-18 컨테이너 · 해상 · 항공 HOME — 내륙 HOME 과 같은 관제 데크(HomeDeck)에 그 업무의 구간 자료를 넣는다
//  HomeDeck 은 배차 오더 모양(상차일 · 청구운임 · 기사운임 · 거래처명 …)을 읽으므로 구간을 그 모양으로 바꿔 넘긴다
//  · 날짜: 작업일(컨테이너) · 출항/출발일(해상 · 항공) — 없으면 등록일
//  · 매출 · 매입: 청구 · 지급 합계(외화는 입력한 환율로 원화 환산)
import React from "react";
import HomeDeck from "../HomeDeck";
import { useFreightJobs } from "./freightStore";
import { isDone, legPnl, HANDOFF_STATUS, topDeadline, portName, airline, todayYmd } from "./freightCore";
import { bizMenuKey } from "../bizModules";

const kstYmd = (ms) => (ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) : "");
const ymdOk = (v) => { const d = String(v || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ""; };
const timeOf = (v) => { const m = /(\d{2}):(\d{2})/.exec(String(v || "").slice(10)); return m ? `${m[1]}:${m[2]}` : ""; };

// 업무마다 다른 글자(HomeDeck 기본은 내륙 배차 용어)
const LABELS = {
  container: { tag: "CONTAINER DECK", mix: "최근 7일 규격 구성", routes: "최근 7일 주요 구간", timeline: "작업 시간대 분포", timeTip: "시 작업", immediate: "오늘 작업 시각 미정" },
  sea: { tag: "OCEAN DECK", mix: "최근 7일 선적 형태", routes: "최근 7일 주요 항로", timeline: "출항 시간대 분포", timeTip: "시 출항", immediate: "오늘 출항 시각 미정" },
  air: { tag: "AIR DECK", mix: "최근 7일 항공사 구성", routes: "최근 7일 주요 노선", timeline: "출발 시간대 분포", timeTip: "시 출발", immediate: "오늘 출발 시각 미정" },
};
const COMMON = { orders: "오늘 건수", done: "완료", pending: "진행 중", progress: "오늘 진행률", board: "오늘 · 내일 작업판", weekday: "요일별 평균 건수", empty: "이번 달 등록된 건이 아직 없어요" };

export function freightDeckRow(j) {
  const p = legPnl(j);
  const when = j.mode === "container" ? `${j.doorDate || ""}${j.doorTime ? ` ${j.doorTime}` : ""}` : j.mode === "inland" ? `${j.pickupDate || ""}${j.pickupTime ? ` ${j.pickupTime}` : ""}` : String(j.etd || "");
  const date = ymdOk(when) || kstYmd(j.createdAtMs);
  const from = j.mode === "container" ? j.pickupPlace : j.mode === "sea" ? portName(j.pol) : j.mode === "air" ? j.dep : j.pickupPlace;
  const to = j.mode === "container" ? j.doorPlace : j.mode === "sea" ? portName(j.pod) : j.mode === "air" ? j.arr : j.dropPlace;
  const kind = j.mode === "container" ? j.size : j.mode === "sea" ? j.seaType : j.mode === "air" ? (airline(j.airline)?.[1] || j.airline) : j.carType;
  return {
    _id: j.id, 상차일: date, 상차시간: timeOf(when) || (j.mode === "container" ? j.doorTime : ""),
    청구운임: p.sale, 기사운임: p.cost, 거래처명: j.client || "",
    등록자명: j.manager || j.createdBy || "", 차량종류: kind || "미지정", 상차지명: from || "-", 하차지명: to || "-",
    배차상태: isDone(j) ? "배차완료" : "배차중",
  };
}

// 오늘 할 일 — 마감 지남 · 24시간 안 마감 · 받은 인계 요청 · 진행 중(누르면 그 화면) · 내륙 홈의 업무 현황과 같은 모양
const TD = { sub: "rgba(207,224,255,.8)", dim: "rgba(207,224,255,.6)", glow: "#8FB0F0", warn: "#FF9C8F", amber: "#F2C879" };
const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' };
function FreightTodo({ jobs, onGo }) {
  const now = Date.now();
  const active = jobs.filter((j) => !isDone(j) && j.status !== HANDOFF_STATUS);
  const dues = active.map((j) => topDeadline(j, now)).filter(Boolean);
  const over = dues.filter((d) => d.level === "over").length;
  const urgent = dues.filter((d) => d.level === "urgent").length;
  const handoff = jobs.filter((j) => j.status === HANDOFF_STATUS).length;
  const today = todayYmd(now);
  const todayN = active.filter((j) => freightDeckRow(j).상차일 === today).length;
  const cells = [
    { k: "over", code: "OVERDUE", label: "마감 지남", n: over, tone: over ? TD.warn : "#fff", sub: over ? "초과 비용이 생길 수 있어요" : "지난 마감 없음", go: "deadline" },
    { k: "urgent", code: "24H", label: "24시간 안 마감", n: urgent, tone: urgent ? TD.amber : "#fff", sub: urgent ? "마감보드에서 확인해 주세요" : "급한 마감 없음", go: "deadline" },
    { k: "handoff", code: "HANDOFF", label: "받은 인계 요청", n: handoff, tone: handoff ? TD.amber : "#fff", sub: handoff ? "인계함에서 접수해 주세요" : "대기 중인 인계 없음", go: "handoff" },
    { k: "active", code: "ACTIVE", label: "진행 중", n: active.length, tone: "#fff", sub: todayN ? `오늘 일정 ${todayN}건` : "오늘 일정 없음", go: "list" },
  ];
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 6px 0 2px", minWidth: 84 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", color: TD.glow }}>TO-DO</span>
        <span style={{ fontSize: 15, fontWeight: 900, color: "#fff", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>업무 현황</span>
      </div>
      {cells.map((c) => (
        <button key={c.k} type="button" onClick={() => onGo?.(c.go)} title={`${c.label} 화면 열기`} className="hd-tile kp-todo"
          style={{ flex: "1 1 190px", minWidth: 0, borderRadius: 14, padding: "9px 14px", display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer", position: "relative", overflow: "hidden" }}>
          <span style={{ ...NUM, fontSize: 26, fontWeight: 800, lineHeight: 1, color: c.tone, letterSpacing: "-0.02em", minWidth: 34, textAlign: "right" }}>{c.n.toLocaleString()}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: TD.sub, whiteSpace: "nowrap" }}>{c.label}</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.16em", color: "rgba(207,224,255,.38)" }}>{c.code}</span>
            </span>
            <span style={{ ...NUM, display: "block", marginTop: 2, fontSize: 12, fontWeight: 600, color: TD.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</span>
          </span>
          <span className="kp-todo-go" style={{ fontSize: 13, color: "rgba(207,224,255,.4)" }}>→</span>
        </button>
      ))}
      <style>{".kp-todo:hover .kp-todo-go{color:#fff;transform:translateX(2px)} .kp-todo-go{transition:transform .15s,color .15s} .kp-todo:focus-visible{outline:2px solid #8FB0F0;outline-offset:2px}"}</style>
    </div>
  );
}

// 📏 2026-11-25 내륙 홈은 매출 · 수익을 배차완료만 세지만(salesRule), 화물(컨테이너 · 해상 · 항공) 홈은 예전처럼 진행 중 건도 넣는다
const FREIGHT_MONEY = () => true;
export default function FreightHomeDeck({ biz, onMenu, users = [], myName = "", isMaster = false, att = null }) {
  const { jobs: all, loaded } = useFreightJobs();
  const jobs = React.useMemo(() => all.filter((j) => j.mode === biz), [all, biz]);
  const rows = React.useMemo(() => jobs.map(freightDeckRow), [jobs]);
  const thisMonth = todayYmd().slice(0, 7);
  // 지난 기간 캐시 없이 모든 건을 실시간으로 센다(구간 수가 많지 않다)
  const past = React.useMemo(() => (loaded ? { days: {}, staff: {}, clients: {}, month: thisMonth } : null), [loaded, thisMonth]);
  return (
    <HomeDeck dispatchData={rows} pastCache={past} liveStart="0000-00-00" users={users} myName={myName} isMaster={isMaster} att={att} isMoney={FREIGHT_MONEY}
      labels={{ ...COMMON, ...(LABELS[biz] || {}) }}
      todo={<FreightTodo jobs={jobs} onGo={(p) => onMenu?.(bizMenuKey(biz, p))} />} />
  );
}
