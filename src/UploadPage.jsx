// src/UploadPage.jsx
// ─────────────────────────────────────────────────────────────
// 공개 인수증 업로드 페이지 — 로그인 불필요, 링크만 있으면 접근 가능
// ?id=... 있으면 오더 기반 모드, 없으면 수동 입력 모드
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from "react";
import { db } from "./firebase";
import {
  doc,
  getDoc,
  updateDoc,
  increment,
  deleteDoc,
  collection,
  addDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";


// ────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────
export default function UploadPage() {
  const [orderId, setOrderId]     = useState(null);
  const [order, setOrder]         = useState(null);
  const [status, setStatus]       = useState("loading"); // loading | ready | done | error
  const [isManual, setIsManual]   = useState(false);

  // 수동 모드 입력 필드
  const [manualDate, setManualDate] = useState("");
  const [manualCar, setManualCar]   = useState("");
  const [manualName, setManualName] = useState("");

  const [uploadStep, setUploadStep] = useState(1); // 1: 배차정보/확인사항, 2: 거래명세서 예시/파일선택/서명
  const [files, setFiles]         = useState([]);
  const [previews, setPreviews]   = useState([]);
  const [progress, setProgress]   = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded]   = useState([]);
  const [drag, setDrag]           = useState(false);
  const inputRef                  = useRef(null);
  const sigRef                    = useRef(null);
  const [signed, setSigned]       = useState(false);
  const [sigDrawing, setSigDrawing] = useState(false);
  const [showPaymentCalc, setShowPaymentCalc] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [imgZoomOpen, setImgZoomOpen] = useState(false);
  const imgZoomRef = useRef(null);
  const imgPinchRef = useRef({ dist: null, scale: 1, baseScale: 1, tx: 0, ty: 0, baseTx: 0, baseTy: 0, pointers: {} });

  // 결제일 계산 로직
  const calcPaymentDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return null;
    const dow = d.getDay(); // 0=일,1=월,2=화,3=수,4=목,5=금,6=토

    const addDays = (base, n) => {
      const r = new Date(base);
      r.setDate(r.getDate() + n);
      return r;
    };
    const fmtDate = (dt) => {
      const y = dt.getFullYear(), m = String(dt.getMonth()+1).padStart(2,"0"), dd = String(dt.getDate()).padStart(2,"0");
      const yoil = ["일","월","화","수","목","금","토"][dt.getDay()];
      return `${y}-${m}-${dd} (${yoil}요일)`;
    };

    let result, desc;
    if (dow === 5) { // 금요일
      const r = addDays(d, 4); // 다음주 화요일
      result = fmtDate(r); desc = "금요일 계산서 → 익주 화요일 입금";
    } else if (dow === 6 || dow === 0) { // 주말
      // 다음주 화요일
      const diff = dow === 6 ? 3 : 2;
      const r = addDays(d, diff);
      result = fmtDate(r); desc = "주말 계산서 → 화요일 입금";
    } else { // 평일 월~목
      let r = addDays(d, 3);
      // 주말이면 다음 월요일로
      if (r.getDay() === 6) r = addDays(r, 2);
      else if (r.getDay() === 0) r = addDays(r, 1);
      const dowNames = ["일","월","화","수","목"];
      desc = `${dowNames[dow]}요일 계산서 → 3일 후 입금`;
      result = fmtDate(r);
    }
    return { result, desc };
  };

  const isCold = React.useMemo(() => {
    const t = String(order?.차량종류 || "");
    return t.includes("냉장") || t.includes("냉동");
  }, [order]);

  const checkItems = React.useMemo(() => {
    const base = [
      "거래명세서를 선명하게 한 장씩 촬영했습니다",
      "파렛트 전표에 서명을 받았습니다 (필수)",
    ];
    if (isCold) base.push("타코메타 기록지를 촬영했습니다 (냉장/냉동 해당)");
    base.push("미업로드시 운임 보류에 동의합니다");
    return base;
  }, [isCold]);

  const [checks, setChecks]       = useState([]);
  const allChecked                 = checks.length > 0 && checks.every(Boolean);

  React.useEffect(() => {
    setChecks(new Array(checkItems.length).fill(false));
  }, [checkItems.length]);

  // ── URL에서 id/params 추출 & 오더 조회 ──────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (!id) {
      // 수동 모드 — URL 파라미터에서 초기값 읽기
      setManualDate(params.get("date") || "");
      setManualCar(params.get("car") || "");
      setManualName(params.get("name") || "");
      setIsManual(true);
      setStatus("ready");
      return;
    }

    setOrderId(id);

    (async () => {
      try {
        // orders(신규) → dispatch(기존) → dispatch_test(테스트) → fixedClients 순으로 검색
        let snap = await getDoc(doc(db, "orders", id));
        if (!snap.exists()) {
          snap = await getDoc(doc(db, "dispatch", id));
        }
        if (!snap.exists()) {
          snap = await getDoc(doc(db, "dispatch_test", id));
        }
        if (!snap.exists()) {
          snap = await getDoc(doc(db, "fixedClients", id));
        }
        if (snap.exists()) {
          setOrderId(id);
          setOrder({ _id: id, _col: snap.ref.parent.id, ...snap.data() });
          setStatus("ready");
        } else {
          setStatus("error");
        }
      } catch (e) {
        console.error(e);
        setStatus("error");
      }
    })();
  }, []);

  // ── 실시간 위치 공유 (무료 GPS 기반 — 이 페이지가 화면에 켜져 있는 동안만 동작) ──
  // 브라우저 Geolocation API로 좌표를 받아 오더 문서(+화주사 전송사본)에 기록한다.
  // 화면이 꺼지거나 다른 앱으로 전환되면(특히 iOS Safari) 위치 전송이 멈추는
  // 플랫폼 제약이 있어, "이 화면을 보고 있는 동안의 대략적인 위치"용 기능이다.
  const [sharingLoc, setSharingLoc] = useState(false);
  const [locError, setLocError] = useState(null);
  const [lastLoc, setLastLoc] = useState(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!sharingLoc || !order || isManual) return;
    if (!navigator.geolocation) {
      setLocError("이 브라우저는 위치 공유를 지원하지 않습니다.");
      setSharingLoc(false);
      return;
    }
    const mirrorTarget = order._transmittedOrderId
      ? { col: "orders", id: order._transmittedOrderId }
      : (order.originCol && order.originId ? { col: order.originCol, id: order.originId } : null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLastLoc({ lat, lng, at: Date.now() });
        setLocError(null);
        const payload = { 위치: { lat, lng }, 위치갱신일시: serverTimestamp() };
        updateDoc(doc(db, order._col, orderId), payload).catch(() => {});
        if (mirrorTarget) {
          updateDoc(doc(db, mirrorTarget.col, mirrorTarget.id), payload).catch(() => {});
        }
      },
      (err) => {
        setLocError(err.code === 1 ? "위치 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요." : "위치를 가져올 수 없습니다.");
        setSharingLoc(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [sharingLoc, order, isManual, orderId]);

  // ── 파일 선택 처리 ───────────────────────────────────────
  // 같은 사진(내용이 동일한 파일)을 중복으로 추가하려 하면 막고 안내한다
  const handleFiles = useCallback((newFiles) => {
    const arr = Array.from(newFiles).filter(f => f.type.startsWith("image/") || f.type === "application/pdf");
    if (!arr.length) return;
    arr.forEach(f => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target.result;
        setPreviews(prev => {
          if (prev.some(p => p.src === src)) {
            alert("이미 추가한 사진입니다. 같은 사진은 중복으로 업로드할 수 없습니다.");
            return prev;
          }
          setFiles(prevFiles => [...prevFiles, f]);
          return [...prev, { name: f.name, src, type: f.type }];
        });
      };
      reader.readAsDataURL(f);
    });
  }, []);

  const removeFile = (i) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  // ✅ 이미지 압축 (최대 1200px, JPEG 75%)
  // 네트워크가 불안정한 일부 기기에서 addDoc이 응답도 실패도 없이 무한 대기하는
  // 경우가 있어, 일정 시간 안에 끝나지 않으면 명시적으로 실패 처리한다.
  const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} 시간 초과 (네트워크 상태를 확인해주세요)`)), ms)),
  ]);

  const compressImage = (file) => new Promise((resolve) => {
    if (file.type === "application/pdf") { resolve(file); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => resolve(new File([blob], file.name, { type: "image/jpeg" })), "image/jpeg", 0.75);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  // ── 업로드 실행 ──────────────────────────────────────────
  const handleUpload = async () => {
    if (!files.length || uploading) return;

    // 수동 모드: 날짜 필수
    if (isManual && !manualDate) {
      alert("상차일을 선택해주세요.");
      return;
    }

    setUploading(true);
    const results = [];

    // 수동 모드: 업로드 전 메타 문서 먼저 생성
    let targetCol = order?._col || "orders";
    let targetId = orderId;

    if (isManual) {
      try {
        const metaDoc = await addDoc(collection(db, "driver_uploads"), {
          상차일: manualDate,
          차량번호: manualCar,
          이름: manualName,
          createdAt: serverTimestamp(),
          source: "manual_upload",
        });
        targetCol = "driver_uploads";
        targetId = metaDoc.id;
        setOrderId(metaDoc.id);
      } catch (e) {
        console.error("메타 문서 생성 실패:", e);
        alert("업로드 준비 실패: " + e.message);
        setUploading(false);
        return;
      }
    }

    // 운송사 원본 <-> 화주사 전송카피 간 첨부파일이 어느 쪽에서 올려도 양쪽에 동일하게 반영되도록 동기화
    const mirrorTarget = (!isManual && order)
      ? (order._transmittedOrderId
          ? { col: "orders", id: order._transmittedOrderId }
          : (order.originCol && order.originId ? { col: order.originCol, id: order.originId } : null))
      : null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // 실제 업로드는 base64 변환 후 한 번에 저장되어 바이트 단위 진행률이 없으므로,
      // 처리 중에는 서서히 올라가다가(최대 95%) 완료 시 100%로 딱 떨어지게 흉내낸다.
      setProgress(prev => ({ ...prev, [i]: 1 }));
      const progressTimer = setInterval(() => {
        setProgress(prev => {
          const cur = prev[i] || 0;
          if (cur <= 0 || cur >= 95) return prev;
          return { ...prev, [i]: Math.min(95, Math.round(cur + Math.random() * 10 + 3)) };
        });
      }, 150);

      try {
        const compressed = await compressImage(file);

        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(compressed);
        });

        const sizeKB = Math.round(base64.length * 0.75 / 1024);
        if (base64.length > 1_300_000) {
          clearInterval(progressTimer);
          alert(`${file.name} 파일이 너무 큽니다 (${sizeKB}KB). 사진을 더 작게 찍거나 다른 사진을 사용하세요.`);
          setProgress(prev => { const n = {...prev}; delete n[i]; return n; });
          continue;
        }

        // 첫 번째 파일 업로드 시 서명 이미지도 저장
        if (i === 0 && sigRef.current && signed) {
          const sigBase64 = sigRef.current.toDataURL("image/png");
          const sigPayload = {
            base64: sigBase64,
            name: "서명.png",
            type: "image/png",
            sizeKB: Math.round(sigBase64.length * 0.75 / 1024),
            uploadedAt: serverTimestamp(),
            source: "driver_signature",
          };
          const sigId = doc(collection(db, targetCol, targetId, "attachments")).id;
          await withTimeout(setDoc(doc(db, targetCol, targetId, "attachments", sigId), sigPayload), 25000, "서명 저장");
          if (mirrorTarget) {
            try { await setDoc(doc(db, mirrorTarget.col, mirrorTarget.id, "attachments", sigId), sigPayload); }
            catch (e) { console.warn("서명 동기화 실패(무시):", e); }
          }
        }

        const filePayload = {
          base64,
          name: file.name,
          type: "image/jpeg",
          sizeKB,
          uploadedAt: serverTimestamp(),
          source: "driver_upload",
        };
        const fileId = doc(collection(db, targetCol, targetId, "attachments")).id;
        await withTimeout(setDoc(doc(db, targetCol, targetId, "attachments", fileId), filePayload), 25000, "파일 업로드");
        if (mirrorTarget) {
          try {
            await setDoc(doc(db, mirrorTarget.col, mirrorTarget.id, "attachments", fileId), filePayload);
            await updateDoc(doc(db, mirrorTarget.col, mirrorTarget.id), { attachCount: increment(1) });
          } catch (e) { console.warn("첨부 동기화 실패(무시):", e); }
        }
        const docRef = { id: fileId };

        clearInterval(progressTimer);
        setProgress(prev => ({ ...prev, [i]: 100 }));
        results.push({ name: file.name, url: base64, docId: docRef.id, fileIndex: i });

      } catch (err) {
        clearInterval(progressTimer);
        console.error("업로드 오류:", err);
        // 진행률이 중간에서 멈춘 채로 남지 않도록 실패 상태로 명확히 표시
        setProgress(prev => ({ ...prev, [i]: -1 }));
      }
    }

    if (results.length > 0 && !isManual) {
      try {
        const parentRef = doc(db, targetCol, targetId);
        await updateDoc(parentRef, { attachCount: increment(results.length) });
      } catch(e) { console.error("카운트 업데이트 실패:", e); }
    }

    const failedCount = files.length - results.length;
    const succeededIdx = new Set(results.map(r => r.fileIndex));
    setUploaded(prev => [...prev, ...results]);
    // 실패한 파일은 목록에 남겨 다시 업로드할 수 있게 하고, 성공한 파일만 제거한다
    setFiles(prev => prev.filter((_, idx) => !succeededIdx.has(idx)));
    setPreviews(prev => prev.filter((_, idx) => !succeededIdx.has(idx)));
    setProgress({});
    setUploading(false);

    if (results.length > 0 && failedCount === 0) {
      setStatus("done");
    } else if (failedCount > 0) {
      alert(results.length > 0
        ? `${results.length}개 업로드 완료, ${failedCount}개 실패했습니다. 실패한 사진은 다시 시도해주세요.`
        : `업로드에 실패했습니다 (${failedCount}개). 네트워크 상태를 확인 후 다시 시도해주세요.`);
    }
  };

  // ────────────────────────────────────────────────────────
  // 렌더
  // ────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Noto Sans KR', sans-serif", minHeight: "100vh", background: "#f0f2f5", overscrollBehaviorY: "contain", touchAction: "pan-y" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet" />

      {/* ── 헤더 ── */}
      <div style={{ background: "#1B2B4B", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, background: "rgba(255,255,255,0.15)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "white", fontSize: 20, fontWeight: 900 }}>KP</span>
        </div>
        <div>
          <div style={{ color: "white", fontWeight: 900, fontSize: 16, letterSpacing: "-0.3px" }}>KP-Flow</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>인수증 / 서류 업로드</div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 40px" }}>

        {/* ── 로딩 ── */}
        {status === "loading" && (
          <div style={cardStyle}>
            <div style={{ textAlign: "center", padding: "40px 0", color: "#6b7280" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>배차 정보 불러오는 중...</div>
            </div>
          </div>
        )}

        {/* ── 오류 ── */}
        {status === "error" && (
          <div style={cardStyle}>
            <div style={{ textAlign: "center", padding: "40px 0", color: "#ef4444" }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>링크가 올바르지 않습니다</div>
              <div style={{ color: "#9ca3af", fontSize: 13 }}>배차 담당자에게 링크를 다시 요청해주세요.</div>
            </div>
          </div>
        )}

        {/* ── 업로드 완료 ── */}
        {status === "done" && (
          <div style={cardStyle}>
            <div style={{ textAlign: "center", paddingTop: 24, paddingBottom: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 18, color: "#1B2B4B", marginBottom: 4 }}>업로드 완료!</div>
              <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>
                {uploaded.length}개 파일이 전달되었습니다.
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {uploaded.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", borderRadius: 10, padding: "10px 12px" }}>
                  {f.url && (
                    <img src={f.url} alt={f.name} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0", flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#1e293b", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>업로드 완료</div>
                  </div>
                  {f.docId && !isManual && (
                    <button
                      onClick={async () => {
                        if (!window.confirm("이 사진을 삭제하시겠습니까?")) return;
                        try {
                          const col = order?._col || "orders";
                          await deleteDoc(doc(db, col, orderId, "attachments", f.docId));
                          await updateDoc(doc(db, col, orderId), { attachCount: increment(-1) });
                          setUploaded(prev => prev.filter((_, idx) => idx !== i));
                        } catch(e) { alert("삭제 실패: " + e.message); }
                      }}
                      style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #fca5a5", background: "#fff", color: "#ef4444", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                    >
                      삭제
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => { setStatus("ready"); setUploaded([]); }}
              style={{ ...btnOutline, width: "100%", textAlign: "center" }}
            >
              추가 업로드
            </button>
          </div>
        )}

        {/* ── 메인 업로드 UI ── */}
        {status === "ready" && (
          <>
          {uploadStep === 1 && (
          <>
            {/* 오더 정보 카드 (오더 기반 모드) */}
            {!isManual && order && (
              <div style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 4, height: 20, background: "#1B2B4B", borderRadius: 2 }} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#1B2B4B" }}>배차 정보</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <InfoBox label="기사명" value={order.이름 || "-"} />
                  <InfoBox label="차량번호" value={order.차량번호 || "-"} />
                  <InfoBox label="연락처" value={order.전화번호 || "-"} />
                  <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>상차일</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{order.상차일 || "-"}</div>
                    <div style={{ fontSize: 10, color: "#ef4444", marginTop: 2 }}>* 상차일 기준으로 선택하세요</div>
                  </div>
                </div>

                <div style={{ marginTop: 10, background: "#f8fafc", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>상차지</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{order.상차지명 || "-"}</div>
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 16 }}>→</div>
                  <div style={{ flex: 1, textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>하차지</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{order.하차지명 || "-"}</div>
                  </div>
                </div>

                {/* 실시간 위치 공유 토글 */}
                <div style={{ marginTop: 10, background: sharingLoc ? "#ecfdf5" : "#f8fafc", border: sharingLoc ? "1px solid #6ee7b7" : "1px solid transparent", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 6 }}>
                        {sharingLoc && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", display: "inline-block", animation: "uploadLocPulse 1.4s ease-in-out infinite" }} />}
                        실시간 위치 공유
                      </div>
                      <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 2 }}>
                        {sharingLoc ? "운송사·화주사가 현재 위치를 볼 수 있어요. 이 화면을 켜둔 상태로 유지해주세요." : "켜두면 배송 중 위치를 운송사/화주사가 확인할 수 있어요."}
                      </div>
                    </div>
                    <button
                      onClick={() => setSharingLoc(v => !v)}
                      style={{
                        padding: "8px 14px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                        background: sharingLoc ? "#1B2B4B" : "#e2e8f0", color: sharingLoc ? "#fff" : "#475569",
                      }}
                    >
                      {sharingLoc ? "끄기" : "켜기"}
                    </button>
                  </div>
                  {locError && <div style={{ fontSize: 10.5, color: "#ef4444", marginTop: 6 }}>{locError}</div>}
                </div>
                <style>{`@keyframes uploadLocPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }`}</style>
              </div>
            )}

            {/* 결제일 정보 버튼 */}
            <button
              onClick={() => setShowPaymentCalc(true)}
              style={{ width: "100%", padding: "13px 16px", background: "#1B2B4B", color: "white", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              결제일 정보
            </button>

            {/* 결제일 정보 모달 */}
            {showPaymentCalc && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 9999 }} onClick={() => setShowPaymentCalc(false)}>
                <div style={{ background: "white", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "24px 20px 40px", boxShadow: "0 -8px 32px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
                  <div style={{ width: 40, height: 4, background: "#e2e8f0", borderRadius: 2, margin: "0 auto 20px" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 4, height: 20, background: "#1B2B4B", borderRadius: 2 }} />
                    <span style={{ fontWeight: 700, fontSize: 15, color: "#1B2B4B" }}>결제일 정보</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 18, paddingLeft: 12 }}>계산서 발행일을 선택하면 입금 예정일을 안내해 드립니다.</p>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>계산서 발행일</label>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={e => setInvoiceDate(e.target.value)}
                      style={{ width: "100%", padding: "11px 14px", border: "2px solid #1B2B4B", borderRadius: 10, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", color: "#1e293b" }}
                    />
                  </div>

                  {invoiceDate && (() => {
                    const calc = calcPaymentDate(invoiceDate);
                    if (!calc) return null;
                    return (
                      <div style={{ background: "#eef1f7", border: "1.5px solid #b8c5d9", borderRadius: 12, padding: "16px" }}>
                        <div style={{ fontSize: 11, color: "#1B2B4B", fontWeight: 700, marginBottom: 6 }}>{calc.desc}</div>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>입금 예정일</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#1B2B4B" }}>{calc.result}</div>
                        <div style={{ marginTop: 12, padding: "10px 12px", background: "white", borderRadius: 8, fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>
                          <div style={{ fontWeight: 700, color: "#374151", marginBottom: 4 }}>입금 규칙 안내</div>
                          <div>금요일 계산서 → 익주 화요일</div>
                          <div>주말(토/일) 계산서 → 화요일</div>
                          <div>평일(월~목) 계산서 → 3일 후</div>
                          <div style={{ marginTop: 6, color: "#9ca3af", fontSize: 10 }}>* 공휴일의 경우 담당자에게 문의해 주세요.</div>
                        </div>
                      </div>
                    );
                  })()}

                  {!invoiceDate && (
                    <div style={{ background: "#f8fafc", borderRadius: 10, padding: "14px", fontSize: 12, color: "#64748b", lineHeight: 1.7 }}>
                      <div style={{ fontWeight: 700, color: "#374151", marginBottom: 6 }}>입금 규칙 안내</div>
                      <div>금요일 계산서 → 익주 화요일</div>
                      <div>주말(토/일) 계산서 → 화요일</div>
                      <div>평일(월~목) 계산서 → 3일 후</div>
                      <div style={{ marginTop: 8, color: "#9ca3af", fontSize: 11 }}>* 공휴일의 경우 담당자에게 문의해 주세요.</div>
                    </div>
                  )}

                  <button
                    onClick={() => setShowPaymentCalc(false)}
                    style={{ marginTop: 20, width: "100%", padding: "13px", background: "#f1f5f9", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, color: "#64748b", cursor: "pointer" }}
                  >닫기</button>
                </div>
              </div>
            )}

            {/* 수동 입력 카드 (수동 모드) */}
            {isManual && (
              <div style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 4, height: 20, background: "#1B2B4B", borderRadius: 2 }} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#1B2B4B" }}>배차 정보 입력</span>
                </div>

                {/* 상차일 */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>상차일</label>
                    <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>* 상차일 기준으로 선택하세요</span>
                  </div>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={e => setManualDate(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
                  />
                </div>

                {/* 차량번호 */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>차량번호</label>
                  <input
                    type="text"
                    value={manualCar}
                    onChange={e => setManualCar(e.target.value)}
                    placeholder="예: 12가 3456"
                    style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
                  />
                </div>

                {/* 기사명 */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>기사명</label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={e => setManualName(e.target.value)}
                    placeholder="기사 이름을 입력하세요"
                    style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
                  />
                </div>
              </div>
            )}

            {/* 체크리스트 카드 */}
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 4, height: 20, background: "#1B2B4B", borderRadius: 2 }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: "#1B2B4B" }}>업로드 전 확인사항</span>
                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: allChecked ? "#059669" : "#94a3b8" }}>
                  {checks.filter(Boolean).length}/{checks.length} 완료
                </span>
              </div>
              {checkItems.map((text, i) => (
                <div key={i} onClick={() => setChecks(prev => { const n=[...prev]; n[i]=!n[i]; return n; })}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                    borderRadius: 10, marginBottom: 8, cursor: "pointer",
                    background: checks[i] ? "#f0fdf4" : "#f8fafc",
                    border: `1.5px solid ${checks[i] ? "#86efac" : "#e2e8f0"}`,
                    transition: "all 0.15s" }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    background: checks[i] ? "#1B2B4B" : "white",
                    border: `2px solid ${checks[i] ? "#1B2B4B" : "#cbd5e1"}`,
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {checks[i] && <span style={{ color: "white", fontSize: 13, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 13, color: checks[i] ? "#166534" : "#374151",
                    fontWeight: checks[i] ? 700 : 400 }}>{text}</span>
                </div>
              ))}
              {!allChecked && (
                <div style={{ textAlign: "center", marginTop: 4, fontSize: 12, color: "#94a3b8" }}>
                  모든 항목 확인 후 다음으로 진행할 수 있습니다
                </div>
              )}
            </div>

            {/* 다음 버튼: 확인사항을 모두 체크해야 활성화 */}
            <button
              onClick={() => allChecked && setUploadStep(2)}
              disabled={!allChecked}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                border: "none",
                background: allChecked ? "#1B2B4B" : "#cbd5e1",
                opacity: allChecked ? 1 : 0.7,
                color: "white",
                fontWeight: 700,
                fontSize: 15,
                cursor: allChecked ? "pointer" : "not-allowed",
                fontFamily: "'Noto Sans KR', sans-serif",
                transition: "background 0.2s",
              }}
            >
              다음
            </button>
          </>
          )}

          {uploadStep === 2 && (
          <>
            {/* 이전 단계로 */}
            <button
              onClick={() => setUploadStep(1)}
              style={{ background: "none", border: "none", color: "#6b7280", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "4px 0 12px", display: "flex", alignItems: "center", gap: 4 }}
            >
              ← 배차정보로 돌아가기
            </button>

            {/* 거래명세서 예시 */}
            <div style={cardStyle}>
              <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #e2e8f0", cursor: "zoom-in" }}
                onClick={() => setImgZoomOpen(true)}>
                <img src="/거래명세서.png" alt="거래명세서 예시" style={{ width: "100%", display: "block" }}
                  onError={(e) => { e.target.style.display = "none"; }} />
              </div>
              <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: "#94a3b8" }}>거래명세서 예시 (클릭하여 확대)</div>
            </div>

            {/* 거래명세서 이미지 확대 모달 */}
            {imgZoomOpen && (
              <div
                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }}
                onClick={() => setImgZoomOpen(false)}
              >
                <button
                  onClick={() => setImgZoomOpen(false)}
                  style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 40, height: 40, color: "white", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}
                >✕</button>
                <div
                  ref={imgZoomRef}
                  style={{ touchAction: "none", userSelect: "none", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}
                  onClick={e => e.stopPropagation()}
                  onPointerDown={e => {
                    const p = imgPinchRef.current;
                    p.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const pts = Object.values(p.pointers);
                    if (pts.length === 2) {
                      const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
                      p.dist = Math.sqrt(dx*dx + dy*dy);
                      p.baseScale = p.scale;
                      p.baseTx = p.tx; p.baseTy = p.ty;
                    } else if (pts.length === 1) {
                      p.baseTx = p.tx; p.baseTy = p.ty;
                      p.startX = e.clientX; p.startY = e.clientY;
                    }
                  }}
                  onPointerMove={e => {
                    const p = imgPinchRef.current;
                    p.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
                    const pts = Object.values(p.pointers);
                    const img = imgZoomRef.current?.querySelector("img");
                    if (!img) return;
                    if (pts.length === 2) {
                      const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
                      const newDist = Math.sqrt(dx*dx + dy*dy);
                      p.scale = Math.min(Math.max(p.baseScale * (newDist / p.dist), 0.5), 5);
                    } else if (pts.length === 1 && p.scale > 1) {
                      p.tx = p.baseTx + (e.clientX - p.startX);
                      p.ty = p.baseTy + (e.clientY - p.startY);
                    }
                    img.style.transform = `scale(${p.scale}) translate(${p.tx/p.scale}px, ${p.ty/p.scale}px)`;
                  }}
                  onPointerUp={e => {
                    delete imgPinchRef.current.pointers[e.pointerId];
                    const pts = Object.values(imgPinchRef.current.pointers);
                    if (pts.length === 1) {
                      imgPinchRef.current.startX = pts[0].x;
                      imgPinchRef.current.startY = pts[0].y;
                      imgPinchRef.current.baseTx = imgPinchRef.current.tx;
                      imgPinchRef.current.baseTy = imgPinchRef.current.ty;
                    }
                  }}
                >
                  <img
                    src="/거래명세서.png"
                    alt="거래명세서 예시"
                    style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", transformOrigin: "center center", transition: "transform 0.05s", userSelect: "none", pointerEvents: "none" }}
                    onError={e => { e.target.style.display = "none"; }}
                  />
                </div>
              </div>
            )}

            {/* 업로드 영역 */}
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 4, height: 20, background: "#3b82f6", borderRadius: 2 }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: "#1B2B4B" }}>파일 선택</span>
              </div>

              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
                style={{
                  border: `2px dashed ${drag ? "#3b82f6" : "#cbd5e1"}`,
                  borderRadius: 12,
                  padding: "28px 16px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: drag ? "#eff6ff" : "#f8fafc",
                  transition: "all 0.2s",
                  marginBottom: 14,
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 8, color: "#94a3b8" }}>+</div>
                <div style={{ fontWeight: 700, color: "#1B2B4B", fontSize: 15, marginBottom: 4 }}>사진을 탭하여 선택하세요</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>JPG, PNG, PDF 지원 · 여러 장 동시 선택 가능</div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>

              {previews.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 8 }}>선택된 파일 ({previews.length}장)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {previews.map((p, i) => (
                      <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", aspectRatio: "1", background: "#f1f5f9" }}>
                        {p.type.startsWith("image/") ? (
                          <img src={p.src} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
                            <span style={{ fontSize: 22, fontWeight: 700, color: "#6b7280" }}>PDF</span>
                            <span style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>PDF</span>
                          </div>
                        )}
                        {uploading && progress[i] > 0 && progress[i] < 100 && (
                          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: "white", fontWeight: 700, fontSize: 16 }}>{progress[i]}%</span>
                          </div>
                        )}
                        {uploading && progress[i] === 100 && (
                          <div style={{ position: "absolute", inset: 0, background: "rgba(5,150,105,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: "white", fontSize: 24 }}>✓</span>
                          </div>
                        )}
                        {uploading && progress[i] === -1 && (
                          <div style={{ position: "absolute", inset: 0, background: "rgba(220,38,38,0.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: "white", fontSize: 20 }}>✕</span>
                            <span style={{ color: "white", fontSize: 11, fontWeight: 700, marginTop: 2 }}>실패</span>
                          </div>
                        )}
                        {!uploading && (
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                            style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "white", border: "none", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                          >×</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* 서명 카드 (마지막 단계) */}
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 4, height: 20, background: "#1B2B4B", borderRadius: 2 }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: "#1B2B4B" }}>서명</span>
                {signed && <span style={{ marginLeft: "auto", fontSize: 11, color: "#059669", fontWeight: 700 }}>서명 완료</span>}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
                아래 칸에 서명해주세요 (손가락으로 서명)
              </div>
              <canvas
                ref={sigRef}
                width={440}
                height={120}
                style={{ width: "100%", height: 120, border: "1.5px solid #cbd5e1", borderRadius: 10, background: "#f8fafc", touchAction: "none", display: "block", pointerEvents: signed ? "none" : "auto" }}
                onPointerDown={(e) => {
                  if (signed) return;
                  // 서명칸에 touchAction:"none"이 걸려 있는데, 포인터를 이 캔버스에
                  // 명시적으로 캡처해두지 않으면 손가락이 캔버스 경계를 살짝 벗어나는
                  // 순간 브라우저가 "스크롤해야 하나 그려야 하나" 판단을 못 해 그 제스처
                  // 전체가 멈춰버리는 기종이 있었다(일부 안드로이드/윈도우 터치 기기).
                  // 캡처해두면 손가락이 캔버스 밖으로 나가도 이벤트가 계속 이 캔버스로만
                  // 온다 — 서명 중 화면이 안 넘어가고 버벅이던 현상의 원인.
                  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                  setSigDrawing(true);
                  const rect = sigRef.current.getBoundingClientRect();
                  const ctx = sigRef.current.getContext("2d");
                  const scaleX = sigRef.current.width / rect.width;
                  const scaleY = sigRef.current.height / rect.height;
                  ctx.beginPath();
                  ctx.moveTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
                }}
                onPointerMove={(e) => {
                  if (!sigDrawing || signed) return;
                  const rect = sigRef.current.getBoundingClientRect();
                  const ctx = sigRef.current.getContext("2d");
                  const scaleX = sigRef.current.width / rect.width;
                  const scaleY = sigRef.current.height / rect.height;
                  ctx.lineWidth = 2.5;
                  ctx.strokeStyle = "#1B2B4B";
                  ctx.lineCap = "round";
                  ctx.lineTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
                  ctx.stroke();
                }}
                onPointerUp={(e) => {
                  try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
                  setSigDrawing(prevDrawing => {
                    if (prevDrawing) setSigned(true);
                    return false;
                  });
                }}
                onPointerLeave={(e) => {
                  // 포인터를 캡처한 상태라 대부분은 여기 도달하지 않고 onPointerUp으로
                  // 끝나지만, 캡처를 지원하지 않는 기종을 위한 안전장치로 남겨둔다.
                  try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
                  setSigDrawing(prevDrawing => {
                    if (prevDrawing) setSigned(true);
                    return false;
                  });
                }}
              />
              <button
                onClick={() => {
                  const ctx = sigRef.current.getContext("2d");
                  ctx.clearRect(0, 0, sigRef.current.width, sigRef.current.height);
                  setSigned(false);
                }}
                style={{ marginTop: 8, padding: "6px 14px", borderRadius: 7, border: "1px solid #e2e8f0", background: "white", color: "#6b7280", fontSize: 12, cursor: "pointer" }}
              >
                다시 서명
              </button>

              {files.length > 0 && (
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  style={{
                    width: "100%",
                    marginTop: 16,
                    padding: "14px",
                    borderRadius: 12,
                    border: "none",
                    background: uploading ? "#94a3b8" : "#1B2B4B",
                    color: "white",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: uploading ? "not-allowed" : "pointer",
                    fontFamily: "'Noto Sans KR', sans-serif",
                    transition: "background 0.2s",
                  }}
                >
                  {uploading ? `업로드 중...` : `${files.length}장 업로드하기`}
                </button>
              )}
            </div>
          </>
          )}
          </>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// 스타일 상수
// ────────────────────────────────────────
const cardStyle = {
  background: "white",
  borderRadius: 14,
  padding: "18px 16px",
  marginBottom: 14,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
};

const btnOutline = {
  padding: "10px 24px",
  borderRadius: 8,
  border: "1.5px solid #1B2B4B",
  background: "white",
  color: "#1B2B4B",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "'Noto Sans KR', sans-serif",
};

// ────────────────────────────────────────
// 서브 컴포넌트
// ────────────────────────────────────────
function InfoBox({ label, value }) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}
