// ===================== 오더 저장 공용 래퍼 =====================
// ⭐ 여러 사용자 실시간 일치용 — orders/dispatch 오더 문서를 고칠 때마다 수정시각(_lastModified)을
// 자동으로 남긴다. 다른 사용자 화면은 "앱을 연 뒤 수정된 오더"를 이 시각으로 실시간으로 받으므로,
// 최근 7일보다 예전 날짜 오더를 고쳐도 모두에게 바로 반영된다(저장 코드마다 따로 넣지 않아도 됨).
// 그 외 컬렉션·하위 컬렉션(첨부 등)은 그대로 저장한다.
// ⚠️ 로그인 없이 쓰는 업로드 링크 페이지는 보안규칙상 정해진 필드만 바꿀 수 있어 이 래퍼를 쓰지 않는다.
import { updateDoc as fbUpdateDoc, setDoc as fbSetDoc } from "firebase/firestore";

const ORDER_COLS = new Set(["orders", "dispatch"]);
const isOrderDocRef = (ref) => !!(ref && ref.parent && ORDER_COLS.has(ref.parent.id) && !ref.parent.parent);
const stamp = (ref, data) =>
  (isOrderDocRef(ref) && data && typeof data === "object" && !Array.isArray(data) && !("_lastModified" in data))
    ? { ...data, _lastModified: Date.now() }
    : data;

export function updateDoc(ref, data, ...rest) {
  // updateDoc(ref, "필드", 값, ...) 형태는 그대로 통과
  if (typeof data === "string") return fbUpdateDoc(ref, data, ...rest);
  return fbUpdateDoc(ref, stamp(ref, data), ...rest);
}

export function setDoc(ref, data, options) {
  return options === undefined ? fbSetDoc(ref, stamp(ref, data)) : fbSetDoc(ref, stamp(ref, data), options);
}
