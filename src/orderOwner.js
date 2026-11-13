// ======================= src/orderOwner.js =======================
// 👤 2026-11-09 오더 복사 — 배차담당자 고르기(처음엔 원본 담당자 그대로)
//  · staffOptionsOf(list): 직원 명부(usersLive 목록) → [{ key, name, email }] (기사·화주·퇴사·승인대기 제외)
//  · ownerOfOrder(order): 원본 오더에 찍힌 담당자 { name, email }
//  · applyOwner(payload, owner): 복사본에 고른 담당자를 담당자 필드들에 똑같이 넣는다
const NOT_STAFF = new Set(["driver", "shipper", "cafeUser"]);

export function staffOptionsOf(list = []) {
  const seen = new Set();
  const out = [];
  (list || []).forEach((u) => {
    if (!u || NOT_STAFF.has(u.role) || u.approved === false || u.employmentStatus === "퇴사" || u.noAccount) return;
    const name = String(u.name || "").trim();
    if (!name) return;
    const email = String(u.email || "").trim().toLowerCase();
    const key = email || `name:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, name, email, team: String(u.team || "").trim(), position: String(u.position || "").trim() }); // 부서 · 직책은 [담당자 변경] 목록 표시용
  });
  return out.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function ownerOfOrder(o = {}) {
  const email = String(o.createdByEmail || o.등록자이메일 || (String(o.작성자 || "").includes("@") ? o.작성자 : "") || "").trim().toLowerCase();
  const name = String(o.등록자명 || o.createdByName || o.등록자 || "").trim();
  return { name, email };
}

// 원본 담당자가 직원 목록의 누구인지(이메일 → 이름 순) — 못 찾으면 원본 값 그대로 쓰는 항목을 하나 만든다
export function matchOwner(owner, opts = []) {
  if (owner.email) { const m = opts.find((s) => s.email === owner.email); if (m) return m; }
  if (owner.name) { const m = opts.find((s) => s.name === owner.name); if (m) return m; }
  if (!owner.name && !owner.email) return null;
  return { key: "__orig__", name: owner.name || owner.email, email: owner.email, orig: true };
}

// payload를 바로 고친다(그리고 돌려준다)
export function applyOwner(payload, owner) {
  if (!owner || owner.orig || !payload) return payload; // 원본 그대로
  const p = payload;
  p.등록자명 = owner.name;
  p.createdByName = owner.name;
  if ("등록자" in p) p.등록자 = owner.name;
  if (owner.email) { p.createdByEmail = owner.email; p.작성자 = owner.email; if ("등록자이메일" in p) p.등록자이메일 = owner.email; }
  delete p.createdByUid; delete p.createdBy;
  return p;
}
