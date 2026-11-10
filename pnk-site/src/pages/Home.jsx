// ======================= pnk-site/src/pages/Home.jsx =======================
// 본사 대시보드 — 오늘 할 일 · 일정 · 공지 · 메일을 한눈에, 대표에게는 고객사 · 매출 관제까지
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMeCtx } from "../App";
import {
  DEFAULT_LINKS, SERVICES, hm, SERVICE_STATUS, addRow, by, fmtTime, invoiceByMonth, limit, loadPlatform, orderBy, productLabel,
  stageLabel, useCol, useDocLive, where, ymd, won,
} from "../pnkApi";
import { Btn, Card, Chip, Empty, Input, Stat, cx, fail } from "../ui";
import Icon from "../icons";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
function greet() {
  const h = new Date().getHours();
  return h < 6 ? "늦은 시간까지 고생 많으십니다" : h < 12 ? "좋은 아침입니다" : h < 18 ? "오후도 힘내세요" : "오늘 하루 수고 많으셨습니다";
}
const lastMonths = (n) => {
  const out = []; const d = new Date(); d.setDate(1);
  for (let i = n - 1; i >= 0; i -= 1) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(ymd(x).slice(0, 7)); }
  return out;
};

// 한국 시간 시계(30초마다)
function useClock() {
  const [t, setT] = React.useState(() => new Date());
  React.useEffect(() => { const i = setInterval(() => setT(new Date()), 30000); return () => clearInterval(i); }, []);
  return t;
}

export default function Home() {
  const me = useMeCtx();
  const nav = useNavigate();
  const uid = me.user.uid;
  const today = ymd();
  const now = useClock();
  const d = new Date(now.getTime() + 9 * 3600e3); // 한국 시간
  const info = useDocLive("pnkCompany/info");
  const [tasks] = useCol("pnkTasks", [where("status", "in", ["todo", "doing"])], []);
  const [events] = useCol("pnkEvents", [where("date", ">=", today), orderBy("date"), limit(12)], [today]);
  const [posts] = useCol("pnkPosts", [orderBy("createdAt", "desc"), limit(8)], []);
  const [mails] = useCol("pnkMail", [where("toUids", "array-contains", uid)], [uid]);
  const [sales] = useCol("pnkSales", [], []);
  const [services] = useCol("pnkServices", [], []);
  const [members] = useCol("pnkMembers", [where("status", "==", "active")], []);
  const [att] = useCol("pnkAttendance", [where("date", "==", today)], [today]);
  const [aps] = useCol("pnkApprovals", [where("viewers", "array-contains", uid), where("status", "==", "pending")], [uid]);
  const myAtt = (att || []).find((r) => r.uid === uid);
  const myTurn = (aps || []).filter((a) => a.line?.[a.step]?.uid === uid);
  const myUp = (aps || []).filter((a) => a.authorUid === uid);
  const [plat, setPlat] = React.useState(undefined);
  React.useEffect(() => { if (me.owner) loadPlatform().then(setPlat); }, [me.owner]);

  const mine = (tasks || []).filter((t) => t.assigneeUid === uid).sort((a, b) => String(a.due || "9").localeCompare(String(b.due || "9")));
  const overdue = mine.filter((t) => t.due && t.due < today).length;
  const unread = (mails || []).filter((m) => !m.readBy?.[uid] && !m.trashBy?.[uid]);
  const openDeals = (sales || []).filter((s) => !["won", "lost"].includes(s.stage));
  const followUps = openDeals.filter((s) => s.nextDate && s.nextDate <= today);
  const links = info?.links?.length ? info.links : DEFAULT_LINKS;
  const svc = Object.fromEntries((services || []).map((s) => [s.id, s]));
  const todayEvents = (events || []).filter((e) => e.date === today);

  const [quick, setQuick] = React.useState("");
  const addQuick = () => {
    if (!quick.trim()) return;
    const b = by(me);
    addRow("pnkTasks", { title: quick.trim(), desc: "", status: "todo", product: "common", priority: "normal", assigneeUid: b.uid, assigneeName: b.name, due: today, createdBy: b.uid, createdByName: b.name, order: Date.now() })
      .then(() => setQuick("")).catch(fail);
  };

  // 대표: 최근 6개월 가입 추이 · 수납
  const months = lastMonths(6);
  const trend = plat ? months.map((m) => ({ m: `${Number(m.slice(5))}월`, 운송사: plat.monthly[m]?.companies || 0, 직원: plat.monthly[m]?.staff || 0, 기사: plat.monthly[m]?.drivers || 0 })) : [];
  const inv = plat ? invoiceByMonth(plat.invoices)[today.slice(0, 7)] : null;

  return (
    <div>
      {/* 인사 */}
      <section className="relative overflow-hidden rounded-[26px] px-6 md:px-8 py-6 md:py-7 text-white mb-5 shadow-[0_14px_34px_rgba(27,43,75,0.25)]"
        style={{ background: "linear-gradient(120deg, #1B2B4B 0%, #233B66 55%, #2D4C82 100%)" }}>
        <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-white/[0.06]" />
        <div className="absolute right-40 -bottom-24 w-56 h-56 rounded-full bg-white/[0.05]" />
        <div className="relative flex flex-col lg:flex-row lg:items-end gap-5">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-blue-100/85">{d.getUTCMonth() + 1}월 {d.getUTCDate()}일 {WEEK[d.getUTCDay()]}요일 <span className="tnum ml-1 text-white">{hm(now)}</span> · PnK PROJECT 본사</div>
            <h1 className="mt-1.5 text-[24px] md:text-[28px] font-black tracking-tight">{me.member?.name || ""}님, {greet()}</h1>
            <p className="mt-2 text-[14px] font-medium text-blue-50/90">
              내 업무 {mine.length}건{overdue ? ` (기한 지남 ${overdue})` : ""} · 오늘 일정 {todayEvents.length}건 · 안 읽은 메일 {unread.length}통
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold bg-white/10 ring-1 ring-white/20 hover:bg-white/20">
                {l.label}<Icon name="link" size={14} />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* 숫자 카드 */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-5">
        <Stat icon="board" label="내 진행 업무" value={mine.length} sub={overdue ? `기한 지남 ${overdue}건` : "기한 지난 업무 없음"} onClick={() => nav("/tasks")} />
        <Stat icon="mail" label="안 읽은 메일" value={unread.length} sub="사내메일" onClick={() => nav("/mail")} />
        <Stat icon="handshake" label="진행 중 영업" value={openDeals.length} sub={followUps.length ? `오늘까지 연락 ${followUps.length}곳` : "예정된 연락 없음"} onClick={() => nav("/sales")} />
        {me.owner && plat
          ? <Stat icon="building" label="고객 운송사" value={plat.totals.companies} sub={`직원 ${plat.totals.staff} · 기사 ${plat.totals.drivers}`} onClick={() => nav("/customers")} />
          : <Stat icon="users" label="PnK 구성원" value={(members || []).length} sub="사용 중 계정" onClick={() => nav("/members")} />}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-5">
        {/* 왼쪽 2칸 */}
        <div className="xl:col-span-2 space-y-4 md:space-y-5">
          {me.owner && (
            <Card en="HQ CONTROL" title="로지스웹 사업 관제" right={<Link to="/customers" className="text-[12.5px] font-bold text-navy-500">자세히</Link>}>
              {plat === undefined ? <div className="h-[220px] flex items-center justify-center text-[13px] text-[#7A8AA8]">불러오는 중…</div> : !plat ? <Empty>고객사 데이터를 읽지 못했습니다.</Empty> : (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-5">
                  <div className="h-[220px] -ml-3">
                    <ResponsiveContainer>
                      <AreaChart data={trend}>
                        <defs>
                          <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2D4C82" stopOpacity={0.35} /><stop offset="100%" stopColor="#2D4C82" stopOpacity={0} /></linearGradient>
                          <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8FA6D6" stopOpacity={0.35} /><stop offset="100%" stopColor="#8FA6D6" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid stroke="#EEF1F6" vertical={false} />
                        <XAxis dataKey="m" tick={{ fontSize: 12, fill: "#7A8AA8" }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#7A8AA8" }} axisLine={false} tickLine={false} width={36} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E3E8F0", fontSize: 12 }} />
                        <Area type="monotone" dataKey="직원" stroke="#2D4C82" strokeWidth={2.5} fill="url(#gA)" />
                        <Area type="monotone" dataKey="기사" stroke="#8FA6D6" strokeWidth={2} fill="url(#gB)" />
                        <Area type="monotone" dataKey="운송사" stroke="#0F1A30" strokeWidth={2} fill="none" />
                      </AreaChart>
                    </ResponsiveContainer>
                    <div className="pl-3 text-[11.5px] text-[#7A8AA8] font-semibold">최근 6개월 신규 가입(운송사 · 직원 · 기사)</div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 content-start">
                    {[
                      ["승인 대기 운송사", plat.pendingTransport.length, "건"],
                      ["승인 대기 직원", plat.totals.pendingStaff, "명"],
                      ["새 도입 문의", plat.totals.newInquiries, "건"],
                      ["처리 안 한 오류 신고", plat.totals.openErrors, "건"],
                      ["이달 입금 완료", inv ? won(inv.paid) : "0원", ""],
                    ].map(([k, v, u]) => (
                      <div key={k} className="rounded-2xl bg-navy-50 px-3.5 py-2.5">
                        <div className="text-[11.5px] font-bold text-[#5A6A86]">{k}</div>
                        <div className="text-[17px] font-black text-navy-950 tnum">{v}{u && <span className="text-[12px] ml-0.5">{u}</span>}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* 서비스 상태 */}
          <Card en="SERVICES" title="서비스 상태" right={<Link to="/services" className="text-[12.5px] font-bold text-navy-500">서비스 현황</Link>}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SERVICES.map((s) => {
                const st = SERVICE_STATUS.find((x) => x.key === (svc[s.key]?.status || "ok"));
                const open = (tasks || []).filter((t) => t.product === s.key).length;
                return (
                  <div key={s.key} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
                    <div className="w-10 h-10 rounded-xl bg-navy-100 text-navy flex items-center justify-center shrink-0"><Icon name={s.icon} size={19} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="text-[14px] font-black truncate">{s.label}</span>
                        <span className={cx("w-2 h-2 rounded-full", st.key === "ok" ? "bg-emerald-500" : st.key === "issue" ? "bg-rose-500 animate-pulse" : "bg-amber-500")} /></div>
                      <div className="text-[12px] text-[#7A8AA8] truncate">{st.label}{svc[s.key]?.version ? ` · v${svc[s.key].version}` : ""} · 진행 업무 {open}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 최근 글 */}
          <Card en="NEWS" title="최근 공지 · 게시글" right={<Link to="/notice" className="text-[12.5px] font-bold text-navy-500">전체</Link>} pad={false}>
            {!posts ? null : posts.length === 0 ? <Empty icon="megaphone">아직 올라온 글이 없습니다.</Empty> : (
              <ul className="divide-y divide-[#EEF1F6]">
                {posts.map((p) => (
                  <li key={p.id}>
                    <Link to={`${p.board === "notice" ? "/notice" : "/board"}?id=${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-navy-50">
                      <Chip tone={p.board === "notice" ? "dark" : "gray"}>{p.board === "notice" ? "공지" : p.board === "minutes" ? "회의록" : "게시판"}</Chip>
                      <span className={cx("flex-1 min-w-0 truncate text-[14px]", !p.readBy?.[uid] && p.authorUid !== uid ? "font-black" : "font-semibold text-[#3A4A66]")}>{p.title}</span>
                      <span className="text-[12px] text-[#7A8AA8] shrink-0">{p.authorName} · {fmtTime(p.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* 오른쪽 */}
        <div className="space-y-4 md:space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Link to="/attendance" className="rounded-[20px] p-4 text-white shadow-[0_10px_28px_rgba(27,43,75,0.2)]" style={{ background: "linear-gradient(150deg,#1B2B4B,#2D4C82)" }}>
              <div className="text-[11px] font-extrabold tracking-[0.16em] text-blue-200/80">ATTENDANCE</div>
              <div className="mt-1 text-[15px] font-black">{!myAtt ? "출근 전" : myAtt.outAt ? "퇴근 완료" : "근무 중"}</div>
              <div className="text-[12px] text-blue-100/85 tnum">{myAtt?.inAt ? `${hm(new Date(myAtt.inAt))} 출근` : "누르면 출근 화면"}{myAtt?.outAt ? ` · ${hm(new Date(myAtt.outAt))} 퇴근` : ""}</div>
              <div className="mt-3 h-9 rounded-xl bg-white text-navy text-[13.5px] font-black flex items-center justify-center">{!myAtt ? "출근하기" : myAtt.outAt ? "기록 보기" : "퇴근하기"}</div>
              <div className="mt-2 text-[11.5px] text-blue-100/70">오늘 출근 {(att || []).length} / {(members || []).length}명</div>
            </Link>
            <Link to="/approvals" className="rounded-[20px] p-4 bg-white border border-line shadow-[0_10px_28px_rgba(16,24,40,0.06)] hover:border-navy-500 transition">
              <div className="text-[11px] font-extrabold tracking-[0.16em] text-[#7A8AA8]">E-APPROVAL</div>
              <div className="mt-1 text-[15px] font-black">결재할 문서</div>
              <div className="text-[34px] font-black tnum leading-tight">{myTurn.length}<span className="text-[14px] ml-0.5">건</span></div>
              <div className="text-[12px] text-[#7A8AA8]">내가 올린 진행 중 {myUp.length}건</div>
            </Link>
          </div>
          <Card en="MY TASKS" title="내 업무" right={<Link to="/tasks" className="text-[12.5px] font-bold text-navy-500">보드</Link>}>
            <div className="flex gap-2 mb-3">
              <Input value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addQuick(); }} placeholder="오늘 할 일 바로 추가" />
              <Btn icon="plus" onClick={addQuick} aria-label="추가" />
            </div>
            {mine.length === 0 ? <div className="text-[13px] text-[#7A8AA8] py-3 text-center">맡은 업무가 없습니다.</div> : (
              <ul className="space-y-1.5">
                {mine.slice(0, 7).map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-[13.5px]">
                    <span className={cx("w-1.5 h-1.5 rounded-full shrink-0", t.status === "doing" ? "bg-navy-500" : "bg-[#C9D3E4]")} />
                    <span className="flex-1 truncate font-semibold">{t.title}</span>
                    <span className="text-[11.5px] text-[#7A8AA8] shrink-0">{productLabel(t.product)}</span>
                    {t.due && <span className={cx("text-[11.5px] font-bold shrink-0 tnum", t.due < today ? "text-rose-600" : "text-[#7A8AA8]")}>{t.due.slice(5).replace("-", "/")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card en="SCHEDULE" title="다가오는 일정" right={<Link to="/calendar" className="text-[12.5px] font-bold text-navy-500">달력</Link>}>
            {(events || []).length === 0 && followUps.length === 0 ? <div className="text-[13px] text-[#7A8AA8] py-3 text-center">예정된 일정이 없습니다.</div> : (
              <ul className="space-y-2">
                {followUps.slice(0, 3).map((s) => (
                  <li key={`s${s.id}`} className="flex items-center gap-3">
                    <div className="w-11 text-center shrink-0"><div className="text-[11px] font-bold text-rose-600">영업</div><div className="text-[13px] font-black tnum">{s.nextDate.slice(5).replace("-", "/")}</div></div>
                    <div className="min-w-0"><div className="text-[13.5px] font-bold truncate">{s.company} — {s.nextAction || "연락"}</div><div className="text-[12px] text-[#7A8AA8]">{stageLabel(s.stage)} · {s.ownerName}</div></div>
                  </li>
                ))}
                {(events || []).slice(0, 6).map((e) => (
                  <li key={e.id} className="flex items-center gap-3">
                    <div className="w-11 text-center shrink-0"><div className="text-[11px] font-bold text-[#7A8AA8]">{WEEK[new Date(`${e.date}T12:00:00Z`).getUTCDay()]}</div><div className="text-[13px] font-black tnum">{e.date.slice(5).replace("-", "/")}</div></div>
                    <div className="min-w-0"><div className="text-[13.5px] font-bold truncate">{e.title}</div><div className="text-[12px] text-[#7A8AA8]">{e.time || "종일"}{e.memo ? ` · ${e.memo}` : ""}</div></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card en="INBOX" title="안 읽은 메일" right={<Link to="/mail" className="text-[12.5px] font-bold text-navy-500">메일함</Link>} pad={false}>
            {unread.length === 0 ? <div className="text-[13px] text-[#7A8AA8] py-6 text-center">새 메일이 없습니다.</div> : (
              <ul className="divide-y divide-[#EEF1F6]">
                {unread.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 5).map((m) => (
                  <li key={m.id}><Link to={`/mail?id=${m.id}`} className="block px-5 py-2.5 hover:bg-navy-50">
                    <div className="flex items-center gap-2"><span className="text-[13px] font-black truncate flex-1">{m.fromName}</span><span className="text-[11.5px] text-[#7A8AA8]">{fmtTime(m.createdAt)}</span></div>
                    <div className="text-[13px] text-[#3A4A66] truncate">{m.subject}</div>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
