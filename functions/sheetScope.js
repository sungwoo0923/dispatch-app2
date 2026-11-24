// ======================= functions/sheetScope.js =======================
// 🔗 시트로 보낼 오더인가 — 시트 프로필(functions/sheetProfileCore.mjs)이 같이 쓰는 기준
//  프로필의 회사가 만든 오더만, 배차표(구글시트 고정노선) · 지입차관리 고정노선 오더는 뺀다.
//  scope = { companyName, defaultCompany, includeFixed }
function isProfileOwnOrder(scope, d) {
  if (!d || !scope || !scope.companyName) return false;
  if ((d.companyName || scope.defaultCompany || "") !== scope.companyName) return false;
  if (!scope.includeFixed && (d.배차표Id || d._autoSheet || d.고정노선Id || d.등록기기 === "배차표")) return false;
  return true;
}

module.exports = { isProfileOwnOrder };
