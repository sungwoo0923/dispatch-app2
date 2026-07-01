import { useEffect, useRef, useState, useCallback } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { distanceMeters } from "../utils/distance";
import { toDateKey } from "../utils/dateUtils";

const CHECK_IN_RADIUS_M = 100;
const CHECK_OUT_RADIUS_M = 300;

function attendanceDocId(uid, dateKey) {
  return `${dateKey}_${uid}`;
}

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
export function useGeofenceCheckIn({ uid, name, companyId, workSite, enabled }) {
  const [distance, setDistance] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [permissionError, setPermissionError] = useState(null);
  const autoCheckedInRef = useRef(false);
  const watcherIdRef = useRef(null);

  const refreshToday = useCallback(async () => {
    if (!uid) return;
    const snap = await getDoc(doc(db, "attendance", attendanceDocId(uid, toDateKey())));
    const data = snap.exists() ? snap.data() : null;
    setTodayAttendance(data);
    autoCheckedInRef.current = data?.status === "출근";
  }, [uid]);

  useEffect(() => {
    refreshToday();
  }, [refreshToday]);

  const handlePosition = useCallback(
    async (lat, lng) => {
      if (!workSite?.lat || !workSite?.lng) return;
      const d = distanceMeters(lat, lng, workSite.lat, workSite.lng);
      setDistance(d);

      const radiusIn = workSite.radiusM || CHECK_IN_RADIUS_M;
      const radiusOut = Math.max(radiusIn * 3, CHECK_OUT_RADIUS_M);

      if (!autoCheckedInRef.current && d <= radiusIn) {
        autoCheckedInRef.current = true;
        await writeAttendance({
          uid,
          name,
          companyId,
          status: "출근",
          extra: {
            checkInTime: new Date().toISOString(),
            checkInLocation: { lat, lng, distanceM: Math.round(d) },
            source: "auto",
          },
        });
        refreshToday();
      } else if (autoCheckedInRef.current && d > radiusOut && !todayAttendance?.checkOutTime) {
        await writeAttendance({
          uid,
          name,
          companyId,
          status: "출근", // keep as present-day status, just record checkout time
          extra: { checkOutTime: new Date().toISOString(), checkOutSource: "auto" },
        });
        refreshToday();
      }
    },
    [uid, name, companyId, workSite, todayAttendance, refreshToday]
  );

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
              if (position && !cancelled) handlePosition(position.latitude, position.longitude);
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
            if (!cancelled) handlePosition(pos.coords.latitude, pos.coords.longitude);
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

  const manualCheckIn = useCallback(async () => {
    await writeAttendance({
      uid,
      name,
      companyId,
      status: "출근",
      extra: {
        checkInTime: new Date().toISOString(),
        checkInLocation: distance != null ? { distanceM: Math.round(distance) } : null,
        source: "manual",
      },
    });
    autoCheckedInRef.current = true;
    refreshToday();
  }, [uid, name, companyId, distance, refreshToday]);

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

  return { distance, todayAttendance, permissionError, manualCheckIn, manualCheckOut };
}
