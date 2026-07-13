import { useEffect, useRef, useState, useCallback } from "react";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, collection, query, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { distanceMeters } from "../utils/distance";
import { toDateKey, attendanceDocId } from "../utils/dateUtils";
import { LATE_GRACE_MINUTES, minutesLate } from "../utils/attendanceStatus";

// 지각 체크인이 발생하면 같은 회사 관리자 전원에게 알림을 broadcast한다
// (SafetyMaterials.jsx의 전 직원 broadcast와 동일한 패턴, 대상만 관리자로 바뀜).
// users 컬렉션의 list 조회는 관리자만 허용되어 있어, 이 함수처럼 직원
// 세션에서 호출되면 users로는 관리자 목록을 가져올 수 없다(권한거부로
// 계속 조용히 실패하고 있었다) — 회사 구성원 누구나 읽을 수 있는
// chat_profiles에서 role==admin을 찾는다(utils/notifyAdmins.js와 동일 패턴).
async function notifyAdminsOfLateCheckIn({ companyId, name, late }) {
  if (!companyId) return;
  try {
    const snap = await getDocs(query(collection(db, "chat_profiles"), where("company", "==", companyId), where("role", "==", "admin")));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      const ref = doc(collection(db, "notifications"));
      batch.set(ref, {
        companyId,
        uid: d.id,
        title: "근로자 지각 출근 알림",
        message: `${name} 근로자가 예정 출근시각보다 ${late}분 늦게 출근했습니다.`,
        read: false,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch {
    // 알림 발송 실패가 출근 처리 자체를 막으면 안 되므로 조용히 무시한다.
  }
}

const CHECK_IN_RADIUS_M = 100;
const CHECK_OUT_RADIUS_M = 300;
// 수동 출근 버튼은 자동출근(반경 100m)보다 더 엄격하게, 등록된 센터 반경 50m
// 이내에서만 허용한다 — 관리자가 지정한 근무지에 실제로 도착했는지 확인하는
// 마지막 관문이므로 workSite.radiusM 설정과 무관하게 고정값을 쓴다.
const MANUAL_CHECK_IN_RADIUS_M = 50;
// 위치 권한이 "정확한 위치(Precise Location)"가 아닌 대략적 위치로 내려가
// 있거나, 기기가 실내/지하 등이라 GPS 신호를 못 잡으면 브라우저가 Wi-Fi/IP
// 기반 위치를 대신 주는데, 이때 accuracy가 수만 m로 찍히면서 실제로는
// 근무지 안에 있어도 거리 계산이 완전히 틀어져 "반경 밖"으로 보인다. 이런
// 신뢰할 수 없는 좌표로 반경 판정을 내리지 않도록 accuracy가 이 값보다
// 나쁘면(클수록 부정확) 자동출퇴근/수동출근 판정에서 제외하고, 화면에는
// "위치 정확도가 낮습니다" 안내를 보여준다.
const POOR_ACCURACY_THRESHOLD_M = 300;

async function writeAttendance({ uid, name, companyId, status, extra }) {
  const dateKey = toDateKey();
  const ref = doc(db, "attendance", attendanceDocId(uid, dateKey));
  await setDoc(
    ref,
    {
      uid,
      name,
      companyId,
      date: dateKey,
      month: dateKey.slice(0, 7),
      status,
      updatedAt: serverTimestamp(),
      ...extra,
    },
    { merge: true }
  );
}

/**
 * Watches device location (Capacitor background-geolocation when running as
 * a native app, browser geolocation otherwise) and auto check-in/out when the
 * employee enters/leaves the radius of their assigned work site.
 */
export function useGeofenceCheckIn({ uid, name, companyId, workSite, enabled, canCheckIn = true, scheduleStartTime = "" }) {
  const [distance, setDistance] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [permissionError, setPermissionError] = useState(null);
  const autoCheckedInRef = useRef(false);
  const watcherIdRef = useRef(null);

  // 관리자가 PC에서 강제출근 등으로 이 근로자의 attendance 문서를 직접
  // 수정해도, 이미 열려있는 모바일 앱은 실시간으로 반영되어야 한다 —
  // 예전에는 getDoc 1회 조회라 다른 탭에 갔다 와서 컴포넌트가 다시
  // 마운트돼야만 최신 상태를 봤다. onSnapshot으로 바꿔 즉시 반영한다.
  const refreshToday = useCallback(async () => {
    if (!uid) return;
    const snap = await getDoc(doc(db, "attendance", attendanceDocId(uid, toDateKey())));
    const data = snap.exists() ? snap.data() : null;
    setTodayAttendance(data);
    autoCheckedInRef.current = data?.status === "출근" || data?.status === "지각";
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "attendance", attendanceDocId(uid, toDateKey())), (snap) => {
      const data = snap.exists() ? snap.data() : null;
      setTodayAttendance(data);
      autoCheckedInRef.current = data?.status === "출근" || data?.status === "지각";
    });
    return () => unsub();
  }, [uid]);

  const handlePosition = useCallback(
    async (lat, lng, acc) => {
      if (acc != null) setAccuracy(acc);
      if (!workSite?.lat || !workSite?.lng) return;
      // 정확도가 너무 낮은(수백m 이상 오차) 좌표는 반경 판정에 쓰지 않는다 —
      // 화면에는 이전에 확보한 정상 거리값을 그대로 두고, accuracy만 갱신해
      // "위치 정확도가 낮습니다" 안내가 뜨도록 한다.
      if (acc != null && acc > POOR_ACCURACY_THRESHOLD_M) return;
      const d = distanceMeters(lat, lng, workSite.lat, workSite.lng);
      setDistance(d);

      const radiusIn = workSite.radiusM || CHECK_IN_RADIUS_M;
      const radiusOut = Math.max(radiusIn * 3, CHECK_OUT_RADIUS_M);

      if (canCheckIn && !autoCheckedInRef.current && d <= radiusIn) {
        autoCheckedInRef.current = true;
        const now = new Date();
        const late = minutesLate(scheduleStartTime, now);
        await writeAttendance({
          uid,
          name,
          companyId,
          status: late > LATE_GRACE_MINUTES ? "지각" : "출근",
          extra: {
            checkInTime: now.toISOString(),
            checkInLocation: { lat, lng, distanceM: Math.round(d) },
            source: "auto",
            siteId: workSite.id,
            siteName: workSite.name,
          },
        });
        if (late > LATE_GRACE_MINUTES) notifyAdminsOfLateCheckIn({ companyId, name, late });
        refreshToday();
      } else if (autoCheckedInRef.current && d > radiusOut && !todayAttendance?.checkOutTime) {
        await writeAttendance({
          uid,
          name,
          companyId,
          status: todayAttendance?.status || "출근", // preserve 지각/출근 as recorded at check-in
          extra: { checkOutTime: new Date().toISOString(), checkOutSource: "auto" },
        });
        refreshToday();
      }
    },
    [uid, name, companyId, workSite, todayAttendance, refreshToday, canCheckIn, scheduleStartTime]
  );

  // 상시 watchPosition과 별개로, 사용자가 "위치 갱신" 버튼을 눌렀을 때 즉시
  // 한 번 더 측위해 반영한다 — 실내에 있다가 막 실외로 나온 직후처럼 상시
  // watcher가 아직 갱신되지 않았을 때 기다리지 않고 바로 재시도할 수 있게 한다.
  const refreshLocation = useCallback(() => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          handlePosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
          resolve(true);
        },
        (err) => {
          setPermissionError(err.message);
          resolve(false);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
    });
  }, [handlePosition]);

  useEffect(() => {
    if (!enabled || !workSite) return;

    let cancelled = false;

    async function start() {
      const isNative = typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.();

      if (isNative) {
        try {
          // Built as a non-literal specifier so Vite/Rollup never try to
          // statically resolve this native-only package during web/PWA
          // dev or build; it only exists inside the native Capacitor shell.
          const nativeGeoPkg = ["@capacitor-community", "background-geolocation"].join("/");
          const { BackgroundGeolocation } = await import(/* @vite-ignore */ nativeGeoPkg);
          const id = await BackgroundGeolocation.addWatcher(
            {
              backgroundMessage: "반경 자동출근 확인을 위해 위치를 추적하고 있습니다.",
              backgroundTitle: "KP-work 출근 확인 중",
              requestPermissions: true,
              stale: false,
              distanceFilter: 15,
            },
            (position, error) => {
              if (error) {
                setPermissionError(error.message || String(error));
                return;
              }
              if (position && !cancelled) handlePosition(position.latitude, position.longitude, position.accuracy);
            }
          );
          watcherIdRef.current = { native: true, id, BackgroundGeolocation };
          return;
        } catch (err) {
          setPermissionError(err.message || String(err));
        }
      }

      if (navigator.geolocation) {
        const webId = navigator.geolocation.watchPosition(
          (pos) => {
            if (!cancelled) handlePosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
          },
          (err) => setPermissionError(err.message),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
        );
        watcherIdRef.current = { native: false, id: webId };
      }
    }

    start();

    return () => {
      cancelled = true;
      const w = watcherIdRef.current;
      if (!w) return;
      if (w.native) {
        w.BackgroundGeolocation.removeWatcher({ id: w.id }).catch(() => {});
      } else {
        navigator.geolocation.clearWatch(w.id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, workSite?.id]);

  // 관리자가 오늘 스케줄을 출근확정 처리했는지, 그리고 등록된 센터 반경
  // 50m 이내에 있는지를 서버 요청 직전에 다시 확인한다 — 버튼 disabled만으로는
  // devtools 등으로 우회될 수 있으므로 이 함수 자체가 최종 관문 역할을 한다.
  // { ok: false, reason } 형태로 실패 사유를 돌려주어 호출부가 안내 메시지를
  // 보여줄 수 있게 한다.
  const manualCheckIn = useCallback(
    async (extraFields = {}) => {
      if (!canCheckIn) return { ok: false, reason: "not-confirmed" };
      if (distance == null) {
        if (accuracy != null && accuracy > POOR_ACCURACY_THRESHOLD_M) return { ok: false, reason: "poor-accuracy" };
        return { ok: false, reason: "no-location" };
      }
      if (distance > MANUAL_CHECK_IN_RADIUS_M) return { ok: false, reason: "too-far" };

      const now = new Date();
      const late = minutesLate(scheduleStartTime, now);
      await writeAttendance({
        uid,
        name,
        companyId,
        status: late > LATE_GRACE_MINUTES ? "지각" : "출근",
        extra: {
          checkInTime: now.toISOString(),
          checkInLocation: { distanceM: Math.round(distance) },
          source: "manual",
          siteId: workSite?.id || null,
          siteName: workSite?.name || "",
          ...extraFields,
        },
      });
      if (late > LATE_GRACE_MINUTES) notifyAdminsOfLateCheckIn({ companyId, name, late });
      autoCheckedInRef.current = true;
      refreshToday();
      return { ok: true };
    },
    [uid, name, companyId, distance, accuracy, workSite, refreshToday, canCheckIn, scheduleStartTime]
  );

  const manualCheckOut = useCallback(async () => {
    await writeAttendance({
      uid,
      name,
      companyId,
      status: todayAttendance?.status || "출근",
      extra: { checkOutTime: new Date().toISOString(), checkOutSource: "manual" },
    });
    refreshToday();
  }, [uid, name, companyId, todayAttendance, refreshToday]);

  return {
    distance,
    accuracy,
    todayAttendance,
    permissionError,
    manualCheckIn,
    manualCheckOut,
    refreshToday,
    refreshLocation,
    manualCheckInRadiusM: MANUAL_CHECK_IN_RADIUS_M,
  };
}
