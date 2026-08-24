// src/planner/plannerInvite.js — 배우자 초대 공유 텍스트/링크를 만들고 공유를 실행한다.
// ⭐ 참여코드를 입력받는 사람의 성별은 Firestore 조회 없이(비로그인 상태에서도 항상
// 되도록) 이 초대 링크의 쿼리파라미터(joinGender)에 직접 실어 보낸다 — 링크를 만든
// 사람이 이미 자기 성별을 알고 있으니, "나와 반대 성별"을 계산해서 링크에 넣어두면
// 받는 사람은 그 값을 그대로 고정해서 가입하면 된다.
export function oppositeGender(g) {
  return g === "male" ? "female" : "male";
}

export function buildInviteLink(groupCode, myGender) {
  const g = oppositeGender(myGender || "female");
  return `${window.location.origin}/planner-signup?code=${encodeURIComponent(groupCode)}&joinGender=${g}`;
}

export function buildInviteMessage({ groupCode, groupName, myName, myGender }) {
  const link = buildInviteLink(groupCode, myGender);
  return [
    `${myName ? `${myName}님이 ` : ""}KP-Planner(우리 가족 다이어리)에 초대했어요.`,
    "",
    `아래 링크를 누르면 "${groupName || "우리 가족"}" 가족에 바로 합류할 수 있어요.`,
    link,
    "",
    `가족코드: ${groupCode} (링크를 열면 자동으로 입력돼 있어요)`,
    "",
    "함께 수입·지출, 일정, 이벤트 예산을 관리해요.",
  ].join("\n");
}

// 반환값: "shared" | "cancelled" | "copied" | "failed"
export async function shareInvite({ groupCode, groupName, myName, myGender }) {
  const text = buildInviteMessage({ groupCode, groupName, myName, myGender });
  if (navigator.share) {
    try {
      await navigator.share({ title: "KP-Planner 초대", text });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
