// 🔒 2026-11-27 보안 점검 — HTML 문자열(인쇄 창 · document.write · innerHTML)에 데이터를 넣을 때 쓰는 공용 함수
//  · escHtml: < > & " ' 를 바꿔 태그 · 속성이 깨지지 않게
//  · safeImgSrc: 이미지 주소는 data:image / https / blob 만 허용(그 밖은 빈 값)
//  · safeHref: 링크는 https · http · tel · sms · mailto · data:image · blob 만 허용(javascript: 등은 막음)
//  · csvCell: CSV 칸 — = + - @ 로 시작하는 글자는 앞에 ' 를 붙여 엑셀에서 수식으로 실행되지 않게
export const escHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const IMG_OK = /^(data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+|https:\/\/[^\s"'<>]+|blob:[^\s"'<>]+)$/i;
export const safeImgSrc = (u) => {
  const s = String(u ?? "").trim();
  return IMG_OK.test(s) ? s : "";
};

const HREF_OK = /^(https?:\/\/|tel:|sms:|mailto:|blob:|data:image\/)/i;
export const safeHref = (u) => {
  const s = String(u ?? "").trim();
  return HREF_OK.test(s) ? s : undefined;
};

/** HTML 속성에 넣을 이미지 주소(검사 + 따옴표 처리까지) */
export const imgSrcAttr = (u) => escHtml(safeImgSrc(u));

/** CSV 한 칸 — 따옴표로 감싸고, 수식으로 시작하는 글자는 ' 를 앞에 붙인다(숫자는 그대로) */
export const csvCell = (v) => {
  let s = String(v ?? "");
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^[-+]?[\d,.]+$/.test(s)) s = "'" + s; // "-5,000" 같은 숫자는 그대로
  return `"${s.replace(/"/g, '""')}"`;
};
