// ======================= src/helpSearch.js =======================
// 🤖 2026-11-17 AI 비서 — AI 서버를 못 쓸 때도(키 문제 · 한도 · 연결 끊김) 프로그램 도움말(src/helpContent.js)에서 찾아 답한다
//  "전자결재에서는 어떤 기능을 쓸 수 있어?" → 전자결재 도움말의 묶음 · 버튼을 정리해서 보여 준다
//  순수 함수(테스트: scripts/helpSearch.test.mjs)
import { HELP_DETAIL, HELP_COMMON } from "./helpContent.js";

// 화면 이름 ↔ 사람들이 부르는 이름
const MENU_ALIASES = {
  배차관리: ["오더등록", "오더 등록", "배차등록", "배차 등록"],
  실시간배차현황: ["실시간", "실시간 배차"],
  배차현황: ["배차 현황", "미배차", "고정노선", "인수증", "월마감", "월 마감"],
  정산관리: ["정산", "거래처정산", "거래명세서", "명세서", "용차지급", "지입정산", "입금 확인", "청구 현황판"],
  회계관리: ["회계", "회계장부", "원가 분석", "급여", "급여계산"],
  자금관리: ["자금", "수입지출", "수입·지출", "장부", "통장"],
  비품관리: ["비품", "자산"],
  전자결재: ["결재", "결재함", "지출결의", "품의"],
  인사관리부: ["인사", "근태", "연차", "직원 정보", "인사발령"],
  기사관리: ["기사"],
  거래처관리: ["거래처"],
  지입차관리: ["지입", "지입차"],
  매출관리: ["매출"],
  단가표: ["단가"],
  운임조회: ["운임"],
  회사관리: ["게시판", "공지", "사내메일", "메신저", "일정"],
  HOME: ["홈"],
};
const MENU_LABEL = { 배차관리: "오더등록", HOME: "홈" };
const STOP = /^(어떤|무슨|뭐|뭘|무엇|어떻게|어디|어디서|기능|기능을|기능은|사용|사용할|쓸|할|수|있어|있나요|있어요|있니|알려줘|알려|주세요|줘|해줘|좀|하는|하는법|방법|에서는|에서|은|는|이|가|을|를|그리고|있는|돼|되나요)$/;
const JOSA = /(에서는|에서|으로는|으로|에는|에게|까지|부터|이랑|하고|이란|란|은|는|이|가|을|를|의|도|로|와|과)$/;

export const tokensOf = (text) => String(text || "").replace(/[?!.,·()[\]"'“”‘’~]/g, " ").split(/\s+/).map((w) => w.trim()).filter(Boolean)
  .map((w) => (w.length > 2 ? w.replace(JOSA, "") : w)).filter((w) => w.length >= 2 && !STOP.test(w));

// 질문에서 메뉴 찾기 — 메뉴 이름 · 별칭이 글에 들어 있으면
export function menuOf(text) {
  const t = String(text || "").replace(/\s+/g, "");
  let best = null, bestLen = 0;
  for (const menu of Object.keys(HELP_DETAIL)) {
    for (const n of [menu, MENU_LABEL[menu], ...(MENU_ALIASES[menu] || [])].filter(Boolean)) {
      const k = n.replace(/\s+/g, "");
      if (k.length >= 2 && t.includes(k) && k.length > bestLen) { best = menu; bestLen = k.length; }
    }
  }
  return best;
}
const itemName = (it) => String(it).split(" — ")[0].trim();
const itemDesc = (it) => String(it).split(" — ").slice(1).join(" — ").trim();

// → { answer, menu } | null
export function helpAnswer(text) {
  const toks = tokensOf(text);
  const menu = menuOf(text);
  const sections = menu ? HELP_DETAIL[menu] : [...HELP_COMMON, ...Object.values(HELP_DETAIL).flat()];
  const menuOfSection = new Map();
  if (!menu) Object.entries(HELP_DETAIL).forEach(([m, list]) => list.forEach((s) => menuOfSection.set(s, m)));
  // 메뉴만 물었고(“전자결재에서 뭐 할 수 있어?”) 더 좁힐 낱말이 없으면 → 그 메뉴 전체 요약
  const extra = toks.filter((w) => !menu || ![menu, MENU_LABEL[menu], ...(MENU_ALIASES[menu] || [])].some((n) => n && (n.includes(w) || w.includes(n.replace(/\s+/g, "")))));
  if (menu && !extra.length) {
    const label = MENU_LABEL[menu] || menu;
    const lines = sections.map((s) => {
      const names = s.items.map(itemName).filter((n) => n.length <= 24).slice(0, 6);
      return `■ ${s.title}${s.intro ? `\n  ${s.intro}` : ""}${names.length ? `\n  · ${names.join(" · ")}` : ""}`;
    });
    return { menu, answer: `${label}에서 할 수 있는 일이에요.\n\n${lines.join("\n\n")}\n\n궁금한 버튼 이름을 말씀하시면 자세히 알려 드릴게요.` };
  }
  // 낱말로 항목 찾기
  const want = extra.length ? extra : toks;
  if (!want.length) return null;
  const hits = [];
  sections.forEach((s) => {
    const head = `${s.title} ${s.intro || ""}`;
    s.items.forEach((it) => {
      const name = itemName(it), body = String(it);
      let score = 0;
      want.forEach((w) => { if (name.includes(w)) score += 4; else if (body.includes(w)) score += 2; if (head.includes(w)) score += 1; });
      if (score > 0) hits.push({ s, it, score, menu: menu || menuOfSection.get(s) || "" });
    });
  });
  if (!hits.length) return null;
  hits.sort((a, b) => b.score - a.score);
  const top = hits[0].score;
  const picked = hits.filter((h) => h.score >= Math.max(2, top * 0.6)).slice(0, 4);
  if (!picked.length) return null;
  const where = (h) => (h.menu ? `${MENU_LABEL[h.menu] || h.menu} › ${h.s.title}` : h.s.title);
  const body = picked.map((h) => `■ ${itemName(h.it)} (${where(h)})\n  ${itemDesc(h.it) || h.it}`).join("\n\n");
  return { menu: menu || picked[0].menu || "", answer: `도움말에서 찾았어요.\n\n${body}` };
}
