// ======================= src/dispatch/DispatcherMapView.jsx =======================
import React, { useEffect, useRef } from "react";
import { db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";

export default function DispatcherMapView() {
  const mapRef = useRef(null);
  const mapObjRef = useRef(null);
  const markersRef = useRef({});

  useEffect(() => {
    if (!window.kakao) return;

    // 지도 초기화
    mapObjRef.current = new window.kakao.maps.Map(mapRef.current, {
      center: new window.kakao.maps.LatLng(37.5665, 126.978),
      level: 8,
    });

    // Firestore 실시간 구독
    const unsub = onSnapshot(collection(db, "driver_locations"), (snap) => {
      snap.docChanges().forEach((change) => {
        const id = change.doc.id;
        const data = change.doc.data();

        const pos = new window.kakao.maps.LatLng(data.lat, data.lng);

        let marker = markersRef.current[id];

        if (!marker) {
          marker = new window.kakao.maps.Marker({ map: mapObjRef.current });
          markersRef.current[id] = marker;
        }

        marker.setPosition(pos);

        // 운행 상태에 따른 마커 색상
        const iconColor = data.status === "운행중" ? "#007bff" : "#555";
        const markerImage = new window.kakao.maps.MarkerImage(
          `https://via.placeholder.com/30/${iconColor.slice(1)}/ffffff?text=%20`,
          new window.kakao.maps.Size(30, 30)
        );
        marker.setImage(markerImage);

        // 마커 클릭시 정보표시
        const info = new window.kakao.maps.InfoWindow({
          content: `
            <div style="padding:10px;">
              <strong>${id}</strong><br/>
              상태: ${data.status}<br/>
              거리: ${(data.totalDistance / 1000).toFixed(1)} km<br/>
              운행: ${(data.drivingSec / 3600).toFixed(1)} h
            </div>`,
        });

        window.kakao.maps.event.addListener(marker, "click", () => {
          info.open(mapObjRef.current, marker);
        });
      });
    });

    return () => unsub();
  }, []);

  return (
    <div className="p-4">
      <h2 className="font-bold text-lg mb-2">🚦 실시간 관제 지도</h2>
      <div ref={mapRef} className="w-full h-[600px] rounded-lg border" />
    </div>
  );
}
// ======================= END =======================
