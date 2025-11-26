// 🚀 Firestore DB 정리 스크립트
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "./firebase";

async function runCleanup() {
  const snap = await getDocs(collection(db, "dispatch"));
  let patched = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const ref = doc(db, "dispatch", d.id);

    const updates = {};
    let needUpdate = false;

    // ❌ 불필요한 임시 필드 제거
    if (data._editId !== undefined) {
      updates._editId = null;
      needUpdate = true;
    }
    if (data.id !== undefined) {
      updates.id = d.id; // Firestore 고유 id만 유지
      needUpdate = true;
    }

    // ❌ 상태 필드 제거 → 차량번호로 자동 계산
    if (data.배차상태 !== undefined) {
      updates.배차상태 = null;
      needUpdate = true;
    }
    if (data.상태 !== undefined) {
      updates.상태 = null;
      needUpdate = true;
    }

    if (needUpdate) {
      await updateDoc(ref, updates);
      patched++;
    }
  }

  alert(`정리 완료! 수정된 주문 수: ${patched}건`);
}

// ▶ 실행 버튼 UI
export default function CleanupFix() {
  return (
    <div style={{ padding: 40 }}>
      <button
        style={{
          padding: 20,
          fontSize: 18,
          borderRadius: 10,
          backgroundColor: "#007aff",
          color: "#fff",
        }}
        onClick={runCleanup}
      >
        🚀 Firestore DB 정리 실행하기
      </button>
    </div>
  );
}
