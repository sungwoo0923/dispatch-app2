// ======================= src/safetyEdu.js =======================
// 🦺 2026-11-24 안전교육 — 사용자 요청: "운송사 및 기사들이 꼭 받아야 하는 안전교육. 영상을 끝까지 봐야 마지막에 이수 서명"
//  · 퀴즈 없음(사용자 요청) — 영상 끝까지 보기 → 이수 서명 → 이수 기록 / 서약서는 끝까지 읽기 → 서명
//  · 기사는 관리자가 고르면 영상을 건너뛰고 서약서 서명으로 대체할 수 있다(eduSettings/{회사}.driverVideo)
//  · 기록: eduRecords/{회사}__{uid}__{교육id}__{기간}  — 본인이 만들고 고칠 수 없다(서명 기록) · 같은 회사 사무 직원이 본다
//  · 보던 위치: eduProgress/{uid}__{교육id} — 본인만

// 교육 목록(1단계: 기사 교육 2편 + 안전수칙 서약서 + 직원 사무실 안전 확인서) — 영상은 public/edu/*.mp4(marketing/edu/build.mjs 로 만든다)
export const EDU_COURSES = [
  {
    id: "drv_load",
    audience: "driver",
    kind: "video",
    emoji: "📦",
    title: "화물 적재 · 결박 안전",
    summary: "짐이 쏟아지지 않게 싣고 묶는 법",
    minutes: 4,
    video: "/edu/drv_load.mp4",
    cycle: "yearly",
    pledge: "화물 적재 · 결박 안전교육 영상을 끝까지 시청했으며, 적재 기준을 지키고 출발 전 결박 상태를 직접 확인하겠습니다.",
  },
  {
    id: "drv_dock",
    audience: "driver",
    kind: "video",
    emoji: "🚧",
    title: "상 · 하차장 안전",
    summary: "지게차 주변 · 후진 · 끼임 사고 막기",
    minutes: 3,
    video: "/edu/drv_dock.mp4",
    cycle: "yearly",
    pledge: "상 · 하차장 안전교육 영상을 끝까지 시청했으며, 작업장 안전수칙과 현장 안내자의 지시를 따르겠습니다.",
  },
  {
    id: "drv_pledge",
    audience: "driver",
    kind: "doc",
    emoji: "✍️",
    title: "안전수칙 준수 서약서",
    summary: "운행 · 작업 안전수칙을 지키겠다는 약속",
    minutes: 2,
    cycle: "yearly",
    sections: [
      { h: "운행 전", items: ["출발 전 타이어 · 등화 · 제동장치를 점검합니다.", "적재물 결박 상태를 직접 눈으로 확인합니다.", "음주 · 약물 복용 후에는 절대 운전하지 않습니다."] },
      { h: "운행 중", items: ["제한속도와 신호를 지키고, 운전 중 휴대폰을 손에 들지 않습니다.", "2시간 운전하면 15분 이상 쉽니다. 졸리면 바로 안전한 곳에 세우고 쉽니다.", "적재함 문 · 덮개가 열린 채 달리지 않습니다."] },
      { h: "상 · 하차 작업", items: ["작업장에서는 안내자의 지시를 따르고, 지게차 작업 반경에 들어가지 않습니다.", "후진할 때는 유도자를 두거나 내려서 뒤를 확인합니다.", "안전모 · 안전화 등 현장이 정한 보호구를 착용합니다."] },
      { h: "사고 · 고장 때", items: ["비상등을 켜고 차 뒤 100m(야간 200m)에 삼각대를 둡니다.", "사람이 다쳤으면 119에 먼저 신고하고, 회사에 바로 알립니다.", "2차 사고가 나지 않게 가드레일 밖 안전한 곳으로 피합니다."] },
    ],
    pledge: "위 안전수칙을 읽고 이해했으며, 운행과 작업 중 성실히 지킬 것을 서약합니다.",
  },
  {
    id: "staff_office",
    audience: "staff",
    kind: "doc",
    emoji: "🏢",
    title: "사무실 안전 · 화재 대피 수칙 확인서",
    summary: "사무실 안전과 불났을 때 대피하는 법",
    minutes: 2,
    cycle: "yearly",
    sections: [
      { h: "사무실 안전", items: ["통로 · 비상구 앞에 짐을 두지 않습니다.", "멀티탭에 전열기구를 겹쳐 꽂지 않고, 퇴근할 때 난방기 · 전열기 전원을 끕니다.", "무거운 물건은 무릎을 굽혀 들고, 높은 곳은 사다리나 받침대를 씁니다."] },
      { h: "바른 자세 · 건강", items: ["모니터는 눈높이에, 50분 일하면 5~10분 쉬며 목 · 어깨를 풉니다.", "몸이 아프거나 다치면 참지 말고 바로 회사에 알립니다."] },
      { h: "불이 났을 때", items: ["“불이야” 크게 외치고 비상벨을 누릅니다.", "엘리베이터 대신 계단으로, 젖은 수건으로 코와 입을 막고 낮은 자세로 대피합니다.", "대피한 뒤 119에 신고하고, 정해진 집결 장소에서 인원을 확인합니다.", "소화기 위치를 미리 알아 두고, 작은 불은 소화기로 끕니다(안전핀 → 노즐 → 손잡이)."] },
    ],
    pledge: "위 사무실 안전 · 화재 대피 수칙을 읽고 이해했으며, 성실히 지킬 것을 확인합니다.",
  },
];

export const courseById = (id) => EDU_COURSES.find((c) => c.id === id) || null;
export const coursesFor = (audience) => EDU_COURSES.filter((c) => c.audience === audience);

// 이수 기간 — 해마다 다시 받는 교육은 연도, 한 번만은 "once"
export const eduPeriod = (course, now = new Date()) => (course?.cycle === "yearly" ? String(now.getFullYear()) : "once");
export const eduRecordId = (co, uid, courseId, period) => `${String(co || "").trim()}__${uid}__${courseId}__${period}`;
export const eduProgressId = (uid, courseId) => `${uid}__${courseId}`;

// 기사 영상 대체 — 회사 설정: "required"(영상 필수 · 기본) | "pledgeAll"(모든 기사 서약서로 대체) | "pick"(고른 기사만)
export function driverMayPledge(settings, uid) {
  const mode = settings?.driverVideo || "required";
  if (mode === "pledgeAll") return true;
  if (mode === "pick") return Array.isArray(settings?.pledgeUids) && settings.pledgeUids.includes(uid);
  return false;
}

// 영상 시청 인정 — 앞으로 건너뛴 부분은 빼고 실제로 본 초가 영상 길이의 95% 이상
export const WATCH_RATIO = 0.95;
export function watchedEnough(watchedSec, durationSec) {
  if (!durationSec || durationSec <= 0) return false;
  return watchedSec >= durationSec * WATCH_RATIO;
}

// 이수 상태(현황판 · 내 교육) — record 없음 → 미이수
export function eduStatusOf(record) {
  if (!record) return { key: "todo", label: "미이수" };
  if (record.mode === "pledge") return { key: "pledge", label: "서약서로 이수" };
  return { key: "done", label: "이수" };
}
