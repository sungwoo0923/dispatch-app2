// restoreData.js
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "./src/firebase.js";

// 🚀 배차상태 자동판단 (모바일과 동일)
const getStatus = (o) =>
  o?.차량번호?.trim() ? "배차완료" : "배차중";

async function restoreData() {
  console.log("🔄 Dispatch 데이터 복구 시작!");

  const snap = await getDocs(collection(db, "dispatch"));
  let cnt = 0;

  for (const d of snap.docs) {
    const data = d.data();

    await updateDoc(doc(db, "dispatch", d.id), {
      id: d.id,          // PC 수정 로직
      _editId: d.id,     // 모바일 수정 로직
      배차상태: getStatus(data), // 상태 복구
    });

    cnt++;
  }

  console.log(`✅ 복구 완료: ${cnt}건 업데이트됨!`);
}

restoreData();
