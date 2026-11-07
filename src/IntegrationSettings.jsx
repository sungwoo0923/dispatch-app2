// ======================= src/IntegrationSettings.jsx =======================
// 🔌 2026-11-07 관리자 관리센터 › 운영 › 연동 설정 — 외부 연동 상태 한곳(최고관리자 전용)
//  · 국세청 사업자 상태조회 · 기상청 단기예보/특보: 서버 integrationStatus (키 DATA_GO_KR_KEY)
//  · 팝빌 세금계산서 · 알림톡 · 계좌조회 · 홈택스: 서버 popbillAdmin (키 POPBILL_LINK_ID · POPBILL_SECRET_KEY + 켜기 스위치)
//  상태: 키 없음 / 준비됨(키는 있고 시험 전) / 연결됨 / 오류 / 꺼짐
import React from "react";
import { pdCall, PopbillStatusChip } from "./publicDataMain";

const TONE = {
  nokey: ["#F3F5F9", "#7A879C", "키 없음"], ready: ["#EEF3FA", "#2D4C82", "준비됨"], ok: ["#E9F5EE", "#1F7A4D", "연결됨"],
  error: ["#FDECEC", "#B4342A", "오류"], off: ["#FFF4E0", "#9A5B00", "꺼짐"], loading: ["#F3F5F9", "#9AA9C3", "확인 중"], unavailable: ["#F3F5F9", "#7A879C", "함수 배포 전"],
};
function StatusChip({ s }) {
  const [bg, fg, label] = TONE[s] || TONE.nokey;
  return <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[13px] font-extrabold whitespace-nowrap" style={{ background: bg, color: fg }} data-testid="int-status" data-status={s}><span className="w-1.5 h-1.5 rounded-full" style={{ background: fg }} />{label}</span>;
}
const ago = (ms) => { if (!ms) return ""; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`; };

function Row({ title, en, status, desc, needs, last, onTest, testing, detail, children }) {
  return (
    <div className="rounded-[18px] border border-[#E3E8F0] bg-white p-5" data-testid="int-row">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10.5px] font-extrabold tracking-[0.22em] text-[#94A3B8]">{en}</div>
          <div className="text-[16.5px] font-black text-[#0F1A30]">{title}</div>
          <div className="mt-1 text-[14px] text-[#3A4A66] leading-relaxed">{desc}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusChip s={status} />
          {onTest && <button type="button" onClick={onTest} disabled={testing} className="h-9 px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-black text-[#1B2B4B] disabled:opacity-60 whitespace-nowrap">{testing ? "시험 중" : "연결 시험"}</button>}
        </div>
      </div>
      <div className="mt-3 grid gap-1.5">
        {needs.map((n) => <div key={n} className="flex gap-2 text-[13.5px] text-[#5B6B85]"><span className="mt-[7px] w-1 h-1 rounded-full bg-[#9AA9C3] shrink-0" />{n}</div>)}
      </div>
      {(detail || last) && <div className="mt-3 text-[13px] font-semibold text-[#7A879C]">{[detail, last && `마지막 받은 자료 ${last}`].filter(Boolean).join(" · ")}</div>}
      {children}
    </div>
  );
}

export default function IntegrationSettings() {
  const [pd, setPd] = React.useState(null);
  const [pdErr, setPdErr] = React.useState("");
  const [pb, setPb] = React.useState(null);
  const [pbErr, setPbErr] = React.useState("");
  const [testing, setTesting] = React.useState("");
  const loadPd = React.useCallback(async (test = "") => {
    try { setPd(await pdCall("integrationStatus", test ? { test } : {}, 30000)); setPdErr(""); }
    catch (e) { setPdErr(e?.code === "404" || e?.code === "not-found" ? "unavailable" : e?.message || "error"); }
  }, []);
  const loadPb = React.useCallback(async (extra = {}) => {
    try { setPb(await pdCall("popbillAdmin", { action: "status", ...extra }, 30000)); setPbErr(""); }
    catch (e) { setPbErr(e?.code === "404" || e?.code === "not-found" ? "unavailable" : e?.message || "error"); }
  }, []);
  React.useEffect(() => { loadPd(); loadPb(); }, [loadPd, loadPb]);
  const test = async (k) => { setTesting(k); try { if (k === "popbill") await loadPb({ test: true }); else await loadPd(k); } finally { setTesting(""); } };
  const setCfg = async (patch) => { setTesting("cfg"); try { await loadPb({ action: "setConfig", enabled: pb?.config?.enabled, isTest: pb?.config?.isTest, ...patch }); } finally { setTesting(""); } };

  const pdStatus = (k) => (pdErr === "unavailable" ? "unavailable" : pdErr ? "error" : !pd ? "loading" : pd[k]?.status || "nokey");
  const pbStatus = pbErr === "unavailable" ? "unavailable" : pbErr ? "error" : !pb ? "loading"
    : !pb.hasKeys ? "nokey" : !pb.enabled ? "off" : pb.test ? (pb.test.ok ? "ok" : "error") : "ready";
  const pbServices = [["세금계산서", "운송료 전자세금계산서 발행 · 취소 · 상태"], ["알림톡", "배차 · 정산 안내 카카오 알림톡(실패하면 문자)"], ["계좌조회", "등록한 계좌 입출금 내역 수집"], ["홈택스 수집", "매입 · 매출 세금계산서 가져오기"]];
  return (
    <div className="space-y-4" data-testid="integrations">
      <Row title="국세청 사업자 상태조회" en="NTS · BUSINESS STATUS" status={pdStatus("nts")} testing={testing === "nts"} onTest={() => test("nts")}
        desc="거래처 · 회사정보 · 허브 가입에서 사업자번호의 계속 · 휴업 · 폐업을 확인해요. 같은 번호는 하루 동안 저장해 둔 결과를 써요."
        needs={["공공데이터포털 \"국세청_사업자등록정보 진위확인 및 상태조회 서비스\" 활용신청", "Firebase 비밀값 DATA_GO_KR_KEY (일반 인증키 Decoding)", "함수 bizStatusCheck 배포"]}
        detail={pd?.nts?.detail} last={ago(pd?.nts?.lastAt)} />
      <Row title="기상청 단기예보 · 기상특보" en="KMA · FORECAST" status={pdStatus("kma")} testing={testing === "kma"} onTest={() => test("kma")}
        desc="오늘 · 내일 오더의 상하차 지역 날씨를 3시간마다 받아 두고, 배차현황 · 홈 · 경영 보고에 비 · 눈 · 강풍 · 특보를 보여줘요. 키가 없으면 날씨는 숨겨요."
        needs={["공공데이터포털 \"기상청_단기예보 조회서비스\" · \"기상청_기상특보 조회서비스\" 활용신청", "같은 비밀값 DATA_GO_KR_KEY", "함수 weatherFor · weatherRefresh(3시간마다) 배포"]}
        detail={pd?.kma?.detail} last={ago(pd?.kma?.lastAt)} />
      <Row title="팝빌 세금계산서 · 알림톡 · 계좌조회 · 홈택스" en="POPBILL" status={pbStatus} testing={testing === "popbill"} onTest={pb?.enabled ? () => test("popbill") : null}
        desc="사업자 등록과 팝빌 연동 계약이 끝나면 켜요. 운송사마다 팝빌 연동회원(사업자번호)을 회사정보에서 등록해요."
        needs={["팝빌 연동 신청 후 LinkID · SecretKey 받기", "Firebase 비밀값 POPBILL_LINK_ID · POPBILL_SECRET_KEY", "functions/.env 에 POPBILL_ENABLED=true 넣고 popbillAdmin 다시 배포", "아래 스위치로 켜기(처음엔 테스트 환경)"]}
        detail={pb?.test && !pb.test.ok ? pb.test.error : pb?.test?.ok ? "연동회원 확인 완료" : ""}>
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {pbServices.map(([t, d]) => (
            <div key={t} className="rounded-xl bg-[#F7F9FC] border border-[#E8EDF4] px-3 py-2.5">
              <div className="flex items-center gap-2"><span className="text-[14px] font-black text-[#0F1A30]">{t}</span><span className="ml-auto"><StatusChip s={pbStatus === "ok" ? "ready" : pbStatus} /></span></div>
              <div className="mt-1 text-[12.5px] text-[#5B6B85]">{d}</div>
            </div>
          ))}
        </div>
        {pb && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <button type="button" disabled={!pb.hasKeys || testing === "cfg"} onClick={() => setCfg({ enabled: !pb.config.enabled })}
              className={`h-10 px-4 rounded-xl text-[13.5px] font-black disabled:opacity-50 ${pb.config.enabled ? "bg-[#0F1A30] text-white" : "border border-[#DCE3EE] text-[#1B2B4B] bg-white"}`}>
              {pb.config.enabled ? "켜짐 · 끄기" : "꺼짐 · 켜기"}
            </button>
            <button type="button" disabled={!pb.hasKeys || testing === "cfg"} onClick={() => setCfg({ isTest: !pb.config.isTest })}
              className="h-10 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-black text-[#1B2B4B] disabled:opacity-50">
              {pb.config.isTest ? "테스트 환경" : "실제 환경"}
            </button>
            {!pb.hasKeys && <span className="text-[13px] text-[#7A879C]">키를 넣기 전에는 켤 수 없어요</span>}
          </div>
        )}
        {!!pb?.members?.length && (
          <div className="mt-4">
            <div className="text-[13px] font-black text-[#3A4A66] mb-1.5">운송사 연동회원</div>
            <div className="rounded-xl border border-[#E8EDF4] overflow-hidden">
              {pb.members.map((m) => (
                <div key={m.company} className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0 border-[#F0F3F8] text-[13.5px]">
                  <span className="font-black text-[#0F1A30]">{m.company}</span>
                  <span className="tabular-nums text-[#5B6B85]">{m.corpNum ? `${m.corpNum.slice(0, 3)}-${m.corpNum.slice(3, 5)}-${m.corpNum.slice(5)}` : "-"}</span>
                  <span className="text-[#7A879C] truncate">{m.corpName || ""}</span>
                  <span className="ml-auto"><PopbillStatusChip status={m.status} /></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Row>
      <div className="px-1 text-[12.5px] text-[#9AA9C3] leading-relaxed">비밀값 등록: firebase functions:secrets:set DATA_GO_KR_KEY · 키를 아직 못 받았으면 값에 none을 넣어 두면 배포는 되고 화면은 조용히 숨겨요.</div>
    </div>
  );
}
