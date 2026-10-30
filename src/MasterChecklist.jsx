// ======================= src/MasterChecklist.jsx =======================
// 👑 마스터 시작 체크리스트(2026-10-30) — 신규 운송사를 처음 가입한 마스터 계정의 홈 맨 위에 뜬다.
//  회사가 실제로 굴러가려면 마스터가 먼저 해 둘 일을 순서대로 보여주고, 끝난 항목은 자동으로 체크된다.
//  모두 끝내거나 "숨기기"를 누르면 companySettings/{회사}.masterChecklistDone 로 다시 안 뜬다.
import React from "react";
import { collection, doc, getDocs, limit, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { usePlan, PLAN_DEFAULTS } from "./plans";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const go = (menu) => { try { window.__setMainTab?.(menu); window.scrollTo(0, 0); } catch { /* 무시 */ } };

async function hasAny(col, co, extra = []) {
  try {
    const s = await getDocs(query(collection(db, col), where("companyName", "==", co), ...extra, limit(2)));
    return s.size;
  } catch { return 0; }
}

export default function MasterChecklist({ user, userCompany }) {
  const co = String(userCompany || "").trim();
  const [me, setMe] = React.useState(null);
  const [st, setSt] = React.useState(null);
  const [settings, setSettings] = React.useState(undefined);
  const [copied, setCopied] = React.useState(false);
  const { planId } = usePlan();

  React.useEffect(() => {
    if (!user?.uid) return undefined;
    return onSnapshot(doc(db, "users", user.uid), (s) => setMe(s.exists() ? s.data() : null), () => setMe(null));
  }, [user?.uid]);
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(doc(db, "companySettings", co), (s) => setSettings(s.exists() ? s.data() : {}), () => setSettings({}));
  }, [co]);
  const isMaster = me?.isMaster === true && me?.role !== "shipper";
  React.useEffect(() => {
    if (!isMaster || !co || settings?.masterChecklistDone) return;
    let alive = true;
    (async () => {
      const [staff, drivers, clients, places, orders, appSnap] = await Promise.all([
        hasAny("users", co), hasAny("drivers", co), hasAny("clients", co), hasAny("places", co), hasAny("orders", co),
        getDocs(query(collection(db, "transportApplications"), where("companyName", "==", co), limit(3))).catch(() => null),
      ]);
      const app = appSnap?.docs?.map((d) => d.data()).find((a) => a.type === "신규") || appSnap?.docs?.[0]?.data() || {};
      if (alive) setSt({ staff, drivers, clients, places, orders, seal: !!app.직인이미지, bizDoc: !!(app.사업자등록증 || app.businessLicense || app.사업자등록증이미지) });
    })();
    return () => { alive = false; };
  }, [isMaster, co, settings?.masterChecklistDone]);

  if (!isMaster || !co || settings === undefined || settings?.masterChecklistDone || !st) return null;
  const signupUrl = `${window.location.origin}/signup`;
  const planName = (PLAN_DEFAULTS.find((p) => p.id === planId) || {}).name;
  const items = [
    { k: "company", done: st.seal, title: "회사 정보 · 직인 등록", desc: "운임확인서·견적서·거래명세서에 찍힐 회사 정보와 직인", act: "회사관리", to: () => go("회사관리") },
    { k: "invite", done: st.staff >= 2, title: "직원 초대", desc: `직원이 가입 화면에서 '기존 회사' → "${co}" 선택 후 가입 → 마스터가 승인`, act: copied ? "복사됨 ✓" : "가입 링크 복사", to: async () => { try { await navigator.clipboard.writeText(`[${co}] KP-Flow 가입 안내\n${signupUrl}\n가입 화면에서 '기존 회사'를 고르고 "${co}"를 선택해 주세요.`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt("아래 주소를 복사해 직원에게 보내주세요", signupUrl); } } },
    { k: "perm", done: st.staff >= 2 && !!settings?.masterPermDone, title: "직원 권한 · 부서 · 직책 지정", desc: "관리자메뉴 › 회원 관리에서 직원을 눌러 승인하고 권한·부서·직책을 정합니다", act: "회원 관리", to: async () => { go("관리자메뉴"); await setDoc(doc(db, "companySettings", co), { masterPermDone: true }, { merge: true }).catch(() => {}); } },
    { k: "drivers", done: st.drivers > 0, title: "기사 · 차량 등록", desc: "기사관리에서 직접 또는 엑셀 대용량 업로드(양식 제공) · 지입차는 등급을 '지입'으로", act: "기사관리", to: () => go("기사관리") },
    { k: "clients", done: st.clients > 0 || st.places > 0, title: "거래처 · 하차지 등록", desc: "거래처관리에서 기본거래처·하차지를 엑셀로 한 번에 올릴 수 있습니다", act: "거래처관리", to: () => go("거래처관리") },
    { k: "setup", done: !!settings?.onboarding?.setupDone || !!settings?.copyTemplates, title: "기본 설정 (단위·결제일·기사 전달 문구)", desc: "관리자메뉴 › 환경 설정 › 초기 설정에서 우리 회사 방식에 맞춥니다", act: "환경 설정", to: () => go("관리자메뉴") },
    { k: "order", done: st.orders > 0, title: "첫 오더 등록", desc: "배차관리에서 첫 오더를 등록하고 기사복사로 기사에게 전달해 보세요", act: "배차관리", to: () => go("배차관리") },
    { k: "plan", done: !!planId, title: `요금제 확인${planName ? ` · 지금 ${planName}` : ""}`, desc: "관리자메뉴 › 구독·결제에서 요금제·청구서·입금 안내를 봅니다", act: "구독·결제", to: () => go("관리자메뉴") },
  ];
  const doneN = items.filter((x) => x.done).length;
  const hide = () => setDoc(doc(db, "companySettings", co), { masterChecklistDone: true }, { merge: true }).catch(() => {});

  return (
    <div className="mb-4 rounded-[20px] overflow-hidden border border-[#0F1A30] bg-white shadow-[0_10px_26px_rgba(15,26,48,0.10)]">
      <div className="px-5 py-4 text-white flex items-center justify-between gap-4 flex-wrap" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div className="min-w-0">
          <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0] whitespace-nowrap" style={{ fontFamily: MONO }}>MASTER · GETTING STARTED</div>
          <div className="text-[19px] font-black whitespace-nowrap">👑 {co} 시작 체크리스트</div>
          <div className="text-[12.5px] text-white/65 whitespace-nowrap">마스터 계정만 보입니다 · 끝난 항목은 자동으로 체크됩니다</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[24px] font-black tabular-nums" style={{ fontFamily: MONO }}>{doneN}<span className="text-[14px] text-white/50"> / {items.length}</span></div>
            <div className="w-28 h-1.5 rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-[#8FB0F0]" style={{ width: `${(doneN / items.length) * 100}%` }} /></div>
          </div>
          <button type="button" onClick={hide} className="h-9 px-3 rounded-xl bg-white/10 ring-1 ring-white/20 text-[12.5px] font-black whitespace-nowrap">숨기기</button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-px bg-[#EEF1F6]">
        {items.map((x, i) => (
          <div key={x.k} className="bg-white px-4 py-3 flex items-center gap-3 min-w-0">
            <span className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[12px] font-black ${x.done ? "bg-[#0F1A30] text-white" : "border-2 border-[#C9D3E3] text-[#9AA9C3]"}`}>{x.done ? "✓" : i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className={`text-[14px] font-black whitespace-nowrap overflow-hidden text-ellipsis ${x.done ? "text-[#9AA9C3] line-through" : "text-[#0F1A30]"}`}>{x.title}</div>
              <div className="text-[12px] text-[#7A89A3] whitespace-nowrap overflow-hidden text-ellipsis" title={x.desc}>{x.desc}</div>
            </div>
            {!x.done && <button type="button" onClick={x.to} className="shrink-0 h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] whitespace-nowrap hover:bg-[#F5F8FD]">{x.act}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
