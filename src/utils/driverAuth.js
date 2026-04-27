import { db } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export async function registerDriver(phone, name, carNo) {
  const ref = doc(db, "drivers", phone);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    alert("이미 등록된 기사입니다.");
    return false;
  }

  await setDoc(ref, {
    active: false,
    이름: name,
    차량번호: carNo,
    상태: "대기",
    updatedAt: serverTimestamp(),
  });

  alert("등록 완료! 관리자 승인 대기");
  return true;
}