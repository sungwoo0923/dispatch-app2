import { db } from "./src/firebase.js";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";

async function runFix() {
  const snap = await getDocs(collection(db, "dispatch"));
  let count = 0;

  for (const d of snap.docs) {
    const data = d.data();
    if (!data._fsid || data._fsid !== d.id) {
      await updateDoc(doc(db, "dispatch", d.id), { _fsid: d.id });
      count++;
    }
  }

  console.log(`✨ _fsid 복구 완료: ${count} 건 업데이트됨`);
}

runFix();
