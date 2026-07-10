import { useCallback, useEffect, useState } from "react";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db, app, firebaseConfig, vapidKey } from "../firebase";

// FCM 실제 발송은 Cloud Function(functions/index.js, notifications 문서
// 생성 트리거)이 담당한다 — 이 훅은 "이 기기가 푸시를 받겠다"는 토큰을
// users/{uid}.fcmTokens 배열에 등록/해제하는 역할만 한다. Blaze 요금제 +
// VAPID 키 + functions 배포가 되어 있지 않으면 토큰은 저장되지만 실제
// 푸시는 전송되지 않는다(READ ME 참고).
export function usePushNotifications(uid) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem("kpwork_push_enabled") === "true");
  const [supported] = useState(
    () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (enabled && Notification?.permission === "granted") {
      // 앱 재실행 시 이전에 켜둔 상태라면 토큰을 조용히 다시 등록한다
      // (기기 변경/재설치 등으로 서비스워커가 재등록된 경우 대비).
      registerToken(uid).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const registerToken = useCallback(
    async (targetUid) => {
      if (!vapidKey) throw new Error("no-vapid-key");
      const swUrl = `/firebase-messaging-sw.js?${new URLSearchParams(firebaseConfig).toString()}`;
      // scope를 명시하지 않으면 파일 위치(루트 "/") 기준으로 등록되는데,
      // 이게 PWA 본체 서비스워커(sw.js)와 정확히 같은 스코프라 브라우저가
      // "새 서비스워커가 등록/업데이트됨"으로 오인해 useAppUpdate.js의
      // 업데이트 배너를 엉뚱하게 띄운다("푸시 켜기 누르면 업데이트 알림이
      // 뜬다"는 문제의 원인). Firebase 공식 가이드대로 별도 스코프를 줘서
      // PWA 서비스워커와 완전히 분리한다.
      const registration = await navigator.serviceWorker.register(swUrl, {
        scope: "/firebase-cloud-messaging-push-scope",
      });
      const { getMessaging, getToken } = await import("firebase/messaging");
      const messaging = getMessaging(app);
      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
      if (token && targetUid) {
        await updateDoc(doc(db, "users", targetUid), { fcmTokens: arrayUnion(token) });
      }
      return token;
    },
    []
  );

  const enable = useCallback(async () => {
    if (!supported || !uid) return { ok: false, reason: "unsupported" };
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return { ok: false, reason: "denied" };
      await registerToken(uid);
      setEnabled(true);
      localStorage.setItem("kpwork_push_enabled", "true");
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err?.message || "error" };
    } finally {
      setLoading(false);
    }
  }, [supported, uid, registerToken]);

  const disable = useCallback(async () => {
    setEnabled(false);
    localStorage.setItem("kpwork_push_enabled", "false");
    try {
      const { getMessaging, getToken, deleteToken } = await import("firebase/messaging");
      const messaging = getMessaging(app);
      const token = await getToken(messaging, { vapidKey }).catch(() => null);
      if (token) {
        await deleteToken(messaging);
        if (uid) await updateDoc(doc(db, "users", uid), { fcmTokens: arrayRemove(token) });
      }
    } catch {
      // 최선 노력이며, 실패해도 로컬 설정(꺼짐)은 이미 반영되어 있다.
    }
  }, [uid]);

  return { supported, enabled, loading, enable, disable };
}

// enable()이 실패했을 때 "설정에 실패했습니다"라고만 뜨면 사용자도, 나중에
// 원인을 파악해야 하는 사람도 뭐가 문제인지 알 수 없다. README에 정리된
// 3가지 필수 설정(Blaze 요금제/VAPID 키/Cloud Function 배포) 중 무엇이
// 빠졌는지 최대한 구체적으로 안내한다.
export function describePushFailure(reason) {
  if (reason === "unsupported") return "이 브라우저는 푸시 알림을 지원하지 않습니다.";
  if (reason === "no-vapid-key") return "VAPID 키가 설정되지 않았습니다. 관리자에게 문의해주세요. (앱 설정에 VAPID 키 등록 필요)";
  if (typeof reason === "string" && reason.includes("messaging/permission-blocked"))
    return "알림 권한이 차단되어 있습니다. 브라우저 설정에서 알림을 허용해주세요.";
  if (typeof reason === "string" && (reason.includes("messaging/failed-service-worker-registration") || reason.includes("service")))
    return "알림 서비스워커 등록에 실패했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.";
  if (typeof reason === "string" && reason.includes("messaging/token-subscribe-failed"))
    return "푸시 서버 등록에 실패했습니다. 잠시 후 다시 시도해주세요. (계속되면 관리자에게 문의)";
  return `푸시 알림 설정에 실패했습니다. (${reason || "알 수 없는 오류"})`;
}
