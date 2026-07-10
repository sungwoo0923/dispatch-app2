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
      const registration = await navigator.serviceWorker.register(swUrl);
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
