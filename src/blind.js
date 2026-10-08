// ⭐ 블라인드 오더 — 최고관리자가 등록 시 "블라인드"를 체크하면(오더 문서 블라인드:true)
// 최고관리자 외에는 어떤 배차 목록에도 노출되지 않는다. 로그인한 사용자의 역할은
// App.jsx가 setBlindViewerRole()로 알려준다.
let viewerIsTotalMaster = false;

export function setBlindViewerRole(role, email) {
  viewerIsTotalMaster = role === "totalMaster" || email === "tjddnqkf@naver.com";
}
export function canSeeBlind() {
  return viewerIsTotalMaster;
}
// 이 오더를 지금 사용자에게 숨겨야 하는가
export function isBlindHidden(row) {
  return !!row && row.블라인드 === true && !viewerIsTotalMaster;
}
export function hideBlind(list) {
  if (viewerIsTotalMaster || !Array.isArray(list)) return list;
  return list.filter(r => !(r && r.블라인드 === true));
}
