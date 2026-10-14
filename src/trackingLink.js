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

export async function makeTrackingLink(order) {
  const id = order?._id || order?.id;
  if (!id) throw new Error("오더 id가 없습니다");
  const col = order.__col || "orders";
  let t = order.추적토큰;
  if (!t) {
    t = randToken();
    await updateDoc(doc(db, col, id), { 추적토큰: t });
  }
  return `${window.location.origin}/track?id=${encodeURIComponent(id)}&c=${encodeURIComponent(col)}&t=${t}`;
}

// 링크를 만들고 화주에게 보낼 문구까지 클립보드에 복사
export async function copyTrackingLink(order) {
  const url = await makeTrackingLink(order);
  const text = `[배송 조회 안내]\n${order.상차지명 || ""} → ${order.하차지명 || ""}${order.상차일 ? ` (${order.상차일})` : ""}\n아래 링크에서 차량 위치와 도착 예상 시간을 확인하실 수 있습니다.\n${url}`;
  try { await navigator.clipboard.writeText(text); } catch { window.prompt("아래 내용을 복사하세요", text); }
  return url;
}
