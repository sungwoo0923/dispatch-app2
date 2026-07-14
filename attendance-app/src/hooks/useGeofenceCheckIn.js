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
// 예전에는 수동출근 버튼만 센터의 출근인정반경(workSite.radiusM) 설정과 무관하게
// 50m로 고정되어 있었다 — 관리자가 센터정보에서 반경을 100m/150m 등으로 넓혀도
// 수동출근은 여전히 50m 안에 들어와야만 허용돼서, 자동출근은 되는데 수동출근
// 버튼만 "반경 밖"으로 막히는 모순이 있었다. 이제 자동/수동 모두 같은
// workSite.radiusM을 기준으로 판정하되, 값이 없거나 비정상적으로 작게(예: 0)
// 설정된 경우를 대비해 최소 50m는 보장한다.
const MANUAL_CHECK_IN_RADIUS_M = 50;
function resolveCheckInRadius(workSite) {
  return Math.max(workSite?.radiusM || CHECK_IN_RADIUS_M, MANUAL_CHECK_IN_RADIUS_M);
}
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

  // handlePosition은 workSite/todayAttendance/canCheckIn 등이 바뀔 때마다 새로
  // 만들어지는데(useCallback), 바로 아래 watcher 설정 effect는 네이티브
  // watcher를 매번 재시작하지 않으려고 [enabled, workSite?.id]에만 반응한다.
  // 문제는 addWatcher/watchPosition에 넘긴 콜백이 "그 순간의" handlePosition을
  // 클로저로 붙잡아버려서, 이후 관리자가 센터 좌표를 고치거나, 출근확정이
  // 되거나, 오늘 출근 기록이 바뀌어도 이 watcher는 계속 그 시점의 낡은
  // 값(옛 좌표/옛 출근기록)으로만 판정한다는 것 — 이게 "좌표를 고쳐도 반경
  // 밖이 계속 뜨는" 문제와 "퇴근시간이 계속 지금 시각으로 덮어써지는" 문제의
  // 진짜 원인이었다(낡은 클로저 속 todayAttendance엔 방금 쓴 checkOutTime이
  // 반영되지 않아 매 위치 업데이트마다 자동퇴근 조건을 다시 만족해버림).
  // ref에 항상 최신 handlePosition을 담아두고, watcher는 그 ref를 통해서만
  // 호출하게 하면 watcher 재시작 없이도 항상 최신 로직/데이터로 판정한다.
  const handlePositionRef = useRef(handlePosition);
  useEffect(() => {
    handlePositionRef.current = handlePosition;
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
              if (position && !cancelled) handlePositionRef.current(position.latitude, position.longitude, position.accuracy);
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
            if (!cancelled) handlePositionRef.current(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
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
  // 이내에 있는지를 서버 요청 직전에 다시 확인한다 — 버튼 disabled만으로는
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
      if (distance > resolveCheckInRadius(workSite)) return { ok: false, reason: "too-far" };

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
    manualCheckInRadiusM: resolveCheckInRadius(workSite),
  };
}
