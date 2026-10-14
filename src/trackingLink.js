// ⭐ 화주용 배송 추적 링크 — 로그인 없이 열리는 /track 페이지 주소를 만든다.
// 오더 문서에 추적토큰을 한 번 만들어 두고, 링크의 t 값이 맞아야만 페이지가 내용을 보여준다.
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

const randToken = () => {
  try {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
  } catch {
    return Math.random().toString(36).slice(2, 18);
  }
};

// forDriver=true → 기사용 링크(열면 위치공유 동의 후 관리자에게 실시간 위치 전송). 화주용과 토큰을 따로 써서
// 화주 링크로는 위치 전송 화면이 열리지 않게 한다.
export async function makeTrackingLink(order, forDriver = false) {
  const id = order?._id || order?.id;
  if (!id) throw new Error("오더 id가 없습니다");
  const col = order.__col || "orders";
  const key = forDriver ? "기사추적토큰" : "추적토큰";
  let t = order[key];
  if (!t) {
    t = randToken();
    await updateDoc(doc(db, col, id), { [key]: t });
  }
  return `${window.location.origin}/track?id=${encodeURIComponent(id)}&c=${encodeURIComponent(col)}&t=${t}${forDriver ? "&m=driver" : ""}`;
}

// 링크를 만들고 화주에게 보낼 문구까지 클립보드에 복사
export async function copyTrackingLink(order) {
  const url = await makeTrackingLink(order);
  const text = `[배송 조회 안내]\n${order.상차지명 || ""} → ${order.하차지명 || ""}${order.상차일 ? ` (${order.상차일})` : ""}\n아래 링크에서 차량 위치와 도착 예상 시간을 확인하실 수 있습니다.\n${url}`;
  try { await navigator.clipboard.writeText(text); } catch { window.prompt("아래 내용을 복사하세요", text); }
  return url;
}

// ⭐ 기사용 위치공유 링크 — 기사가 열고 위치 권한을 승인하면 관리자 화면(📍 실시간 위치)에 위치가 보인다(앱 설치 불필요)
export async function copyDriverTrackingLink(order) {
  const url = await makeTrackingLink(order, true);
  const text = `[위치 공유 요청]\n${order.상차지명 || ""} → ${order.하차지명 || ""}${order.상차일 ? ` (${order.상차일})` : ""}\n아래 링크를 열고 "위치 공유 시작"을 눌러주세요. 운송 중에는 화면을 켜 두시면 됩니다.\n${url}`;
  try { await navigator.clipboard.writeText(text); } catch { window.prompt("아래 내용을 복사하세요", text); }
  return url;
}
