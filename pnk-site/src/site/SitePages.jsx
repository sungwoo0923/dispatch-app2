// ======================= pnk-site/src/site/SitePages.jsx =======================
// 🏡 PnK PROJECT 공식 홈페이지 — 홈 · 회사소개 · 사업분야 · 서비스 · 문의하기
//  사진: public/home/*.webp (따뜻한 아이보리 · 오크 톤으로 만든 이미지 — 글자 · 로고 없음)
//  문의: pnkInquiries 에 저장(누구나 쓰기만 · 읽기는 인트라넷 구성원) → 인트라넷 [영업 관리] › 홈페이지 문의
import React from "react";
import { Link } from "react-router-dom";
import { Arrow, CtaBand, Eyebrow, Photo } from "./parts";

const IMG = (n) => `/home/${n}.webp`;

// 사업 분야 3가지 — 홈 · 사업분야 화면이 함께 쓴다
const FIELDS = [
  {
    key: "logistics", no: "01", en: "Logistics & Dispatch", title: "물류 · 배차", img: IMG("logistics"),
    short: "오더 접수부터 배차 · 정산까지, 운송사의 하루를 한 프로그램으로.",
    desc: "운송 현장에서 매일 전화 · 카톡 · 엑셀로 하던 일을 하나의 프로그램으로 옮겼어요. 사무실에서는 PC로, 밖에서는 휴대폰으로, 기사님은 기사앱으로 같은 정보를 봐요.",
    points: ["카톡 · 문자 오더를 붙여넣으면 칸마다 자동 입력", "어제 · 오늘 · 내일 오더를 한 표에서 실시간 배차", "배차 기록이 그대로 정산 · 장부로", "운송사 · 화주 · 차주가 오더를 나누는 허브"],
  },
  {
    key: "care", no: "02", en: "Senior Care", title: "요양 · 돌봄", img: IMG("care"),
    short: "어르신을 돌보는 시간이 더 늘어나도록, 기록과 소통은 가볍게.",
    desc: "요양원과 돌봄 기관에서 종이와 메신저로 나뉘어 있던 기록 · 연락 · 근무 관리를 앱과 웹으로 정리해요. 선생님은 돌봄에 집중하고, 보호자는 안심할 수 있게요.",
    points: ["어르신별 돌봄 기록을 휴대폰으로 바로", "보호자에게 소식 · 사진 · 공지 전하기", "요양보호사 근무표 · 인수인계", "관리자용 웹 화면에서 한눈에 확인"],
  },
  {
    key: "custom", no: "03", en: "Custom Software", title: "맞춤 웹 · 앱 개발", img: IMG("design"),
    short: "우리 회사 방식 그대로 일하는 프로그램을 처음부터 같이 설계해요.",
    desc: "기성 프로그램이 맞지 않는 업무, 엑셀로 겨우 버티고 있는 일, 고객에게 보여 줄 앱이 필요할 때. 현장 이야기를 듣고 설계부터 개발 · 운영까지 함께해요.",
    points: ["사내 업무 시스템 · 관리자 화면", "안드로이드 · 아이폰 앱, 모바일 웹", "회사 홈페이지 · 소개 페이지", "도입 뒤 교육 · 업데이트 · 운영 지원"],
  },
];

// 지금 운영 중이거나 만들고 있는 서비스
const PRODUCTS = [
  { key: "logisweb", tag: "물류 · 배차", status: "운영 중", name: "로지스웹", en: "LogisWeb", desc: "운송사를 위한 배차 · 정산 프로그램. PC와 휴대폰에서 같은 화면으로 오더를 받고, 배차하고, 정산해요.", href: "https://www.logisweb.co.kr", cta: "로지스웹 홈페이지" },
  { key: "hub", tag: "물류 · 배차", status: "운영 중", name: "로지스웹 허브", en: "LogisWeb Hub", desc: "남는 오더는 올리고 빈 차는 바로 채우는, 운송사 · 화주 · 차주가 만나는 오더 공유 공간이에요.", href: "https://hub.logisweb.co.kr", cta: "허브 둘러보기" },
  { key: "driver", tag: "물류 · 배차", status: "운영 중", name: "로지스웹 기사앱", en: "Driver App", desc: "기사님 휴대폰으로 배차를 받고, 상 · 하차를 알리고, 운행 내역을 확인하는 앱이에요.", href: "https://www.logisweb.co.kr", cta: "자세히 보기" },
  { key: "care", tag: "요양 · 돌봄", status: "요양원용", name: "요양 · 돌봄 서비스", en: "Care Service", desc: "요양원의 돌봄 기록 · 보호자 소통 · 근무 관리를 앱과 웹으로 정리하는 서비스예요.", href: "/contact", cta: "도입 문의하기" },
];

const STEPS = [
  { no: "01", en: "Listen", title: "현장에서 듣기", desc: "책상 위 기획서가 아니라, 실제로 일하는 분들의 하루에서 시작해요. 어디서 시간이 새는지 먼저 봐요." },
  { no: "02", en: "Design", title: "상상을 설계하기", desc: "‘이렇게 되면 좋겠다’를 화면과 흐름으로 그려요. 누가, 언제, 무엇을 누르는지까지 정해요." },
  { no: "03", en: "Build", title: "만들고 다듬기", desc: "PC · 휴대폰 · 앱에서 같은 데이터가 움직이도록 만들어요. 써 보면서 계속 고쳐요." },
  { no: "04", en: "Complete", title: "가치를 완성하기", desc: "현장에 적용하고, 교육하고, 운영하면서 업데이트해요. 실제로 쓰여야 완성이라고 생각해요." },
];

// ════════════════════════════ 홈 ════════════════════════════
export function Home() {
  return (
    <>
      {/* 1. 첫 화면 — 큰 사진 + 핵심 문장 */}
      <section className="relative h-[100svh] min-h-[620px] max-h-[980px] overflow-hidden" style={{ background: "#3A3128" }}>
        <img src={IMG("hero")} alt="햇살이 드는 작업실 책상 위의 노트북과 휴대폰, 앱 설계 스케치" className="hero-img absolute inset-0 w-full h-full object-cover" fetchpriority="high" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(100deg, rgba(38,30,22,.72) 0%, rgba(38,30,22,.45) 42%, rgba(38,30,22,.05) 75%), linear-gradient(0deg, rgba(38,30,22,.45) 0%, rgba(38,30,22,0) 35%)" }} />
        <div className="relative h-full wrap flex flex-col justify-end pb-14 md:pb-20 text-white">
          <div className="max-w-[760px]">
            <div className="rv"><Eyebrow light>Imagine · Design · Complete</Eyebrow></div>
            <h1 className="serif t-display mt-5 rv d1">상상을 설계하고,<br />가치를 완성합니다.</h1>
            <p className="mt-6 text-[15.5px] md:text-[18px] leading-[1.85] rv d2" style={{ color: "#EFE6D8" }}>
              PnK PROJECT는 현장의 불편을 직접 듣고, <br className="hidden sm:block" />
              매일 쓰는 프로그램으로 만들어 실제 업무에 적용하는 소프트웨어 회사예요.
            </p>
            <div className="mt-9 flex flex-wrap gap-3 rv d3">
              <Link to="/services" className="btn btn-light">우리가 만든 서비스 <Arrow /></Link>
              <Link to="/contact" className="btn btn-line" style={{ color: "#fff" }}>프로젝트 문의</Link>
            </div>
          </div>
          <div className="mt-12 md:mt-16 hidden sm:grid grid-cols-3 max-w-[860px]" style={{ borderTop: "1px solid rgba(255,255,255,.28)" }}>
            {FIELDS.map((f) => (
              <Link key={f.key} to="/business" className="group pt-5 pr-6">
                <div className="eng text-[11.5px]" style={{ color: "#E6CFA8" }}>{f.no} · {f.en}</div>
                <div className="mt-1.5 text-[16px] font-bold flex items-center gap-2">{f.title}<span className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition"><Arrow size={14} /></span></div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 2. 흐르는 글자 줄 */}
      <div className="overflow-hidden py-5" style={{ background: "var(--cream)", borderBottom: "1px solid var(--line)" }} aria-hidden="true">
        <div className="marquee">
          {[0, 1].map((k) => (
            <div key={k} className="flex shrink-0">
              {["배차 프로그램", "요양원 앱", "기사 앱", "정산 · 장부", "업무 시스템", "모바일 웹", "회사 홈페이지", "오더 공유 허브"].map((t) => (
                <span key={t} className="serif text-[18px] md:text-[22px] px-7 flex items-center gap-7 whitespace-nowrap" style={{ color: "var(--ink-2)" }}>{t}<span style={{ color: "var(--oak)" }}>✦</span></span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 3. 소개 문장 */}
      <section className="py-24 md:py-36">
        <div className="wrap grid lg:grid-cols-[1fr_1.15fr] gap-12 lg:gap-20 items-center">
          <div className="rv">
            <Eyebrow>Who we are</Eyebrow>
            <h2 className="serif t-1 mt-5">좋은 프로그램은<br />화면이 아니라<br /><span style={{ color: "var(--oak)" }}>하루</span>를 바꿉니다.</h2>
          </div>
          <div className="rv d1">
            <p className="lead">
              우리는 화려한 기능보다 <b style={{ color: "var(--ink)" }}>매일 손이 가는 프로그램</b>을 만들어요. 운송사의 배차 담당자가 아침마다 붙잡고 있던 엑셀,
              요양원 선생님이 퇴근 전에 몰아 쓰던 기록지처럼 — 현장에서 반복되는 일을 찾아 조용히 덜어 내는 것이 PnK PROJECT의 일이에요.
            </p>
            <div className="mt-10 grid grid-cols-3 gap-4 md:gap-8">
              {[["PC · 모바일 · 앱", "한 데이터로 함께"], ["기획부터 운영까지", "한 팀이 끝까지"], ["현장 적용", "실제로 쓰이는 결과"]].map(([a, b]) => (
                <div key={a} className="pt-5" style={{ borderTop: "1px solid var(--ink)" }}>
                  <div className="text-[14.5px] md:text-[16px] font-bold">{a}</div>
                  <div className="mt-1.5 text-[12.5px] md:text-[13.5px]" style={{ color: "var(--mute)" }}>{b}</div>
                </div>
              ))}
            </div>
            <Link to="/about" className="link-arrow mt-10">회사소개 더 보기 <Arrow size={15} /></Link>
          </div>
        </div>
      </section>

      {/* 4. 사업 분야 — 큰 사진 카드 */}
      <section className="pb-24 md:pb-36">
        <div className="wrap">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 md:mb-14 rv">
            <div>
              <Eyebrow>Our business</Eyebrow>
              <h2 className="serif t-1 mt-5">이런 일을 하고 있어요</h2>
            </div>
            <p className="body max-w-[420px]">물류 현장과 돌봄 현장, 그리고 각 회사의 고유한 업무까지. 필요한 곳에 맞는 프로그램을 설계하고 만들어요.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5 md:gap-6">
            {FIELDS.map((f, i) => (
              <Link key={f.key} to="/business" className={`zoom group block rv d${i}`}>
                <div className="relative">
                  <Photo src={f.img} alt={f.title} ratio="4 / 5" className="rounded-[22px]" />
                  <div className="absolute inset-0 rounded-[22px]" style={{ background: "linear-gradient(0deg, rgba(30,24,18,.62) 0%, rgba(30,24,18,0) 55%)" }} />
                  <div className="absolute left-0 right-0 bottom-0 p-6 md:p-7 text-white">
                    <div className="eng text-[11.5px]" style={{ color: "#E6CFA8" }}>{f.no} · {f.en}</div>
                    <div className="serif text-[26px] md:text-[28px] font-semibold mt-1.5">{f.title}</div>
                  </div>
                </div>
                <p className="body mt-5 pr-4">{f.short}</p>
                <span className="mt-3 inline-flex items-center gap-2 text-[14px] font-bold group-hover:gap-3 transition-all" style={{ color: "var(--oak-d)" }}>자세히 보기 <Arrow size={14} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 5. 대표 서비스 — 로지스웹 */}
      <section className="py-24 md:py-32 grain" style={{ background: "var(--cream)" }}>
        <div className="wrap grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="rv order-2 lg:order-1"><DispatchMock /></div>
          <div className="rv d1 order-1 lg:order-2">
            <Eyebrow>Featured · LogisWeb</Eyebrow>
            <h2 className="serif t-1 mt-5">운송사의 하루를<br />한 화면에 담은 <span style={{ color: "var(--oak)" }}>로지스웹</span></h2>
            <p className="lead mt-6">배차 실무를 오래 한 사람의 눈으로 만든 배차 · 정산 프로그램이에요. 지금 운송사들이 PC와 휴대폰으로 매일 쓰고 있어요.</p>
            <ul className="mt-8 space-y-0">
              {[["오더 입력", "카톡 · 문자 오더를 붙여넣으면 칸마다 자동으로"], ["실시간 배차판", "변경 내용이 모든 화면에 바로, 중복 배차 없이"], ["정산 · 장부", "배차 기록이 그대로 매출 · 지급명세서로"], ["기사앱 · 허브", "기사님 휴대폰, 운송사끼리 오더 공유까지"]].map(([a, b]) => (
                <li key={a} className="flex gap-5 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
                  <span className="w-[104px] shrink-0 text-[15px] font-bold">{a}</span>
                  <span className="text-[14.5px] leading-[1.7]" style={{ color: "var(--ink-2)" }}>{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="https://www.logisweb.co.kr" target="_blank" rel="noopener noreferrer" className="btn btn-dark">로지스웹 보러 가기 <Arrow /></a>
              <Link to="/services" className="btn btn-line">모든 서비스</Link>
            </div>
          </div>
        </div>
      </section>

      {/* 6. 요양 · 돌봄 */}
      <section className="py-24 md:py-32">
        <div className="wrap grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-16 items-center">
          <div className="rv">
            <Eyebrow>Senior care</Eyebrow>
            <h2 className="serif t-1 mt-5">돌봄의 시간을<br />기록이 빼앗지 않도록</h2>
            <p className="lead mt-6">요양원과 돌봄 기관을 위한 앱과 웹을 만들어요. 선생님은 휴대폰으로 바로 기록하고, 관리자는 웹에서 한눈에 보고, 보호자는 소식을 받아요.</p>
            <div className="mt-8 grid grid-cols-2 gap-3">
              {["돌봄 기록", "보호자 소식", "근무표 · 인수인계", "관리자 웹"].map((t) => (
                <div key={t} className="h-14 px-5 rounded-2xl flex items-center gap-3 text-[14.5px] font-bold" style={{ background: "var(--cream)", border: "1px solid var(--line)" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--sage)" }} />{t}
                </div>
              ))}
            </div>
            <Link to="/business" className="link-arrow mt-10">요양 · 돌봄 사업 보기 <Arrow size={15} /></Link>
          </div>
          <div className="rv d1 relative">
            <Photo src={IMG("care")} alt="요양원 라운지에서 태블릿을 함께 보는 요양보호사와 어르신" ratio="5 / 6" className="rounded-[26px] md:ml-16" />
            <div className="absolute -left-2 md:left-0 bottom-8 md:bottom-14"><CareMock /></div>
          </div>
        </div>
      </section>

      {/* 7. 일하는 방식 */}
      <section className="py-24 md:py-32" style={{ background: "var(--ink)", color: "var(--ivory)" }}>
        <div className="wrap">
          <div className="grid lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-16 items-end mb-14 md:mb-20">
            <div className="rv">
              <Eyebrow light>How we work</Eyebrow>
              <h2 className="serif t-1 mt-5">상상에서 완성까지,<br />네 걸음</h2>
            </div>
            <p className="rv d1 text-[15.5px] leading-[1.9]" style={{ color: "#D9CFC0" }}>
              ‘이게 프로그램으로 되면 좋겠다’는 말에서 시작해서, 현장에서 매일 쓰이는 순간까지 같은 팀이 함께해요. 만들고 끝나는 게 아니라, 쓰면서 함께 다듬어 가요.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px" style={{ background: "rgba(255,255,255,.14)" }}>
            {STEPS.map((s, i) => (
              <div key={s.no} className={`rv d${i % 4} p-7 md:p-8 min-h-[260px] flex flex-col`} style={{ background: "var(--ink)" }}>
                <div className="flex items-baseline justify-between">
                  <span className="serif text-[40px] font-semibold" style={{ color: "#C9A26E" }}>{s.no}</span>
                  <span className="eng text-[12px]" style={{ color: "#A99C8A" }}>{s.en}</span>
                </div>
                <div className="mt-auto">
                  <div className="text-[19px] font-bold">{s.title}</div>
                  <p className="mt-3 text-[14px] leading-[1.8]" style={{ color: "#CFC5B5" }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. 사진 띠 — 팀 */}
      <section className="relative">
        <Photo src={IMG("office")} alt="따뜻한 사무실에서 노트북을 보며 이야기하는 팀" className="h-[62vh] min-h-[420px] max-h-[720px]" />
        <div className="absolute inset-0 md:hidden" style={{ background: "linear-gradient(180deg, rgba(251,248,242,.92) 0%, rgba(251,248,242,.88) 55%, rgba(251,248,242,.35) 100%)" }} />
        <div className="absolute inset-0 hidden md:block" style={{ background: "linear-gradient(90deg, rgba(251,248,242,.95) 0%, rgba(251,248,242,.82) 38%, rgba(251,248,242,0) 70%)" }} />
        <div className="absolute inset-0 flex items-center">
          <div className="wrap">
            <div className="max-w-[520px] rv">
              <Eyebrow>Our team</Eyebrow>
              <h2 className="serif t-1 mt-5">작은 팀,<br />깊은 몰입</h2>
              <p className="lead mt-5">기획 · 디자인 · 개발 · 운영을 나누지 않고 한 팀이 함께 고민해요. 그래서 이야기가 빠르고, 결과가 정확해요.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 9. 약속 */}
      <section className="py-24 md:py-32">
        <div className="wrap">
          <div className="text-center max-w-[680px] mx-auto rv">
            <Eyebrow>Our promise</Eyebrow>
            <h2 className="serif t-1 mt-5">PnK PROJECT가 지키는 세 가지</h2>
          </div>
          <div className="mt-14 md:mt-20 grid md:grid-cols-3 gap-5">
            {[
              ["현장에서 출발해요", "실제로 일하는 분들의 말과 화면을 먼저 봐요. 쓰는 사람이 편해야 좋은 프로그램이에요.", "M4 20c1-4 4-6 8-6s7 2 8 6M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"],
              ["어디서든 같은 화면", "사무실 PC, 이동 중인 휴대폰, 현장의 앱이 같은 데이터로 움직여요.", "M3 5h13v10H3zM7 19h5M18 8h3v11h-3z"],
              ["끝까지 함께 운영해요", "만들고 끝내지 않아요. 적용하고, 교육하고, 계속 업데이트해요.", "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"],
            ].map(([t, d, p], i) => (
              <div key={t} className={`rv d${i} rounded-[24px] p-8 md:p-9`} style={{ background: "var(--cream)", border: "1px solid var(--line)" }}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "var(--ivory)", border: "1px solid var(--line)", color: "var(--oak-d)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={p} /></svg>
                </div>
                <div className="serif text-[22px] font-semibold mt-7">{t}</div>
                <p className="body mt-3">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

// ───────── 화면 예시: 배차판 (그림 — 실제 데이터 아님) ─────────
function DispatchMock() {
  const rows = [
    ["08:30", "평택 → 대전", "5톤 윙", "배차완료", "#8C9A7E"],
    ["09:10", "인천 → 부산", "11톤 카고", "배차완료", "#8C9A7E"],
    ["10:00", "화성 → 광주", "1톤 탑", "운행중", "#A8804F"],
    ["11:20", "안산 → 청주", "2.5톤", "배차대기", "#B9AE9E"],
    ["13:40", "이천 → 대구", "5톤 축", "배차대기", "#B9AE9E"],
  ];
  return (
    <div className="relative">
      <div className="rounded-[20px] overflow-hidden" style={{ background: "#fff", boxShadow: "0 30px 60px -30px rgba(60,45,25,.35), 0 0 0 1px var(--line)" }}>
        <div className="h-10 px-4 flex items-center gap-1.5" style={{ background: "#F3EDE2", borderBottom: "1px solid var(--line)" }}>
          {["#E4B9A0", "#E8D3A6", "#BFC9AE"].map((c) => <span key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}
          <span className="ml-3 text-[11.5px] font-semibold" style={{ color: "var(--mute)" }}>로지스웹 · 실시간 배차판</span>
        </div>
        <div className="p-4 md:p-6">
          <div className="grid grid-cols-3 gap-2.5 md:gap-3">
            {[["오늘 오더", "48"], ["배차 완료", "41"], ["진행률", "85%"]].map(([a, b]) => (
              <div key={a} className="rounded-xl p-3 md:p-4" style={{ background: "var(--ivory)", border: "1px solid var(--line)" }}>
                <div className="text-[11px] md:text-[12px] font-semibold" style={{ color: "var(--mute)" }}>{a}</div>
                <div className="serif text-[22px] md:text-[28px] font-semibold mt-1">{b}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
            {rows.map(([t, r, c, s, col], i) => (
              <div key={t} className="grid grid-cols-[52px_1fr_auto] md:grid-cols-[60px_1fr_90px_80px] items-center gap-2 px-3 md:px-4 h-11 text-[12.5px] md:text-[13px]" style={{ borderTop: i ? "1px solid #F0E9DD" : "none", background: i === 2 ? "#FBF6EC" : "#fff" }}>
                <span className="font-semibold tnum" style={{ color: "var(--mute)" }}>{t}</span>
                <span className="font-bold truncate">{r}</span>
                <span className="hidden md:block" style={{ color: "var(--ink-2)" }}>{c}</span>
                <span className="justify-self-end h-6 px-2.5 rounded-full text-[11px] font-bold flex items-center text-white" style={{ background: col }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -right-2 md:-right-6 -bottom-8 w-[132px] md:w-[160px] rounded-[26px] p-2" style={{ background: "#2A2520", boxShadow: "0 24px 40px -20px rgba(40,30,20,.5)" }}>
        <div className="rounded-[20px] overflow-hidden" style={{ background: "var(--ivory)" }}>
          <div className="px-3 pt-4 pb-3" style={{ background: "#F3EDE2" }}>
            <div className="text-[9.5px] font-semibold" style={{ color: "var(--mute)" }}>기사앱</div>
            <div className="text-[12px] font-bold mt-0.5">오늘 배차 2건</div>
          </div>
          <div className="p-2.5 space-y-2">
            {[["상차", "평택 08:30"], ["하차", "대전 12:00"]].map(([a, b]) => (
              <div key={a} className="rounded-lg p-2" style={{ background: "#fff", border: "1px solid var(--line)" }}>
                <div className="text-[9px] font-bold" style={{ color: "var(--oak)" }}>{a}</div>
                <div className="text-[10.5px] font-bold">{b}</div>
              </div>
            ))}
            <div className="h-7 rounded-lg text-[10px] font-bold flex items-center justify-center text-white" style={{ background: "var(--ink)" }}>상차 완료 알리기</div>
          </div>
        </div>
      </div>
      <div className="mt-3 text-[11.5px]" style={{ color: "var(--mute)" }}>※ 화면 예시 그림이에요.</div>
    </div>
  );
}

// ───────── 화면 예시: 돌봄 기록 앱 ─────────
function CareMock() {
  return (
    <div className="w-[200px] md:w-[230px] rounded-[22px] p-4 md:p-5" style={{ background: "rgba(251,248,242,.97)", boxShadow: "0 24px 50px -24px rgba(60,45,25,.45), 0 0 0 1px var(--line)" }}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold" style={{ color: "var(--mute)" }}>오늘의 돌봄 기록</div>
        <span className="text-[10px] font-bold px-2 h-5 rounded-full flex items-center" style={{ background: "#E7ECDF", color: "#5D6B51" }}>예시</span>
      </div>
      <div className="mt-2 text-[15px] font-bold">김○○ 어르신</div>
      <div className="mt-3 space-y-2">
        {[["식사", "점심 전량 드심"], ["활동", "오후 산책 20분"], ["건강", "혈압 128 / 82"]].map(([a, b]) => (
          <div key={a} className="flex items-center gap-2.5 text-[12px]">
            <span className="w-9 h-6 rounded-md flex items-center justify-center text-[10.5px] font-bold" style={{ background: "var(--cream)", color: "var(--oak-d)" }}>{a}</span>
            <span className="font-semibold" style={{ color: "var(--ink-2)" }}>{b}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 h-8 rounded-lg text-[11px] font-bold flex items-center justify-center text-white" style={{ background: "var(--sage)" }}>보호자에게 소식 보내기</div>
    </div>
  );
}

// ════════════════════════════ 페이지 머리(사진 없는 화면) ════════════════════════════
function PageHead({ en, title, desc }) {
  return (
    <section className="pt-[128px] md:pt-[168px] pb-14 md:pb-20" style={{ background: "var(--cream)", borderBottom: "1px solid var(--line)" }}>
      <div className="wrap">
        <div className="rv"><Eyebrow>{en}</Eyebrow></div>
        <h1 className="serif t-display mt-5 rv d1">{title}</h1>
        {desc && <p className="lead mt-6 max-w-[640px] rv d2">{desc}</p>}
      </div>
    </section>
  );
}

// ════════════════════════════ 회사소개 ════════════════════════════
export function About() {
  return (
    <>
      <section className="relative h-[78svh] min-h-[540px] max-h-[820px] overflow-hidden" style={{ background: "#3A3128" }}>
        <img src={IMG("office")} alt="따뜻한 사무실에서 함께 일하는 팀" className="hero-img absolute inset-0 w-full h-full object-cover" fetchpriority="high" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(38,30,22,.78) 0%, rgba(38,30,22,.25) 55%, rgba(38,30,22,.15) 100%)" }} />
        <div className="relative h-full wrap flex flex-col justify-end pb-14 md:pb-20 text-white">
          <div className="rv"><Eyebrow light>About PnK PROJECT</Eyebrow></div>
          <h1 className="serif t-display mt-5 rv d1">현장의 일을<br />프로그램으로 바꾸는 회사</h1>
        </div>
      </section>

      {/* 슬로건 풀이 */}
      <section className="py-24 md:py-32">
        <div className="wrap">
          <div className="text-center rv">
            <Eyebrow>Our philosophy</Eyebrow>
            <p className="serif mt-6 text-[clamp(30px,5vw,60px)] leading-[1.3] font-semibold">상상을 설계하고,<br /><span style={{ color: "var(--oak)" }}>가치를 완성하다</span></p>
          </div>
          <div className="mt-16 md:mt-24 grid md:grid-cols-2 gap-5 md:gap-6">
            {[
              ["Imagine & Design", "상상을 설계하다", "‘이렇게 되면 편하겠다’는 막연한 생각을 구체적인 화면과 흐름으로 바꿔요. 누가 언제 어떤 버튼을 누르는지까지 그려야 진짜 설계라고 생각해요.", IMG("design")],
              ["Complete the value", "가치를 완성하다", "프로그램은 쓰일 때 비로소 가치가 생겨요. 현장에 적용하고, 교육하고, 쓰면서 나온 이야기로 계속 다듬어 실제 성과가 나는 순간까지 함께해요.", IMG("field")],
            ].map(([en, t, d, img], i) => (
              <div key={t} className={`rv d${i} rounded-[26px] overflow-hidden`} style={{ background: "var(--cream)", border: "1px solid var(--line)" }}>
                <Photo src={img} alt={t} ratio="16 / 10" />
                <div className="p-8 md:p-10">
                  <Eyebrow>{en}</Eyebrow>
                  <div className="serif t-2 mt-3">{t}</div>
                  <p className="body mt-4">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 우리는 이런 회사예요 */}
      <section className="py-24 md:py-32" style={{ background: "var(--cream)" }}>
        <div className="wrap grid lg:grid-cols-[1fr_1.3fr] gap-12 lg:gap-20">
          <div className="rv lg:sticky lg:top-32 self-start">
            <Eyebrow>What we do</Eyebrow>
            <h2 className="serif t-1 mt-5">우리는<br />이런 회사예요</h2>
            <p className="lead mt-6">PnK PROJECT는 직접 기획하고 개발한 프로그램을 실제 현장에 적용해 운영하는 소프트웨어 회사예요.</p>
          </div>
          <div>
            {[
              ["직접 만들고, 직접 운영해요", "운송사를 위한 배차 · 정산 프로그램 ‘로지스웹’, 운송사끼리 오더를 나누는 ‘로지스웹 허브’, 기사님용 앱을 만들어 지금도 운영하고 있어요."],
              ["물류에서 돌봄까지 넓혀 가요", "배차 현장에서 배운 방식 — 기록은 가볍게, 정보는 한곳에 — 을 요양원 · 돌봄 기관을 위한 앱과 웹으로 이어 가고 있어요."],
              ["PC · 휴대폰 · 앱을 함께 만들어요", "사무실 PC 프로그램, 이동 중에 보는 모바일 화면, 현장의 앱까지 같은 데이터로 움직이게 설계해요."],
              ["회사마다 맞춰 만들어요", "기성 프로그램이 맞지 않는 업무는 처음부터 같이 설계해요. 사내 시스템, 고객용 앱, 회사 홈페이지까지 만들어요."],
            ].map(([t, d], i) => (
              <div key={t} className="rv py-8 md:py-10 grid grid-cols-[48px_1fr] md:grid-cols-[72px_1fr] gap-4" style={{ borderTop: "1px solid var(--line)" }}>
                <span className="serif text-[24px] md:text-[30px] font-semibold" style={{ color: "var(--oak)" }}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div className="text-[19px] md:text-[21px] font-bold">{t}</div>
                  <p className="body mt-3">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 핵심 가치 */}
      <section className="py-24 md:py-32">
        <div className="wrap">
          <div className="rv">
            <Eyebrow>Core values</Eyebrow>
            <h2 className="serif t-1 mt-5">일하는 기준</h2>
          </div>
          <div className="mt-12 md:mt-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[["현장", "Field first", "쓰는 사람의 하루에서 출발해요."], ["단순함", "Simplicity", "누구나 처음 봐도 쓸 수 있게 만들어요."], ["책임", "Ownership", "만든 것은 끝까지 운영하고 고쳐요."], ["신뢰", "Trust", "회사의 데이터를 안전하게 지켜요."]].map(([t, en, d], i) => (
              <div key={t} className={`rv d${i % 4} rounded-[22px] p-7 md:p-8 min-h-[220px] flex flex-col`} style={{ border: "1px solid var(--line)", background: "#fff" }}>
                <span className="eng text-[12px]" style={{ color: "var(--oak)" }}>{en}</span>
                <div className="serif text-[30px] font-semibold mt-auto">{t}</div>
                <p className="body mt-2">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

// ════════════════════════════ 사업분야 ════════════════════════════
export function Business() {
  return (
    <>
      <PageHead en="Our business" title="사업분야" desc="물류 · 배차, 요양 · 돌봄, 그리고 각 회사에 꼭 맞는 맞춤 개발까지. 현장에서 실제로 쓰이는 프로그램을 만들어요." />
      <div className="wrap py-6 md:py-8 flex gap-2 overflow-x-auto no-scrollbar" style={{ borderBottom: "1px solid var(--line)" }}>
        {FIELDS.map((f) => <a key={f.key} href={`#${f.key}`} className="chip flex items-center shrink-0">{f.no} {f.title}</a>)}
      </div>
      {FIELDS.map((f, i) => (
        <section key={f.key} id={f.key} className="py-20 md:py-28 scroll-mt-24" style={{ background: i % 2 ? "var(--cream)" : "var(--ivory)" }}>
          <div className="wrap grid lg:grid-cols-2 gap-10 lg:gap-20 items-center">
            <div className={`rv ${i % 2 ? "lg:order-2" : ""}`}>
              <Photo src={f.img} alt={f.title} ratio="4 / 5" className="rounded-[26px] zoom" />
            </div>
            <div className="rv d1">
              <div className="flex items-center gap-4">
                <span className="serif text-[44px] md:text-[56px] font-semibold leading-none" style={{ color: "var(--oak)" }}>{f.no}</span>
                <span className="eng text-[13px]" style={{ color: "var(--mute)" }}>{f.en}</span>
              </div>
              <h2 className="serif t-1 mt-5">{f.title}</h2>
              <p className="serif text-[18px] md:text-[20px] leading-[1.6] mt-4" style={{ color: "var(--ink-2)" }}>{f.short}</p>
              <p className="body mt-5">{f.desc}</p>
              <div className="mt-8">
                <div className="text-[13px] font-bold" style={{ color: "var(--oak-d)" }}>이런 걸 만들어요</div>
                <ul className="mt-3">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-start gap-3 py-3.5 text-[15px]" style={{ borderBottom: "1px solid var(--line)" }}>
                      <svg className="mt-[3px] shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--oak)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7" /></svg>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                {f.key === "logistics" && <a href="https://www.logisweb.co.kr" target="_blank" rel="noopener noreferrer" className="btn btn-dark">로지스웹 보러 가기 <Arrow /></a>}
                <Link to="/contact" className={`btn ${f.key === "logistics" ? "btn-line" : "btn-dark"}`}>{f.key === "custom" ? "개발 상담하기" : "도입 문의하기"}{f.key !== "logistics" && <Arrow />}</Link>
              </div>
            </div>
          </div>
        </section>
      ))}
      <CtaBand />
    </>
  );
}

// ════════════════════════════ 서비스 ════════════════════════════
export function Services() {
  return (
    <>
      <PageHead en="Services" title="우리가 만든 서비스" desc="직접 기획하고 개발해서 지금 현장에서 쓰이고 있는 서비스예요. 각 서비스의 홈페이지에서 자세히 볼 수 있어요." />
      <section className="py-20 md:py-28">
        <div className="wrap grid md:grid-cols-2 gap-5 md:gap-6">
          {PRODUCTS.map((p, i) => {
            const ext = p.href.startsWith("http");
            const Tag = ext ? "a" : Link;
            const lp = ext ? { href: p.href, target: "_blank", rel: "noopener noreferrer" } : { to: p.href };
            return (
              <Tag key={p.key} {...lp} className={`rv d${i % 2} group rounded-[26px] p-8 md:p-10 flex flex-col min-h-[300px] transition-colors`} style={{ background: i === 0 ? "var(--ink)" : "var(--cream)", color: i === 0 ? "var(--ivory)" : "var(--ink)", border: i === 0 ? "none" : "1px solid var(--line)" }}>
                <div className="flex items-center gap-2">
                  <span className="h-7 px-3 rounded-full text-[12px] font-bold flex items-center" style={{ background: i === 0 ? "rgba(255,255,255,.12)" : "var(--ivory)", border: i === 0 ? "none" : "1px solid var(--line)" }}>{p.tag}</span>
                  <span className="h-7 px-3 rounded-full text-[12px] font-bold flex items-center gap-1.5" style={{ color: i === 0 ? "#D7E2C8" : "#5D6B51" }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />{p.status}</span>
                </div>
                <div className="eng text-[13px] mt-8" style={{ color: i === 0 ? "#E6CFA8" : "var(--oak)" }}>{p.en}</div>
                <div className="serif text-[30px] md:text-[34px] font-semibold mt-1">{p.name}</div>
                <p className="mt-4 text-[15px] leading-[1.85] max-w-[480px]" style={{ color: i === 0 ? "#D9CFC0" : "var(--ink-2)" }}>{p.desc}</p>
                <span className="mt-auto pt-8 inline-flex items-center gap-2 text-[14.5px] font-bold group-hover:gap-3.5 transition-all">{p.cta} <Arrow size={15} /></span>
              </Tag>
            );
          })}
        </div>
        <div className="wrap mt-16 md:mt-24">
          <div className="rv grid md:grid-cols-[1fr_1.1fr] rounded-[28px] overflow-hidden" style={{ border: "1px solid var(--line)", background: "#fff" }}>
            <Photo src={IMG("devices")} alt="노트북 · 태블릿 · 휴대폰" className="min-h-[280px]" />
            <div className="p-8 md:p-12 flex flex-col justify-center">
              <Eyebrow>Custom project</Eyebrow>
              <div className="serif t-2 mt-4">여기에 없는 프로그램이 필요하신가요?</div>
              <p className="body mt-4">회사 업무에 맞는 시스템, 고객에게 보여 줄 앱, 회사 홈페이지까지 처음부터 같이 설계해서 만들어 드려요.</p>
              <div className="mt-8"><Link to="/contact" className="btn btn-dark">맞춤 개발 상담하기 <Arrow /></Link></div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ════════════════════════════ 문의하기 ════════════════════════════
const TOPICS = ["배차 · 물류 프로그램", "요양 · 돌봄 앱", "맞춤 웹 · 앱 개발", "홈페이지 제작", "기타"];

export function Contact() {
  const [f, setF] = React.useState({ company: "", name: "", phone: "", email: "", topics: [], message: "", agree: false, hp: "" });
  const [state, setState] = React.useState("idle"); // idle · sending · done · error
  const [err, setErr] = React.useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggle = (t) => setF((x) => ({ ...x, topics: x.topics.includes(t) ? x.topics.filter((y) => y !== t) : [...x.topics, t] }));

  const submit = async (e) => {
    e.preventDefault();
    if (f.hp) return; // 자동 등록 막기(사람 눈에는 안 보이는 칸)
    const name = f.name.trim(); const phone = f.phone.trim(); const message = f.message.trim();
    if (!name) return setErr("이름을 적어 주세요.");
    if (!/^[0-9+\-\s()]{8,20}$/.test(phone)) return setErr("연락받을 전화번호를 적어 주세요.");
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setErr("이메일 주소를 다시 확인해 주세요.");
    if (message.length < 5) return setErr("어떤 걸 만들고 싶은지 조금만 적어 주세요.");
    if (!f.agree) return setErr("개인정보 수집 · 이용에 동의해 주세요.");
    setErr(""); setState("sending");
    try {
      const [{ sideConn }, fs] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
      const { db } = sideConn();
      await fs.addDoc(fs.collection(db, "pnkInquiries"), {
        company: f.company.trim().slice(0, 80), name: name.slice(0, 40), phone: phone.slice(0, 20), email: f.email.trim().slice(0, 120),
        topics: f.topics.slice(0, 5), message: message.slice(0, 3000), status: "new", source: "homepage", createdAt: fs.serverTimestamp(),
      });
      setState("done");
    } catch (er) {
      console.error(er);
      setState("error");
      setErr("지금은 문의를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    }
  };

  return (
    <>
      <PageHead en="Contact" title="프로젝트 문의" desc="만들고 싶은 프로그램, 바꾸고 싶은 업무를 편하게 적어 주세요. 확인하고 남겨 주신 연락처로 먼저 연락드릴게요." />
      <section className="py-16 md:py-24">
        <div className="wrap grid lg:grid-cols-[1fr_1.5fr] gap-12 lg:gap-20">
          <aside className="rv">
            <Photo src={IMG("design")} alt="앱 화면을 스케치하는 손" ratio="4 / 3" className="rounded-[22px]" />
            <div className="mt-10 space-y-0">
              {[["1", "문의 남기기", "지금 하는 일과 바라는 모습을 적어 주세요."], ["2", "이야기 나누기", "전화나 방문으로 현장 이야기를 자세히 들어요."], ["3", "설계 · 제안", "화면 흐름과 일정, 비용을 정리해 드려요."], ["4", "개발 · 적용", "만들고, 현장에 적용하고, 함께 운영해요."]].map(([n, t, d]) => (
                <div key={n} className="flex gap-5 py-5" style={{ borderTop: "1px solid var(--line)" }}>
                  <span className="serif text-[22px] font-semibold w-6" style={{ color: "var(--oak)" }}>{n}</span>
                  <div>
                    <div className="text-[15.5px] font-bold">{t}</div>
                    <div className="text-[14px] mt-1 leading-[1.7]" style={{ color: "var(--mute)" }}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <div className="rv d1">
            {state === "done" ? (
              <div className="rounded-[26px] p-10 md:p-14 text-center" style={{ background: "var(--cream)", border: "1px solid var(--line)" }}>
                <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center" style={{ background: "var(--ink)", color: "var(--ivory)" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7" /></svg>
                </div>
                <div className="serif t-2 mt-7">문의가 잘 접수됐어요</div>
                <p className="body mt-4">남겨 주신 내용을 확인하고 <b>{f.phone}</b> 번호로 연락드릴게요.<br />소중한 이야기 들려주셔서 고마워요.</p>
                <Link to="/" className="btn btn-dark mt-9">홈으로</Link>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="space-y-7">
                <div>
                  <div className="text-[14px] font-bold mb-3">어떤 걸 만들고 싶으세요? <span className="font-medium" style={{ color: "var(--mute)" }}>(여러 개 골라도 돼요)</span></div>
                  <div className="flex flex-wrap gap-2">
                    {TOPICS.map((t) => <button key={t} type="button" onClick={() => toggle(t)} className={`chip ${f.topics.includes(t) ? "on" : ""}`} aria-pressed={f.topics.includes(t)}>{t}</button>)}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Lab label="회사 · 기관 이름"><input className="in-f" value={f.company} onChange={set("company")} placeholder="예) ○○운수, ○○요양원" maxLength={80} autoComplete="organization" /></Lab>
                  <Lab label="이름" req><input className="in-f" value={f.name} onChange={set("name")} placeholder="홍길동" maxLength={40} autoComplete="name" /></Lab>
                  <Lab label="연락처" req><input className="in-f" value={f.phone} onChange={set("phone")} placeholder="010-0000-0000" inputMode="tel" maxLength={20} autoComplete="tel" /></Lab>
                  <Lab label="이메일"><input className="in-f" value={f.email} onChange={set("email")} placeholder="name@company.com" inputMode="email" maxLength={120} autoComplete="email" /></Lab>
                </div>
                <Lab label="내용" req>
                  <textarea className="in-f" rows={7} value={f.message} onChange={set("message")} maxLength={3000} placeholder={"지금 어떻게 일하고 있는지, 어떤 점이 불편한지, 바라는 모습을 편하게 적어 주세요.\n예) 엑셀로 배차표를 만들고 있어요. 기사님께 카톡으로 하나씩 보내는 게 힘들어요."} />
                </Lab>
                <input type="text" tabIndex={-1} autoComplete="off" value={f.hp} onChange={set("hp")} className="hidden" aria-hidden="true" />
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input type="checkbox" checked={f.agree} onChange={(e) => setF((x) => ({ ...x, agree: e.target.checked }))} className="mt-1 w-5 h-5 accent-[#2A2520]" />
                  <span className="text-[14px] leading-[1.7]" style={{ color: "var(--ink-2)" }}>
                    <b style={{ color: "var(--ink)" }}>[필수] 개인정보 수집 · 이용에 동의해요.</b><br />
                    <span style={{ color: "var(--mute)" }}>이름 · 연락처 · 이메일 · 회사 이름을 문의 답변에만 쓰고, 상담이 끝나면 1년 안에 지워요.</span>
                  </span>
                </label>
                {err && <div className="rounded-xl px-4 py-3 text-[14px] font-semibold" style={{ background: "#F7E6DC", color: "#8A3F1E" }} role="alert">{err}</div>}
                <button type="submit" disabled={state === "sending"} className="btn btn-dark w-full sm:w-auto disabled:opacity-60">{state === "sending" ? "보내는 중…" : <>문의 보내기 <Arrow /></>}</button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function Lab({ label, req, children }) {
  return (
    <label className="block">
      <span className="block text-[14px] font-bold mb-2">{label}{req && <span style={{ color: "var(--oak)" }}> *</span>}</span>
      {children}
    </label>
  );
}
