// ======================= src/driver/DriverPayTab.jsx =======================
// 💰 2026-11-26 기사앱 [정산] 탭(2차 시안) — 지입 · 직영 등 오더를 받는 기사만
//  · 기사앱이 이미 받아 둔 내 오더(driverOrders — 기사운임만 있다)로 계산한다(서버 추가 조회 없음)
//  · 이번 달 · 지난달 · 그 전 달: 큰 숫자(기사운임 합계 = 운송사 "이번 달 정산 예정"과 같은 기준) · 날짜별 막대 · 오더별 금액
//  · 완료한 운송 / 예정(수락 · 대기)을 나눠 보여 준다 · 공제 전 금액 — 확정 금액은 서류함 › 명세서
import React from "react";

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const fareOf = (o) => Number(String(o?.기사운임 ?? "").replace(/[^\d.-]/g, "")) || 0;
const ymOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const isLive = (o) => !(o.배차상태 === "배차취소" || o.상태 === "취소" || o.기사확인상태 === "거절");
const short = (s) => String(s || "").replace(/^(주식회사|\(주\)|㈜)\s*/, "").trim();

export function monthPay(orders, ym) {
  const list = (orders || []).filter((o) => isLive(o) && String(o.상차일 || "").slice(0, 7) === ym);
  const done = list.filter((o) => o.기사확인상태 === "완료");
  const sum = (a) => a.reduce((s, o) => s + fareOf(o), 0);
  const byDay = {};
  list.forEach((o) => { const d = Number(String(o.상차일).slice(8, 10)) || 0; byDay[d] = (byDay[d] || 0) + fareOf(o); });
  return { list, total: sum(list), done: sum(done), plan: sum(list) - sum(done), doneCnt: done.length, byDay };
}

const CSS = `
.kpp{display:flex;flex-direction:column;gap:14px;color:#EEF2FF}
.kpp-top{display:flex;align-items:center;justify-content:space-between;padding:2px 4px}
.kpp-top h2{font-size:24px;font-weight:800;letter-spacing:-.6px;color:var(--kpp-h,#0F1A30)}
.kpd-dark .kpp-top h2{--kpp-h:#F3F6FD}
.kpp-seg{display:inline-flex;background:rgba(27,43,75,.08);border-radius:18px;padding:3px}
.kpd-dark .kpp-seg{background:rgba(255,255,255,.06)}
.kpp-seg button{border:0;background:none;padding:7px 13px;border-radius:15px;font:inherit;font-size:13px;font-weight:700;color:#7D8BA3;cursor:pointer}
.kpp-seg button.on{background:#1B2B4B;color:#fff}
.kpd-dark .kpp-seg button.on{background:rgba(255,255,255,.14)}
.kpp-hero{position:relative;overflow:hidden;border-radius:24px;padding:22px 20px 18px;background:radial-gradient(420px 200px at 90% -40px,rgba(111,160,255,.35),transparent 70%),linear-gradient(160deg,#0B1530,#13234A 55%,#1F3A6E);box-shadow:0 18px 40px rgba(11,20,48,.35),inset 0 1px 0 rgba(255,255,255,.08)}
.kpp-hero:after{content:"";position:absolute;top:-40%;bottom:-40%;left:0;width:90px;background:linear-gradient(90deg,transparent,rgba(225,232,255,.12),transparent);transform:translateX(-160px) skewX(-20deg);animation:kppSweep 9s cubic-bezier(.45,.05,.3,1) infinite}
@keyframes kppSweep{0%,55%{transform:translateX(-160px) skewX(-20deg)}100%{transform:translateX(560px) skewX(-20deg)}}
.kpp-eye{font-size:11px;letter-spacing:2.2px;color:#93A3C8;font-weight:700}
.kpp-big{font-size:36px;font-weight:800;letter-spacing:-1.2px;margin-top:6px;font-variant-numeric:tabular-nums}
.kpp-big small{font-size:17px;font-weight:700;margin-left:3px;color:#C9D3EA}
.kpp-sub{font-size:13px;color:#93A3C8;margin-top:4px;line-height:1.5}
.kpp-sub b{color:#7BE3BE;font-weight:700}.kpp-sub b.dn{color:#FCA5A5}
.kpp-bars{margin-top:16px;height:72px;display:flex;align-items:flex-end;gap:3px}
.kpp-bars i{flex:1;border-radius:3px;background:rgba(175,195,255,.2);min-height:3px}
.kpp-bars i.on{background:linear-gradient(#DDE6FF,#7E98F2);box-shadow:0 0 12px rgba(175,195,255,.5)}
.kpp-axis{display:flex;justify-content:space-between;font-size:10px;color:#6F7EA3;margin-top:5px}
.kpp-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.kpp-two div{border-radius:18px;padding:13px 14px;background:linear-gradient(160deg,#101B38,#16264D);box-shadow:inset 0 0 0 1px rgba(175,195,255,.1)}
.kpp-two span{font-size:12px;color:#93A3C8;font-weight:600}.kpp-two b{display:block;font-size:19px;font-weight:800;margin-top:3px;font-variant-numeric:tabular-nums}
.kpp-two em{font-style:normal;font-size:12px;color:#93A3C8;font-weight:600;margin-left:4px}
.kpp-list{border-radius:20px;padding:4px 16px;background:linear-gradient(160deg,#0E1833,#14224A);box-shadow:inset 0 0 0 1px rgba(175,195,255,.08)}
.kpp-li{display:flex;align-items:center;gap:12px;padding:13px 0}
.kpp-li+.kpp-li{border-top:1px solid rgba(255,255,255,.07)}
.kpp-li .d{width:38px;font-size:12px;color:#93A3C8;font-weight:700;font-variant-numeric:tabular-nums}
.kpp-li .m{flex:1;min-width:0}.kpp-li .m b{display:block;font-size:14.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kpp-li .m small{font-size:12px;color:#93A3C8}
.kpp-li .a{text-align:right;font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}
.kpp-li .a small{display:block;font-size:11px;font-weight:700}
.kpp-empty{padding:26px 0;text-align:center;font-size:14px;color:#93A3C8}
.kpp-note{font-size:12.5px;color:#7D8BA3;text-align:center;line-height:1.5;padding:0 8px}
@media (prefers-reduced-motion:reduce){.kpp-hero:after{animation:none;display:none}}
`;

export default function DriverPayTab({ orders = [], onOpenDocs }) {
  const now = new Date();
  const months = [0, 1, 2].map((k) => ymOf(new Date(now.getFullYear(), now.getMonth() - k, 1)));
  const [ym, setYm] = React.useState(months[0]);
  const cur = React.useMemo(() => monthPay(orders, ym), [orders, ym]);
  const prevYm = ymOf(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 2, 1));
  const prev = React.useMemo(() => monthPay(orders, prevYm), [orders, prevYm]);
  const days = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  const maxDay = Math.max(1, ...Object.values(cur.byDay));
  const isThis = ym === months[0];
  const todayD = now.getDate();
  const diff = prev.total > 0 ? Math.round(((cur.total - prev.total) / prev.total) * 100) : null;
  const rows = [...cur.list].sort((a, b) => String(b.상차일 || "").localeCompare(String(a.상차일 || "")) || String(b.상차시간 || "").localeCompare(String(a.상차시간 || "")));
  const mLabel = (m) => `${Number(m.slice(5, 7))}월`;
  return (
    <div className="kpp">
      <style>{CSS}</style>
      <div className="kpp-top">
        <h2>정산</h2>
        <div className="kpp-seg" role="tablist">
          {[...months].reverse().map((m) => <button key={m} type="button" className={m === ym ? "on" : ""} onClick={() => setYm(m)}>{mLabel(m)}</button>)}
        </div>
      </div>

      <div className="kpp-hero">
        <div className="kpp-eye">{mLabel(ym)} {isThis ? "예상 정산" : "정산"} · 기사운임</div>
        <div className="kpp-big">{won(cur.total)}<small>원</small></div>
        <div className="kpp-sub">
          운송 {cur.list.length}건{diff != null ? <> · 지난달보다 <b className={diff < 0 ? "dn" : ""}>{diff >= 0 ? `${diff}% 많아요` : `${-diff}% 적어요`}</b></> : null}
        </div>
        <div className="kpp-bars" aria-hidden="true">
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
            <i key={d} className={isThis && d === todayD ? "on" : ""} style={{ height: `${cur.byDay[d] ? Math.max(8, (cur.byDay[d] / maxDay) * 100) : 4}%`, opacity: isThis && d > todayD && !cur.byDay[d] ? 0.35 : 1 }} />
          ))}
        </div>
        <div className="kpp-axis"><span>1일</span><span>{Math.ceil(days / 2)}일</span><span>{days}일</span></div>
      </div>

      <div className="kpp-two">
        <div><span>운송 완료</span><b>{won(cur.done)}<em>{cur.doneCnt}건</em></b></div>
        <div><span>{isThis ? "남은 예정" : "완료 안 됨"}</span><b>{won(cur.plan)}<em>{cur.list.length - cur.doneCnt}건</em></b></div>
      </div>

      <div className="kpp-list">
        {rows.length === 0 ? <div className="kpp-empty">{mLabel(ym)}에 운송한 오더가 없어요</div> : rows.map((o, i) => {
          const done = o.기사확인상태 === "완료";
          return (
            <div key={o._id || i} className="kpp-li">
              <span className="d">{Number(String(o.상차일).slice(5, 7))}/{Number(String(o.상차일).slice(8, 10))}</span>
              <div className="m">
                <b>{[o.상차지명, o.하차지명].filter(Boolean).join(" → ") || "-"}</b>
                <small>{short(o.거래처명) || "-"}</small>
              </div>
              <span className="a">{won(fareOf(o))}<small style={{ color: done ? "#7BE3BE" : "#F3D28A" }}>{done ? "완료" : o.기사확인상태 === "대기" ? "확인 전" : "예정"}</small></span>
            </div>
          );
        })}
      </div>

      <div className="kpp-note">
        공제(지입료 · 보험 등) 전 금액이에요. 확정된 금액은{" "}
        {onOpenDocs ? <button type="button" onClick={onOpenDocs} style={{ border: 0, background: "none", padding: 0, font: "inherit", color: "#8FA8FF", fontWeight: 700, cursor: "pointer" }}>서류함 › 명세서</button> : "서류함 › 명세서"}
        에서 봐 주세요.
      </div>
    </div>
  );
}
