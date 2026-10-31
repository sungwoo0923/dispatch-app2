// ======================= src/copyTemplates.js =======================
// 📋 기사복사 "기사전달용 / 전체상세" 문구를 운송사(회사)마다 바꿔 쓰는 설정.
//  - 저장 위치: companySettings/{회사}.copyTemplates = { driver: {...}, full: {...} }
//  - 오더 본문(날짜·상하차지·화물·결제방법)은 프로그램이 자동으로 만들고,
//    그 위/아래 문구와 "업로드 링크 넣기" 여부만 회사가 정한다.
//  - 한 번도 손대지 않은 칸(null)은 기존 문구 그대로 → 아무도 안 바꾸면 전과 100% 같은 결과
import { useEffect, useState } from "react";
import { db, doc, onSnapshot, setDoc, DEFAULT_COMPANY } from "./firebase";

// 문구 안에 넣을 수 있는 자동 치환 값
export const COPY_VARS = [
  ["업로드링크", "기사 서류 업로드 링크"],
  ["온도안내", "냉장/냉동이면 온도 안내, 아니면 '관련 서류 업로드 필수'"],
  ["결제안내", "착불/선불/결제일 링크 안내"],
  ["서류안내", "냉장/냉동이면 타코메타 기록지 안내 포함"],
  ["차량번호", "배차된 차량번호"],
  ["기사명", "기사 이름"],
  ["연락처", "기사 연락처"],
  ["운임", "청구운임(콤마 포함 숫자)"],
  ["지급구분", "부가세별도 / 선불 / 착불"],
  ["지급방식", "지급방식 그대로"],
  ["상차지", "상차지명"],
  ["하차지", "하차지명"],
  ["상차일", "상차일"],
  ["회사명", "우리 회사 이름"],
];

// 화면 기본값(설정 편집기에서 "기본값" 표시·되돌리기용) — 실시간배차현황 기준 문구
export const COPY_DEFAULTS = {
  driver: {
    includeUpload: true,
    uploadBlock: "[파렛전표/거래명세서 업로드]\n미 전송시 운임 지연 될 수 있습니다.\n↓↓↓↓↓↓↓↓↓↓↓↓\n{업로드링크}",
    top: "{온도안내}\n{결제안내}",
    bottom: "※ 인수증(파렛전표) 서명 받은 후 업로드필수\nKPP/아주파렛트 상차시 각각 전표업로드 필수\n{서류안내}\n※ 서류/전표 없는 건이면 업로드 하지마세요.\n※ 미업로드 시 운임 지급 지연될 수 있습니다",
  },
  full: {
    includeUpload: false,
    uploadBlock: "[서류 업로드]\n{업로드링크}",
    top: "",
    bottom: "{차량번호} {기사명} {연락처}\n{운임}원 {지급구분} 배차되었습니다.",
  },
};

const resolveCompany = () => {
  try { return localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || DEFAULT_COMPANY; } catch { return DEFAULT_COMPANY; }
};

// 복사 함수(이벤트 핸들러)에서 동기로 꺼내 쓰기 위한 메모리 캐시
let cache = {};
export function getCopyTpl(mode) {
  const c = cache?.[mode] || {};
  return { ...c, includeUpload: typeof c.includeUpload === "boolean" ? c.includeUpload : COPY_DEFAULTS[mode].includeUpload };
}

// 회사 설정을 실시간으로 받아 둔다(DispatchApp 최상단에서 한 번 호출). 편집기에서는 반환값을 쓴다.
export function useCopyTemplates(company) {
  const [cfg, setCfg] = useState(cache);
  useEffect(() => {
    const key = company || resolveCompany();
    return onSnapshot(doc(db, "companySettings", key), (s) => {
      cache = (s.exists() && s.data()?.copyTemplates) || {};
      setCfg(cache);
    }, () => {});
  }, [company]);
  return cfg;
}

export async function saveCopyTemplates(next, company) {
  await setDoc(doc(db, "companySettings", company || resolveCompany()), { copyTemplates: next }, { merge: true });
}

const fill = (tpl, vars) => String(tpl || "").replace(/\{([^{}\s]+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? "") : m));

/**
 * 최종 복사 문구 조립
 * mode: "driver" | "full"
 * body: 프로그램이 만든 오더 본문
 * vars: COPY_VARS 값
 * defaults: 그 화면의 기존 문구 { uploadBlock, top, bottom } — 회사가 손대지 않은 칸에 사용
 */
export function buildCopyText(mode, { body, vars, defaults }) {
  const c = getCopyTpl(mode);
  const pick = (k) => (typeof c[k] === "string" ? c[k] : defaults?.[k] ?? COPY_DEFAULTS[mode][k]);
  const upload = c.includeUpload && vars.업로드링크 ? fill(pick("uploadBlock"), vars).trim() : "";
  let top = fill(pick("top"), vars);
  let bottom = fill(pick("bottom"), vars);
  if (!c.includeUpload) { top = top.replace(/^.*https?:\/\/\S*.*$/gm, ""); bottom = bottom.replace(/^.*https?:\/\/\S*.*$/gm, ""); }
  top = top.trim(); bottom = bottom.trim();
  const out = mode === "driver"
    ? `${upload ? upload + "\n\n" : ""}${top ? top + "\n" : ""}${body}${bottom ? "\n\n" + bottom : ""}`
    : `${upload ? upload + "\n\n" : ""}${top ? top + "\n\n" : ""}${body}${bottom ? "\n\n" + bottom : ""}`;
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

// 설정 편집기 미리보기용 예시 값
export const SAMPLE_VARS = {
  업로드링크: "https://kp-flow.app/u/Ab3dE9", 온도안내: "*관련 서류 업로드 필수*", 결제안내: "*결제일 링크 참고하세요*", 서류안내: "※ 거래명세서 서류 업로드",
  차량번호: "경기12가3456", 기사명: "김기사", 연락처: "010-1234-5678", 운임: "350,000", 지급구분: "부가세별도", 지급방식: "계산서",
  상차지: "동원F&B 이천센터", 하차지: "CJ 대구 물류센터", 상차일: "2026-10-30", 회사명: "우리회사",
};
export const SAMPLE_BODY = {
  driver: "2026-10-30 (목)\n\n상차 : 동원F&B 이천센터 / 09:00\n경기 이천시 마장면 100\n상차방법 : 지게차\n\n하차 : CJ 대구 물류센터 / 15:00\n대구 달서구 성서로 10\n하차방법 : 수작업\n\n화물 : 11톤 / 16파레트 윙바디\n결제방법 : 계산서(우리회사)",
  full: "2026-10-30 (목)\n\n상차지 : 동원F&B 이천센터\n경기 이천시 마장면 100\n상차시간 : 09:00\n상차방법 : 지게차\n\n하차지 : CJ 대구 물류센터\n대구 달서구 성서로 10\n하차시간 : 15:00\n하차방법 : 수작업\n\n중량 : 11톤 / 16파레트 윙바디\n결제방법 : 계산서",
};
