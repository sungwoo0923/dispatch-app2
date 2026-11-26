// ======================= src/locFixSend.js =======================
// 📍 2026-11-26 [위치 설정 요청] 보내기 — PC 관제현황(FleetManagement) · 휴대폰 관제(MobileFleetView)가 같이 쓴다
//  · driverLocFix 기록 → 서버(functions driverLocFixPush)가 기사 휴대폰에 푸시
//  · drivers/{id}.locFixAskAt · locFixAskBy → 기사앱에 "위치 설정을 확인해 주세요" 창(src/driver/DriverHome.jsx LocFixSheet)
import { db, auth } from "./firebase";
import { collection, addDoc, doc, serverTimestamp } from "firebase/firestore";
import { getTenant } from "./fsTenant";
import { updateDoc } from "./orderWrite";
import { kpConfirm, kpAlert } from "./kpDialog";
import { myNameNow } from "./userNames";
import { locHealthOf } from "./driverClient";

export async function sendLocFixRequest(d, companyName = "") {
  if (!d?.id) return false;
  const h = locHealthOf(d.raw || d);
  const why = h && !h.ok ? `\n\n지금 확인된 문제:\n· ${h.probs.join("\n· ")}` : "";
  if (!await kpConfirm(`${d.이름 || "기사"}님께 위치 설정 요청을 보낼까요?\n기사님 휴대폰에 알림이 가고, 앱을 열면 설정 확인 창이 떠요.${why}`, { okText: "보내기" })) return false;
  const by = myNameNow() || "배차 담당";
  try {
    await addDoc(collection(db, "driverLocFix"), {
      companyName: companyName || getTenant() || "",
      driverId: d.id, driverName: d.이름 || "", carNo: d.차량번호 || "",
      requestedByUid: auth.currentUser?.uid || "", requestedByName: by,
      problems: h?.probs || [], createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "drivers", d.id), { locFixAskAt: serverTimestamp(), locFixAskBy: by });
    kpAlert("보냈어요. 기사님이 [다 했어요]를 누르면 '기사님이 설정을 확인했어요'로 바뀌어요.");
    return true;
  } catch (e) {
    kpAlert(`보내지 못했어요: ${e?.message || e}`);
    return false;
  }
}
