// src/UploadPage.jsx
// ─────────────────────────────────────────────────────────────
// 공개 인수증 업로드 페이지 — 로그인 불필요, 링크만 있으면 접근 가능
// ?id=... 있으면 오더 기반 모드, 없으면 수동 입력 모드
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from "react";
import { db, DEFAULT_COMPANY } from "./firebase";
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
  const [status, setStatus]       = useState("loading"); // loading | ready | done | error | locked
  const [isManual, setIsManual]   = useState(false);
  const [confirmPopup, setConfirmPopup] = useState(false);

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
  const [bigSign, setBigSign] = useState(false); // 크게 서명하기(전체화면)
  const [signedAt, setSignedAt] = useState(null);
  const bigRef = useRef(null);
  const bigDrawRef = useRef({ drawing: false, drawn: false });
  const [showPaymentCalc, setShowPaymentCalc] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [imgZoomOpen, setImgZoomOpen] = useState(false);
  const [zoomSrc, setZoomSrc] = useState("/거래명세서.png");
  const openZoom = (src) => { imgPinchRef.current = { dist: null, scale: 1, baseScale: 1, tx: 0, ty: 0, baseTx: 0, baseTy: 0, pointers: {} }; setZoomSrc(src); setImgZoomOpen(true); };
  const imgZoomRef = useRef(null);
  const imgPinchRef = useRef({ dist: null, scale: 1, baseScale: 1, tx: 0, ty: 0, baseTx: 0, baseTy: 0, pointers: {} });

  // 결제일 계산 — 회사관리 › 회사정보에서 정한 "계산서 발행 후 N일"(companySettings/{회사}.결제일규칙.payDays).
  //   예전 규칙(평일 일수)만 있는 회사는 그 일수를 이어서 쓴다. 입금일이 주말이면 다음 월요일로 안내한다.
  const DAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
  const DEFAULT_PAYMENT_RULE = { payDays: 3 };
  const [paymentRule, setPaymentRule] = useState(DEFAULT_PAYMENT_RULE);
  const payDays = Math.max(0, Number(paymentRule?.payDays ?? paymentRule?.weekdayDays ?? 3) || 0);

  const calcPaymentDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return null;
    const rd = new Date(d);
    rd.setDate(rd.getDate() + payDays);
    if (rd.getDay() === 6) rd.setDate(rd.getDate() + 2);
    else if (rd.getDay() === 0) rd.setDate(rd.getDate() + 1);
    const y = rd.getFullYear(), m = String(rd.getMonth() + 1).padStart(2, "0"), dd = String(rd.getDate()).padStart(2, "0");
    return { result: `${y}-${m}-${dd} (${DAYS_KO[rd.getDay()]}요일)`, desc: `계산서 발행 → ${payDays}일 후 입금` };
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
    const token = params.get("t");

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
          const data = snap.data();
          // 링크에 토큰이 발급되어 있는 오더는, 그 링크에 담긴 토큰이 현재
          // 유효한 토큰과 일치할 때만 접근을 허용한다 — 업로드 완료 후 새 링크가
          // 발급되면 예전에 전달된 링크(구 토큰)는 영구적으로 막힌다.
          if (data.업로드토큰 && data.업로드토큰 !== token) {
            setStatus("locked");
            return;
          }
          // 운송사 담당자가 첨부파일 팝업에서 "재업로드 허용"을 누르면 이 만료시각이
          // 30분 뒤로 찍힌다 — 아직 지나지 않았으면 잠긴 상태라도 예전 링크를 그대로
          // 다시 쓸 수 있게 해준다(새 링크를 재발급/재전송할 필요 없음).
          const unlockExpiry = data.업로드잠금해제만료 ? new Date(data.업로드잠금해제만료).getTime() : 0;
          const tempUnlocked = unlockExpiry > Date.now();
          if (data.업로드잠금 && !tempUnlocked) {
            setStatus("locked");
            return;
          }
          setOrderId(id);
          setOrder({ _id: id, _col: snap.ref.parent.id, ...data });
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

  // 오더의 소속 회사(companyName)에 맞는 결제일 규칙을 불러온다 — 회사별로 설정이
  // 다를 수 있으므로 이 오더가 어느 회사 소속인지로 조회한다. 설정이 없으면 기본값 유지.
  useEffect(() => {
    if (!order) return;
    const cname = (order.companyName || DEFAULT_COMPANY).trim();
    (async () => {
      try {
        const snap = await getDoc(doc(db, "companySettings", cname));
        const saved = snap.exists() ? snap.data()?.결제일규칙 : null;
        if (saved) setPaymentRule(saved);
      } catch (e) {
        // 규칙 조회 실패시 기본값 그대로 사용
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.companyName]);

  // ── 실시간 위치 공유 (무료 GPS 기반 — 이 페이지가 화면에 켜져 있는 동안만 동작) ──
  // 브라우저 Geolocation API로 좌표를 받아 오더 문서(+화주사 전송사본)에 기록한다.
  // 화면이 꺼지거나 다른 앱으로 전환되면(특히 iOS Safari) 위치 전송이 멈추는
  // 플랫폼 제약이 있어, "이 화면을 보고 있는 동안의 대략적인 위치"용 기능이다.
  // 기사가 업로드 링크로 들어오면 별도 조작 없이 곧바로 위치 공유가 시작되도록 기본값 on
  const [sharingLoc, setSharingLoc] = useState(true);
  const [locError, setLocError] = useState(null);
  const [lastLoc, setLastLoc] = useState(null);
  const watchIdRef = useRef(null);
  const lastLocWriteRef = useRef(0);
  // 위치 공유는 기사가 동의 팝업에서 "승인"을 눌러야만 시작된다(null=아직 응답
  // 안 함, true=승인, false=거절). 거절하면 sharingLoc도 함께 꺼서 위치 공유가
  // 거절된 것으로 간주한다.
  const [locConsent, setLocConsent] = useState(null);

  useEffect(() => {
    if (!sharingLoc || !order || isManual || locConsent !== true) return;
    if (!navigator.geolocation) {
      setLocError("이 브라우저는 위치 공유를 지원하지 않습니다.");
      setSharingLoc(false);
      return;
    }
    const mirrorTarget = order._transmittedOrderId
      ? { col: "orders", id: order._transmittedOrderId }
      : (order.originCol && order.originId ? { col: order.originCol, id: order.originId } : null);

    // 위치공유 on/off는 오더 문서에 한 번만 기록한다(운송사 PC 표의 "공유중" 점 표시용) —
    // 실제로 계속 바뀌는 좌표는 아래에서 오더 문서와 완전히 분리된 liveLocations
    // 컬렉션에만 써서, 운송사 PC의 전체 오더 목록 리스너가 GPS 갱신을 아예 감지하지
    // 못하게 한다 — 그래야 위치공유가 켜져 있는 내내 PC가 절대 끊기지 않는다.
    updateDoc(doc(db, order._col, orderId), { 위치공유중: true }).catch(() => {});
    if (mirrorTarget) {
      updateDoc(doc(db, mirrorTarget.col, mirrorTarget.id), { 위치공유중: true }).catch(() => {});
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLastLoc({ lat, lng, at: Date.now() });
        setLocError(null);
        // GPS 콜백은 초 단위로 매우 자주 발생할 수 있어 8초 간격으로만 실제로
        // 서버에 반영한다(화면에 보여줄 좌표 자체는 그대로 갱신).
        const now = Date.now();
        if (now - lastLocWriteRef.current < 8000) return;
        lastLocWriteRef.current = now;
        const payload = { 위치: { lat, lng }, 위치갱신일시: serverTimestamp() };
        setDoc(doc(db, "liveLocations", orderId), payload, { merge: true }).catch(() => {});
        if (mirrorTarget) {
          setDoc(doc(db, "liveLocations", mirrorTarget.id), payload, { merge: true }).catch(() => {});
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
      updateDoc(doc(db, order._col, orderId), { 위치공유중: false }).catch(() => {});
      if (mirrorTarget) {
        updateDoc(doc(db, mirrorTarget.col, mirrorTarget.id), { 위치공유중: false }).catch(() => {});
      }
    };
  }, [sharingLoc, order, isManual, orderId, locConsent]);

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

  // 이미지 압축은 업로드 전 최적화일 뿐이라, 읽기/디코딩 중 어느 단계에서든 실패하면
  // (예: HEIC 등 일부 사진이 <img>로 디코딩되지 않는 경우) 원본 파일 그대로 진행해야 한다.
  // 예전에는 reader/img의 onerror가 아예 연결되어 있지 않아 실패 시 Promise가 영원히
  // 응답하지 않았고, 그 결과 handleUpload의 await가 멈춰버려 진행률이 92% 같은 어중간한
  // 값에서 그대로 멈춘 채 성공도 실패도 표시되지 않는 버그의 원인이었다.
  const compressImage = (file) => new Promise((resolve) => {
    if (file.type === "application/pdf") { resolve(file); return; }
    let settled = false;
    const done = (result) => { if (!settled) { settled = true; resolve(result); } };
    const safetyTimer = setTimeout(() => done(file), 8000);
    const reader = new FileReader();
    reader.onerror = () => { clearTimeout(safetyTimer); done(file); };
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => { clearTimeout(safetyTimer); done(file); };
      img.onload = () => {
        clearTimeout(safetyTimer);
        try {
          const MAX = 1200;
          let w = img.width, h = img.height;
          if (w > MAX || h > MAX) {
            if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
            else { w = Math.round(w * MAX / h); h = MAX; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => done(blob ? new File([blob], file.name, { type: "image/jpeg" }) : file), "image/jpeg", 0.75);
        } catch {
          done(file);
        }
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

      // 안내 팝업에서 "등록"을 눌러 업로드가 완료되면, 이 링크(토큰)로는 다시
      // 접속할 수 없도록 잠근다 — 재업로드가 필요하면 운송사가 새 링크를 발급하거나
      // 첨부파일 팝업의 "재업로드 허용"으로 임시로 다시 열어줘야 한다. 임시 해제로
      // 들어와서 재업로드를 마친 경우 그 해제창을 즉시 닫아 바로 재잠금되게 한다.
      // 이미 한 번 잠겨있던 상태(=재업로드 허용창을 통해 다시 들어온 경우)였다면,
      // 운송사 담당자가 첨부파일 팝업에서 "재업로드 완료"를 알 수 있게 알림 플래그도 남긴다.
      const isReupload = order?.업로드잠금 === true;
      try {
        const parentRef = doc(db, targetCol, targetId);
        const lockPatch = { 업로드잠금: true, 업로드잠금해제만료: null };
        if (isReupload) lockPatch.재업로드완료알림 = true;
        await updateDoc(parentRef, lockPatch);
        if (mirrorTarget) {
          await updateDoc(doc(db, mirrorTarget.col, mirrorTarget.id), lockPatch).catch(() => {});
        }
      } catch (e) { console.error("업로드 잠금 처리 실패:", e); }
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
  // 렌더 — 2026-10-28 디지털 리디자인(네이비 관제 스타일·단계 표시·하단 고정 버튼)
  // ────────────────────────────────────────────────────────
  const stepNo = status === "done" ? 3 : uploadStep;
  const pickupName = order?.상차지명 || "-";
  const dropName = order?.하차지명 || "-";
  return (
    <div className="kpu" style={{ fontFamily: "'Pretendard','Noto Sans KR',sans-serif", minHeight: "100vh", background: "#EEF2F8", overscrollBehaviorY: "contain", touchAction: "pan-y", color: "#0F1A30" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet" />
      <style>{UPLOAD_CSS}</style>

      {/* ── 헤더 + 단계 ── */}
      <div className="kpu-hero">
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "18px 18px 20px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, background: "linear-gradient(135deg,#2D4C82,#0B1428)", border: "1px solid rgba(207,224,255,.35)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 4px rgba(143,176,240,.08)" }}>
              <span style={{ color: "#fff", fontSize: 16, fontWeight: 900, letterSpacing: "-0.5px" }}>KP</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="kpu-mono" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.26em", color: "#8FB0F0" }}>KP-FLOW · DRIVER UPLOAD</div>
              <div style={{ color: "#fff", fontWeight: 900, fontSize: 19, letterSpacing: "-0.3px", marginTop: 2 }}>인수증 · 서류 업로드</div>
            </div>
            {!isManual && order && status === "ready" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px", borderRadius: 99, border: "1px solid rgba(143,176,240,.4)", background: "rgba(143,176,240,.12)", color: "#CFE0FF", fontSize: 11.5, fontWeight: 800 }}>
                <span className={sharingLoc ? "kpu-pulse" : ""} style={{ width: 7, height: 7, borderRadius: "50%", background: sharingLoc ? "#CFE0FF" : "#6B7FA6", boxShadow: sharingLoc ? "0 0 8px #8FB0F0" : "none" }} />
                {sharingLoc ? "GPS ON" : "GPS OFF"}
              </span>
            )}
          </div>
          {(status === "ready" || status === "done") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 18 }}>
              {[["01", "확인사항"], ["02", "사진 · 서명"], ["03", "전송 완료"]].map(([n, l], i) => {
                const on = stepNo === i + 1, done = stepNo > i + 1;
                return (
                  <div key={n}>
                    <div style={{ height: 4, borderRadius: 99, background: on || done ? "linear-gradient(90deg,#8FB0F0,#CFE0FF)" : "rgba(143,176,240,.18)", boxShadow: on ? "0 0 10px rgba(143,176,240,.7)" : "none" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
                      <span className="kpu-mono" style={{ fontSize: 11, fontWeight: 800, color: on || done ? "#CFE0FF" : "#6B7FA6" }}>{done ? "✓" : n}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: on ? "#fff" : done ? "#CFE0FF" : "#6B7FA6" }}>{l}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── 위치정보 제공 동의 팝업 — 승인해야만 위치 공유가 켜진다 ── */}
      {status === "ready" && !isManual && order && locConsent === null && (
        <div className="kpu-overlay" style={{ alignItems: "flex-end" }}>
          <div className="kpu-sheet">
            <div style={{ width: 54, height: 54, borderRadius: 18, margin: "4px auto 12px", background: "linear-gradient(135deg,#2D4C82,#1B2B4B)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 22px rgba(27,43,75,.3)" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
            </div>
            <div style={{ textAlign: "center", fontWeight: 900, fontSize: 19 }}>위치정보 제공 동의</div>
            <div style={{ textAlign: "center", fontSize: 13, color: "#64748b", marginTop: 4, fontWeight: 600 }}>상/하차 확인을 위한 안내입니다</div>
            <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 14, background: "#F4F7FC", border: "1px solid #E3E8F0", fontSize: 14.5, lineHeight: 1.7, color: "#1e293b", fontWeight: 500 }}>
              운송사에서 상/하차 여부를 확인하기 위하여 위치정보를 공유받을 수 있습니다.
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 8 }}>이 화면을 보고 계신 동안에만 위치가 전송되며, 화면을 벗어나거나 끄면 전송이 즉시 중단됩니다. 원치 않으시면 <b style={{ color: "#334155" }}>거절</b>을 눌러주세요.</div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="kpu-btn-ghost" style={{ flex: 1 }} onClick={() => { setLocConsent(false); setSharingLoc(false); }}>거절</button>
              <button className="kpu-btn" style={{ flex: 1.5 }} onClick={() => setLocConsent(true)}>승인하고 시작</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 520, margin: "-6px auto 0", padding: "0 14px 120px", position: "relative" }}>

        {/* ── 로딩 ── */}
        {status === "loading" && (
          <div className="kpu-card" style={{ textAlign: "center", padding: "46px 20px" }}>
            <div className="kpu-spin" style={{ width: 40, height: 40, margin: "0 auto 14px", borderRadius: "50%", border: "3px solid #DCE3EF", borderTopColor: "#1B2B4B" }} />
            <div style={{ fontWeight: 800, fontSize: 16 }}>배차 정보 불러오는 중…</div>
            <div className="kpu-mono" style={{ fontSize: 11, color: "#94A3B8", marginTop: 6, letterSpacing: "0.2em" }}>CONNECTING</div>
          </div>
        )}

        {/* ── 오류 / 잠김 ── */}
        {(status === "error" || status === "locked") && (
          <div className="kpu-card" style={{ textAlign: "center", padding: "40px 22px" }}>
            <div style={{ width: 60, height: 60, borderRadius: 20, margin: "0 auto 14px", background: "#F4F7FC", border: "1.5px solid #C9D3E4", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {status === "locked"
                ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1B2B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1B2B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" /><path d="M4 4l16 16" /></svg>}
            </div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{status === "locked" ? "이미 업로드가 완료된 링크입니다" : "링크가 올바르지 않습니다"}</div>
            <div style={{ color: "#64748b", fontSize: 14, marginTop: 8, lineHeight: 1.7 }}>
              {status === "locked"
                ? <>이 링크로는 다시 접속하거나 재업로드할 수 없습니다.<br />재업로드가 필요하면 배차 담당자에게 새 링크를 요청해주세요.</>
                : "배차 담당자에게 링크를 다시 요청해주세요."}
            </div>
          </div>
        )}

        {/* ── 업로드 완료 ── */}
        {status === "done" && (
          <div className="kpu-card" style={{ padding: "26px 18px 18px" }}>
            <div style={{ textAlign: "center" }}>
              <div className="kpu-pop" style={{ width: 76, height: 76, margin: "0 auto", borderRadius: "50%", background: "linear-gradient(135deg,#2D4C82,#1B2B4B)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 8px rgba(27,43,75,.08), 0 14px 30px rgba(27,43,75,.3)" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </div>
              <div className="kpu-mono" style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.26em", color: "#4B6CB7", marginTop: 16 }}>UPLOAD COMPLETE</div>
              <div style={{ fontWeight: 900, fontSize: 22, marginTop: 4 }}>전송이 완료되었습니다</div>
              <div style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}><b className="kpu-mono" style={{ color: "#1B2B4B" }}>{uploaded.length}</b>개 파일이 운송사에 전달되었습니다. 수고하셨습니다!</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "18px 0 6px" }}>
              {uploaded.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "#F4F7FC", border: "1px solid #E3E8F0", borderRadius: 14, padding: "10px 12px" }}>
                  {f.url && <img src={f.url} alt={f.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 10, border: "1px solid #DCE3EF", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                    <div style={{ fontSize: 12, color: "#4B6CB7", fontWeight: 800, marginTop: 2 }}>✓ 전송 완료</div>
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
                        } catch (e) { alert("삭제 실패: " + e.message); }
                      }}
                      style={{ height: 32, padding: "0 12px", borderRadius: 9, border: "1px solid #C9D3E4", background: "#fff", color: "#1B2B4B", fontSize: 12.5, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}
                    >삭제</button>
                  )}
                </div>
              ))}
            </div>
            {isManual && (
              <button className="kpu-btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => { setStatus("ready"); setUploaded([]); setUploadStep(2); }}>추가 업로드</button>
            )}
          </div>
        )}

        {/* ── 메인 업로드 ── */}
        {status === "ready" && (
          <>
          {uploadStep === 1 && (
          <>
            {/* 운송 티켓(오더 기반) */}
            {!isManual && order && (
              <div className="kpu-ticket">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span className="kpu-mono" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.22em", color: "#8FB0F0" }}>TRANSPORT TICKET</span>
                  <span className="kpu-mono" style={{ fontSize: 12.5, fontWeight: 800, color: "#0F1A30", background: "#CFE0FF", padding: "3px 9px", borderRadius: 8 }}>{order.상차일 || "-"}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10, marginTop: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: "#8FB0F0" }}>상차지</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginTop: 3, lineHeight: 1.25, wordBreak: "keep-all" }}>{pickupName}</div>
                    {order.상차시간 && <div className="kpu-mono" style={{ fontSize: 12, color: "rgba(207,224,255,.75)", marginTop: 3 }}>{order.상차시간}</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <svg width="34" height="18" viewBox="0 0 34 18"><path d="M1 9h28" stroke="#8FB0F0" strokeWidth="1.6" strokeDasharray="3 3" /><path d="M26 4l6 5-6 5" fill="none" stroke="#CFE0FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </div>
                  <div style={{ minWidth: 0, textAlign: "right" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: "#8FB0F0" }}>하차지</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginTop: 3, lineHeight: 1.25, wordBreak: "keep-all" }}>{dropName}</div>
                    {order.하차시간 && <div className="kpu-mono" style={{ fontSize: 12, color: "rgba(207,224,255,.75)", marginTop: 3 }}>{order.하차시간}</div>}
                  </div>
                </div>
                <div className="kpu-perf" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[["기사", order.이름 || "-"], ["차량번호", order.차량번호 || "-"], ["연락처", order.전화번호 ? <MaskedPhone value={order.전화번호} /> : "-"]].map(([k, v]) => (
                    <div key={k} style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#8FB0F0" }}>{k}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</div>
                    </div>
                  ))}
                </div>
                {(order.차량종류 || order.화물내용 || order.차량톤수) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                    {[order.차량톤수, order.차량종류, order.화물내용].filter(Boolean).map((t) => (
                      <span key={t} style={{ fontSize: 12, fontWeight: 800, color: "#CFE0FF", border: "1px solid rgba(143,176,240,.35)", background: "rgba(143,176,240,.1)", padding: "3px 9px", borderRadius: 8 }}>{t}</span>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 10, fontSize: 11.5, color: "rgba(207,224,255,.6)", fontWeight: 600 }}>* 서류는 상차일 기준으로 올려주세요</div>
              </div>
            )}

            {/* 실시간 위치 공유 */}
            {!isManual && order && (
              <div className="kpu-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, background: sharingLoc ? "linear-gradient(135deg,#2D4C82,#1B2B4B)" : "#F4F7FC", border: sharingLoc ? "none" : "1px solid #E3E8F0", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  {sharingLoc && <span className="kpu-ring" />}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={sharingLoc ? "#fff" : "#94A3B8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 900 }}>실시간 위치 공유 <span className="kpu-mono" style={{ fontSize: 11, color: sharingLoc ? "#4B6CB7" : "#94A3B8", marginLeft: 4 }}>{sharingLoc ? "LIVE" : "OFF"}</span></div>
                  <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 2, lineHeight: 1.5 }}>
                    {sharingLoc ? "상/하차 확인을 위해 위치를 공유하고 있습니다." : "켜면 운송사가 상/하차를 확인할 수 있습니다."}
                    {lastLoc && sharingLoc && <span className="kpu-mono" style={{ display: "block", fontSize: 11, color: "#94A3B8" }}>{lastLoc.lat.toFixed(4)}, {lastLoc.lng.toFixed(4)}</span>}
                  </div>
                  {locError && <div style={{ fontSize: 12, color: "#1B2B4B", fontWeight: 700, marginTop: 4 }}>⚠ {locError}</div>}
                </div>
                <button
                  onClick={() => setSharingLoc(v => {
                    const next = !v;
                    // 수동으로 다시 "켜기"를 누르는 것도 명시적 동의로 취급한다
                    if (next) setLocConsent(true);
                    return next;
                  })}
                  aria-label="위치 공유 켜기/끄기"
                  style={{ position: "relative", width: 52, height: 30, borderRadius: 99, border: "none", cursor: "pointer", flexShrink: 0, background: sharingLoc ? "#1B2B4B" : "#DCE3EF", transition: "background .2s" }}
                >
                  <span style={{ position: "absolute", top: 3, left: sharingLoc ? 25 : 3, width: 24, height: 24, borderRadius: "50%", background: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,.2)", transition: "left .2s" }} />
                </button>
              </div>
            )}

            {/* 수동 입력 */}
            {isManual && (
              <div className="kpu-card">
                <div className="kpu-head"><span className="kpu-dot" />배차 정보 입력<span className="kpu-mono kpu-code">MANUAL</span></div>
                {[
                  ["상차일", "date", manualDate, setManualDate, "", "* 상차일 기준으로 선택하세요"],
                  ["차량번호", "text", manualCar, setManualCar, "예: 12가 3456"],
                  ["기사명", "text", manualName, setManualName, "기사 이름을 입력하세요"],
                ].map(([label, type, val, set, ph, hint]) => (
                  <label key={label} style={{ display: "block", marginTop: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#334155" }}>{label}{hint && <span style={{ fontSize: 11.5, color: "#4B6CB7", marginLeft: 6 }}>{hint}</span>}</span>
                    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} className="kpu-input" />
                  </label>
                ))}
              </div>
            )}

            {/* 결제일 안내 */}
            <button className="kpu-card kpu-row" onClick={() => setShowPaymentCalc(true)}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: "#F4F7FC", border: "1px solid #E3E8F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B2B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              </span>
              <span style={{ flex: 1, textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 900, color: "#0F1A30" }}>결제일 안내</span>
                <span style={{ display: "block", fontSize: 12.5, color: "#64748b", marginTop: 1 }}>계산서 발행일로 입금 예정일을 확인하세요</span>
              </span>
              <span style={{ color: "#94A3B8", fontSize: 20, fontWeight: 700 }}>›</span>
            </button>

            {/* 확인사항 */}
            <div className="kpu-card">
              <div className="kpu-head">
                <span className="kpu-dot" />업로드 전 확인사항
                <span className="kpu-mono" style={{ marginLeft: "auto", fontSize: 13, fontWeight: 800, color: allChecked ? "#1B2B4B" : "#94A3B8" }}>{checks.filter(Boolean).length}/{checks.length}</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: "#EEF1F6", overflow: "hidden", margin: "4px 0 12px" }}>
                <div style={{ height: "100%", width: `${checks.length ? (checks.filter(Boolean).length / checks.length) * 100 : 0}%`, background: "linear-gradient(90deg,#4B6CB7,#1B2B4B)", transition: "width .25s" }} />
              </div>
              {checkItems.map((text, i) => (
                <div key={i} onClick={() => setChecks(prev => { const n = [...prev]; n[i] = !n[i]; return n; })}
                  className="kpu-check" style={{ background: checks[i] ? "linear-gradient(135deg,#1B2B4B,#2D4C82)" : "#F7F9FC", borderColor: checks[i] ? "#1B2B4B" : "#E3E8F0" }}>
                  <span style={{ width: 24, height: 24, borderRadius: 8, flexShrink: 0, background: checks[i] ? "#fff" : "#fff", border: `2px solid ${checks[i] ? "#fff" : "#C9D3E4"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {checks[i] && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B2B4B" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                  </span>
                  <span style={{ fontSize: 14.5, color: checks[i] ? "#fff" : "#1e293b", fontWeight: checks[i] ? 800 : 600, lineHeight: 1.45 }}>{text}</span>
                </div>
              ))}
              <div style={{ marginTop: 6, padding: "12px 14px", borderRadius: 12, background: "#EEF3FB", border: "1px solid #C9D3E4" }}>
                <div style={{ fontSize: 13.5, color: "#1B2B4B", fontWeight: 800, lineHeight: 1.6 }}>파렛트 전표나 거래명세서가 없다면 업로드하지 않으셔도 됩니다.</div>
                <div style={{ fontSize: 12.5, color: "#475569", fontWeight: 600, marginTop: 3 }}>위 항목을 모두 체크하면 다음 단계로 진행할 수 있습니다.</div>
              </div>
            </div>

            <div className="kpu-dock">
              <button className="kpu-btn" style={{ width: "100%", height: 54, fontSize: 16 }} disabled={!allChecked} onClick={() => allChecked && setUploadStep(2)}>
                {allChecked ? "다음 단계 — 사진 촬영" : `확인사항을 체크해주세요 (${checks.filter(Boolean).length}/${checks.length})`}
              </button>
            </div>
          </>
          )}

          {uploadStep === 2 && (
          <>
            <button onClick={() => setUploadStep(1)} style={{ background: "none", border: "none", color: "#475569", fontSize: 14, fontWeight: 800, cursor: "pointer", padding: "14px 2px 8px", display: "flex", alignItems: "center", gap: 4 }}>
              ‹ 확인사항으로 돌아가기
            </button>

            {/* 촬영 영역 */}
            <div className="kpu-card">
              <div className="kpu-head"><span className="kpu-dot" />서류 사진<span className="kpu-mono kpu-code">CAPTURE</span></div>
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
                className="kpu-drop"
                style={{ borderColor: drag ? "#1B2B4B" : "#9FB2D6", background: drag ? "#EEF3FB" : "linear-gradient(180deg,#F7F9FC,#EEF3FB)" }}
              >
                <span className="kpu-corner tl" /><span className="kpu-corner tr" /><span className="kpu-corner bl" /><span className="kpu-corner br" />
                <div style={{ width: 62, height: 62, borderRadius: 20, margin: "0 auto 12px", background: "linear-gradient(135deg,#2D4C82,#1B2B4B)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 22px rgba(27,43,75,.3)" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                </div>
                <div style={{ fontWeight: 900, fontSize: 17 }}>촬영하거나 사진을 선택하세요</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>JPG · PNG · PDF · 여러 장 한 번에 가능</div>
                <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
              </div>

              {previews.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: "#334155" }}>선택된 파일</span>
                    <span className="kpu-mono" style={{ fontSize: 14, fontWeight: 800, color: "#1B2B4B" }}>{previews.length}장</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {previews.map((p, i) => (
                      <div key={i} style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "1", background: "#EEF1F6", border: "1px solid #DCE3EF" }}>
                        {p.type.startsWith("image/") ? (
                          <img src={p.src} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><span className="kpu-mono" style={{ fontSize: 18, fontWeight: 800, color: "#1B2B4B" }}>PDF</span></div>
                        )}
                        <span className="kpu-mono" style={{ position: "absolute", left: 6, bottom: 6, fontSize: 10.5, fontWeight: 800, color: "#fff", background: "rgba(15,26,48,.75)", padding: "1px 6px", borderRadius: 6 }}>{String(i + 1).padStart(2, "0")}</span>
                        {uploading && progress[i] > 0 && progress[i] < 100 && (
                          <div style={{ position: "absolute", inset: 0, background: "rgba(15,26,48,.6)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            <span className="kpu-mono" style={{ color: "#fff", fontWeight: 800, fontSize: 17 }}>{progress[i]}%</span>
                            <span style={{ width: "70%", height: 4, borderRadius: 99, background: "rgba(255,255,255,.25)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${progress[i]}%`, background: "#CFE0FF" }} /></span>
                          </div>
                        )}
                        {uploading && progress[i] === 100 && (
                          <div style={{ position: "absolute", inset: 0, background: "rgba(27,43,75,.72)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                          </div>
                        )}
                        {uploading && progress[i] === -1 && (
                          <div style={{ position: "absolute", inset: 0, background: "rgba(15,26,48,.82)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: "#fff", fontSize: 20, fontWeight: 900 }}>!</span>
                            <span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>실패 · 다시 시도</span>
                          </div>
                        )}
                        {!uploading && (
                          <button onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                            style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 8, background: "rgba(15,26,48,.75)", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ⭐ 촬영 가이드(2026-10-28) — 예전엔 서류가 한 사진에 모두 들어간 예시라 "한 장에 다 찍어야 하나요?"
                  문의가 있었다. 서류마다 따로 잘라 "서류 1장 = 사진 1장"으로 보여준다. */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 900 }}>촬영 가이드</span>
                  <span className="kpu-mono" style={{ fontSize: 11.5, fontWeight: 800, color: "#fff", background: "#1B2B4B", padding: "3px 9px", borderRadius: 8 }}>서류 1장 = 사진 1장</span>
                </div>
                {/* 잘못된 예 / 올바른 예 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button onClick={() => openZoom("/guide/doc-all-wrong.jpg")} style={{ position: "relative", padding: 0, border: "1.5px solid #C9D3E4", borderRadius: 14, overflow: "hidden", background: "#fff", cursor: "zoom-in", textAlign: "left" }}>
                    <img src="/guide/doc-all-wrong.jpg" alt="잘못된 예" style={{ width: "100%", height: 88, objectFit: "cover", display: "block", filter: "grayscale(.6) brightness(.85)" }} />
                    <span style={{ position: "absolute", inset: 0, height: 88, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(15,26,48,.85)", color: "#fff", fontSize: 26, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</span>
                    </span>
                    <span style={{ display: "block", padding: "7px 10px", fontSize: 12.5, fontWeight: 800, color: "#64748b" }}>한 사진에 여러 장 ✕</span>
                  </button>
                  <div style={{ position: "relative", border: "1.5px solid #1B2B4B", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
                    <div style={{ height: 88, display: "grid", gridTemplateColumns: isCold ? "1.6fr 1fr 1fr" : "1.6fr 1fr", gridTemplateRows: "82px", gap: 3, padding: 3, background: "#EEF3FB", overflow: "hidden" }}>
                      <img src="/guide/doc-invoice.jpg" alt="" style={{ width: "100%", height: 82, objectFit: "cover", borderRadius: 6, display: "block" }} />
                      <img src="/guide/doc-pallet-1.jpg" alt="" style={{ width: "100%", height: 82, objectFit: "cover", objectPosition: "top", borderRadius: 6, display: "block" }} />
                      {isCold && <img src="/guide/doc-tacho.jpg" alt="" style={{ width: "100%", height: 82, objectFit: "cover", objectPosition: "top", borderRadius: 6, display: "block" }} />}
                    </div>
                    <span style={{ position: "absolute", right: 6, top: 6, width: 28, height: 28, borderRadius: "50%", background: "#1B2B4B", color: "#fff", fontSize: 15, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>○</span>
                    <span style={{ display: "block", padding: "7px 10px", fontSize: 12.5, fontWeight: 900, color: "#1B2B4B" }}>한 장씩 따로 찍기 ○</span>
                  </div>
                </div>
                {/* 서류별 카드(옆으로 넘기기) */}
                <div className="kpu-guide">
                  {[
                    { src: "/guide/doc-invoice.jpg", no: "01", title: "거래명세서", tag: "필수", tip: "종이 전체가 화면에 꽉 차게, 글씨가 읽히도록 1장" },
                    { src: "/guide/doc-pallet-1.jpg", no: "02", title: "파렛트 전표", tag: "서명 필수", tip: "싸인 받은 전표를 1장씩 (풀회사용)" },
                    { src: "/guide/doc-pallet-2.jpg", no: "03", title: "파렛트 전표", tag: "전표가 더 있으면", tip: "운송회사용 등 나머지 전표도 각각 1장씩" },
                    ...(isCold ? [{ src: "/guide/doc-tacho.jpg", no: "04", title: "타코메타 기록지", tag: "냉장·냉동", tip: "온도 기록지는 따로 1장" }] : []),
                  ].map((g) => (
                    <button key={g.no} onClick={() => openZoom(g.src)} className="kpu-guide-card">
                      <span style={{ position: "relative", display: "block", height: 150, background: "linear-gradient(180deg,#F4F7FC,#E3E8F0)", borderRadius: 12, overflow: "hidden" }}>
                        <img src={g.src} alt={g.title} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                        <span className="kpu-mono" style={{ position: "absolute", left: 8, top: 8, fontSize: 11, fontWeight: 800, color: "#fff", background: "rgba(15,26,48,.85)", padding: "2px 8px", borderRadius: 7 }}>사진 {g.no}</span>
                        <span style={{ position: "absolute", right: 8, bottom: 8, fontSize: 11, fontWeight: 800, color: "#1B2B4B", background: "rgba(255,255,255,.92)", padding: "2px 7px", borderRadius: 7, border: "1px solid #DCE3EF" }}>크게 보기</span>
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 900, color: "#0F1A30" }}>{g.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#1B2B4B", background: "#EEF3FB", border: "1px solid #C9D3E4", padding: "1px 7px", borderRadius: 6, whiteSpace: "nowrap" }}>{g.tag}</span>
                      </span>
                      <span style={{ display: "block", fontSize: 12.5, color: "#64748b", marginTop: 3, lineHeight: 1.45 }}>{g.tip}</span>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 6, textAlign: "center" }}>← 옆으로 넘겨서 서류별 예시를 확인하세요 →</div>
              </div>
            </div>

            {/* 서명 — 2026-10-28 고급 서명 패드(작은 칸 + 크게 서명하기 전체화면) */}
            <div className="kpu-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", background: "linear-gradient(120deg,#0F1A30,#1B2B4B 60%,#2D4C82)", color: "#fff" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17c3-1 4-6 6-6s1 5 3 5 3-4 5-4 2 2 4 2" /><path d="M3 21h18" /></svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 900 }}>서명</div>
                  <div className="kpu-mono" style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", color: "#8FB0F0" }}>SIGNATURE PAD</div>
                </div>
                {signed
                  ? <span style={{ fontSize: 12, fontWeight: 900, color: "#0F1A30", background: "#CFE0FF", padding: "4px 10px", borderRadius: 8 }}>✓ 서명 완료</span>
                  : <span style={{ fontSize: 12, fontWeight: 800, color: "#CFE0FF", border: "1px solid rgba(207,224,255,.4)", padding: "3px 9px", borderRadius: 8 }}>미서명</span>}
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 13.5, color: "#475569", marginBottom: 10, fontWeight: 600 }}>
                  {signed ? "서명이 저장되었습니다. 첫 번째 사진과 함께 전송됩니다." : "아래 칸에 손가락으로 서명하거나, ‘크게 서명하기’를 눌러 넓은 화면에서 서명하세요."}
                </div>
                <div style={{ position: "relative", borderRadius: 16, padding: 2, background: signed ? "linear-gradient(135deg,#1B2B4B,#4B6CB7)" : "repeating-linear-gradient(90deg,#9FB2D6 0 8px,transparent 8px 14px)" }}>
                  <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
                    <canvas
                      ref={sigRef}
                      width={440}
                      height={150}
                      style={{ width: "100%", height: 150, background: "linear-gradient(#fff 0 0) padding-box", touchAction: "none", display: "block", pointerEvents: signed ? "none" : "auto" }}
                      onPointerDown={(e) => {
                        if (signed) return;
                        // 포인터를 캔버스에 캡처 — 손가락이 경계를 벗어나도 서명이 끊기지 않게
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
                        ctx.lineWidth = 2.8;
                        ctx.strokeStyle = "#0F1A30";
                        ctx.lineCap = "round";
                        ctx.lineJoin = "round";
                        ctx.lineTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
                        ctx.stroke();
                      }}
                      onPointerUp={(e) => {
                        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
                        setSigDrawing(prevDrawing => { if (prevDrawing) { setSigned(true); setSignedAt(new Date()); } return false; });
                      }}
                      onPointerLeave={(e) => {
                        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
                        setSigDrawing(prevDrawing => { if (prevDrawing) { setSigned(true); setSignedAt(new Date()); } return false; });
                      }}
                    />
                    {/* 서명 기준선 */}
                    <div style={{ position: "absolute", left: 18, right: 18, bottom: 34, height: 0, borderTop: "1.5px dashed #C9D3E4", pointerEvents: "none" }} />
                    <span style={{ position: "absolute", left: 18, bottom: 38, fontSize: 18, fontWeight: 900, color: "#C9D3E4", pointerEvents: "none" }}>✕</span>
                    {!signed && <span className="kpu-mono" style={{ position: "absolute", right: 16, top: 12, fontSize: 10.5, color: "#A7B3C6", pointerEvents: "none", letterSpacing: "0.22em" }}>SIGN HERE</span>}
                  </div>
                </div>
                {signed && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12.5, fontWeight: 700, color: "#475569" }}>
                    <span>서명자 <b style={{ color: "#0F1A30" }}>{(!isManual && order?.이름) || manualName || "-"}</b></span>
                    <span className="kpu-mono">{signedAt ? `${signedAt.getFullYear()}.${String(signedAt.getMonth() + 1).padStart(2, "0")}.${String(signedAt.getDate()).padStart(2, "0")} ${String(signedAt.getHours()).padStart(2, "0")}:${String(signedAt.getMinutes()).padStart(2, "0")}` : ""}</span>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() => { const ctx = sigRef.current.getContext("2d"); ctx.clearRect(0, 0, sigRef.current.width, sigRef.current.height); setSigned(false); setSignedAt(null); }}
                    className="kpu-btn-ghost" style={{ flex: 1, height: 44, fontSize: 14 }}
                  >다시 서명</button>
                  <button onClick={() => { bigDrawRef.current = { drawing: false, drawn: false }; setBigSign(true); }} className="kpu-btn" style={{ flex: 1.3, height: 44, fontSize: 14 }}>
                    크게 서명하기
                  </button>
                </div>
              </div>
            </div>

            {/* 크게 서명하기 — 전체화면 서명 패드(가로로 돌리면 더 넓게) */}
            {bigSign && (
              <div style={{ position: "fixed", inset: 0, zIndex: 100000, display: "flex", flexDirection: "column", background: "linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(135deg,#0B1428,#1B2B4B 60%,#2D4C82)", padding: "14px 14px calc(14px + env(safe-area-inset-bottom))" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#fff", marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div className="kpu-mono" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.24em", color: "#8FB0F0" }}>FULL SCREEN SIGNATURE</div>
                    <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>넓은 칸에 서명해주세요</div>
                  </div>
                  <button onClick={() => setBigSign(false)} style={{ width: 40, height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 18, cursor: "pointer" }}>✕</button>
                </div>
                <div style={{ position: "relative", flex: 1, minHeight: 200, borderRadius: 20, background: "#fff", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,.35)" }}>
                  <canvas
                    ref={(el) => {
                      bigRef.current = el;
                      if (el && !el.dataset.sized) {
                        const r = el.getBoundingClientRect();
                        el.width = Math.max(300, Math.round(r.width * 2));
                        el.height = Math.max(200, Math.round(r.height * 2));
                        el.dataset.sized = "1";
                      }
                    }}
                    style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
                    onPointerDown={(e) => {
                      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                      const c = bigRef.current; const r = c.getBoundingClientRect(); const ctx = c.getContext("2d");
                      bigDrawRef.current.drawing = true;
                      ctx.beginPath();
                      ctx.moveTo((e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height));
                    }}
                    onPointerMove={(e) => {
                      if (!bigDrawRef.current.drawing) return;
                      const c = bigRef.current; const r = c.getBoundingClientRect(); const ctx = c.getContext("2d");
                      ctx.lineWidth = 6; ctx.strokeStyle = "#0F1A30"; ctx.lineCap = "round"; ctx.lineJoin = "round";
                                      const x = (e.clientX - r.left) * (c.width / r.width), y = (e.clientY - r.top) * (c.height / r.height);
                      ctx.lineTo(x, y);
                      ctx.stroke();
                      const B = bigDrawRef.current;
                      B.drawn = true;
                      B.box = B.box ? { x0: Math.min(B.box.x0, x), y0: Math.min(B.box.y0, y), x1: Math.max(B.box.x1, x), y1: Math.max(B.box.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
                    }}
                    onPointerUp={(e) => { try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {} bigDrawRef.current.drawing = false; }}
                    onPointerLeave={() => { bigDrawRef.current.drawing = false; }}
                  />
                  <div style={{ position: "absolute", left: 28, right: 28, bottom: "28%", borderTop: "2px dashed #C9D3E4", pointerEvents: "none" }} />
                  <span style={{ position: "absolute", left: 28, bottom: "calc(28% + 6px)", fontSize: 26, fontWeight: 900, color: "#C9D3E4", pointerEvents: "none" }}>✕</span>
                  <span className="kpu-mono" style={{ position: "absolute", right: 18, top: 14, fontSize: 11, color: "#A7B3C6", letterSpacing: "0.22em", pointerEvents: "none" }}>SIGN HERE</span>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button className="kpu-btn-ghost" style={{ flex: 1, background: "rgba(255,255,255,.1)", color: "#fff", borderColor: "rgba(255,255,255,.3)" }}
                    onClick={() => { const c = bigRef.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); bigDrawRef.current = { drawing: false, drawn: false }; }}>지우기</button>
                  <button className="kpu-btn" style={{ flex: 1.6, background: "#fff", color: "#0F1A30" }}
                    onClick={() => {
                      if (!bigDrawRef.current.drawn) { alert("서명을 해주세요."); return; }
                      // 실제로 그린 부분만 잘라 작은 서명칸(전송용)에 꽉 차게 옮겨 그린다
                      const src = bigRef.current, dst = sigRef.current;
                      const ctx = dst.getContext("2d");
                      ctx.clearRect(0, 0, dst.width, dst.height);
                      const bx = bigDrawRef.current.box || { x0: 0, y0: 0, x1: src.width, y1: src.height };
                      const pad = 14;
                      const sx = Math.max(0, bx.x0 - pad), sy = Math.max(0, bx.y0 - pad);
                      const sw = Math.min(src.width, bx.x1 + pad) - sx, sh = Math.min(src.height, bx.y1 + pad) - sy;
                      const k = Math.min((dst.width - 24) / sw, (dst.height - 20) / sh, 1);
                      const w = sw * k, h = sh * k;
                      ctx.drawImage(src, sx, sy, sw, sh, (dst.width - w) / 2, (dst.height - h) / 2, w, h);
                      setSigned(true); setSignedAt(new Date()); setBigSign(false);
                    }}>서명 완료</button>
                </div>
              </div>
            )}

            <div className="kpu-dock">
              <button className="kpu-btn" style={{ width: "100%", height: 54, fontSize: 16 }} disabled={!files.length || uploading} onClick={() => setConfirmPopup(true)}>
                {uploading ? "전송 중…" : files.length ? `${files.length}장 전송하기` : "사진을 먼저 선택해주세요"}
              </button>
            </div>
          </>
          )}
          </>
        )}

        {/* 결제일 안내 시트 */}
        {showPaymentCalc && (
          <div className="kpu-overlay" style={{ alignItems: "flex-end" }} onClick={() => setShowPaymentCalc(false)}>
            <div className="kpu-sheet" onClick={e => e.stopPropagation()}>
              <div style={{ width: 40, height: 4, background: "#DCE3EF", borderRadius: 2, margin: "0 auto 16px" }} />
              <div className="kpu-mono" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.24em", color: "#4B6CB7" }}>PAYMENT</div>
              <div style={{ fontWeight: 900, fontSize: 19, marginTop: 2 }}>결제일 안내</div>
              {(!isManual && order && (order.지급방식 === "선불" || order.지급방식 === "착불")) ? (
                // 선불/착불 오더는 상차지와 직접 정산 — 안내 + 상차지 담당자 연락처
                <div style={{ marginTop: 14, padding: "16px", borderRadius: 14, background: "#EEF3FB", border: "1px solid #C9D3E4" }}>
                  <div style={{ fontSize: 15, color: "#1B2B4B", fontWeight: 800, lineHeight: 1.7 }}>해당 오더는 <b>{order.지급방식}</b> 오더입니다.<br />상차지에 문의해주세요.</div>
                  {order.상차지담당자번호 ? (
                    <a href={`tel:${order.상차지담당자번호}`} className="kpu-btn" style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none", height: 50 }}>
                      상차지({order.상차지명 || "-"}) 전화하기 · {order.상차지담당자번호}
                    </a>
                  ) : (
                    <div style={{ marginTop: 10, fontSize: 13, color: "#64748b" }}>등록된 상차지 담당자 연락처가 없습니다. 배차 담당자에게 문의해주세요.</div>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>계산서 발행일을 고르면 입금 예정일을 알려드립니다.</div>
                  <label style={{ display: "block", marginTop: 14, fontSize: 13, fontWeight: 800, color: "#334155" }}>계산서 발행일
                    <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="kpu-input" />
                  </label>
                  {invoiceDate && (() => {
                    const calc = calcPaymentDate(invoiceDate);
                    if (!calc) return null;
                    return (
                      <div style={{ marginTop: 14, borderRadius: 16, padding: "16px 18px", color: "#fff", background: "linear-gradient(135deg,#0F1A30,#1B2B4B 60%,#2D4C82)" }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#8FB0F0" }}>{calc.desc}</div>
                        <div style={{ fontSize: 12.5, color: "rgba(207,224,255,.7)", marginTop: 8 }}>입금 예정일</div>
                        <div className="kpu-mono" style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>{calc.result}</div>
                      </div>
                    );
                  })()}
                  <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, background: "#F7F9FC", border: "1px solid #E3E8F0", fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
                    <b style={{ color: "#0F1A30" }}>입금 규칙</b> · 계산서 발행일로부터 {payDays}일 후 입금 (주말이면 다음 월요일)
                    <div style={{ fontSize: 12, color: "#94A3B8" }}>* 공휴일은 담당자에게 문의해 주세요.</div>
                  </div>
                </>
              )}
              <button className="kpu-btn-ghost" style={{ width: "100%", marginTop: 16 }} onClick={() => setShowPaymentCalc(false)}>닫기</button>
            </div>
          </div>
        )}

        {/* 거래명세서 확대 */}
        {imgZoomOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(11,20,40,0.94)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }} onClick={() => setImgZoomOpen(false)}>
            <button onClick={() => setImgZoomOpen(false)} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 12, width: 42, height: 42, color: "white", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>✕</button>
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
                  p.dist = Math.sqrt(dx * dx + dy * dy);
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
                  const newDist = Math.sqrt(dx * dx + dy * dy);
                  p.scale = Math.min(Math.max(p.baseScale * (newDist / p.dist), 0.5), 5);
                } else if (pts.length === 1 && p.scale > 1) {
                  p.tx = p.baseTx + (e.clientX - p.startX);
                  p.ty = p.baseTy + (e.clientY - p.startY);
                }
                img.style.transform = `scale(${p.scale}) translate(${p.tx / p.scale}px, ${p.ty / p.scale}px)`;
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
              <img src={zoomSrc} alt="촬영 예시" style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain", transformOrigin: "center center", transition: "transform 0.05s", userSelect: "none", pointerEvents: "none", borderRadius: 8 }} onError={e => { e.target.style.display = "none"; }} />
            </div>
          </div>
        )}

        {/* 전송 확인 */}
        {confirmPopup && (
          <div className="kpu-overlay" style={{ alignItems: "flex-end" }}>
            <div className="kpu-sheet">
              <div className="kpu-mono" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.24em", color: "#4B6CB7" }}>CONFIRM</div>
              <div style={{ fontWeight: 900, fontSize: 19, marginTop: 2 }}>전송 전 확인</div>
              <div style={{ marginTop: 12, padding: "14px 16px", borderRadius: 14, background: "#F4F7FC", border: "1px solid #E3E8F0" }}>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{!isManual && order ? (order.거래처명 || order.상차지명 || "이 오더") : (manualCar || "입력하신 정보")}</div>
                <div className="kpu-mono" style={{ fontSize: 12.5, color: "#64748b", marginTop: 2 }}>{!isManual && order?.상차일 ? order.상차일 : manualDate || ""}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", background: "#1B2B4B", padding: "4px 10px", borderRadius: 8 }}>사진 {files.length}장</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: signed ? "#1B2B4B" : "#94A3B8", border: `1px solid ${signed ? "#1B2B4B" : "#DCE3EF"}`, padding: "3px 10px", borderRadius: 8 }}>{signed ? "서명 포함" : "서명 없음"}</span>
                </div>
              </div>
              <div style={{ fontSize: 13.5, color: "#334155", lineHeight: 1.7, marginTop: 12 }}>
                전송하면 <b>이 링크로 다시 접속하거나 재업로드할 수 없습니다.</b> 사진을 한 번 더 확인해주세요.
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button className="kpu-btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmPopup(false)}>취소</button>
                <button className="kpu-btn" style={{ flex: 1.6 }} onClick={() => { setConfirmPopup(false); handleUpload(); }}>전송하기</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// 스타일(2026-10-28 디지털 리디자인)
// ────────────────────────────────────────
const UPLOAD_CSS = `
  .kpu * { box-sizing: border-box; }
  .kpu-mono { font-family: 'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace; }
  .kpu-hero {
    background:
      linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px,
      linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px,
      linear-gradient(135deg, #0B1428 0%, #1B2B4B 60%, #2D4C82 100%);
    border-radius: 0 0 26px 26px; box-shadow: 0 14px 30px rgba(11,20,40,.25); padding-bottom: 14px;
  }
  .kpu-card { display: block; width: 100%; background: #fff; border: 1px solid #E3E8F0; border-radius: 20px; padding: 16px; margin-top: 12px;
    box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 10px 24px rgba(16,24,40,.06); font-family: inherit; color: inherit; }
  .kpu-row { display: flex; align-items: center; gap: 12px; cursor: pointer; text-align: left; }
  .kpu-row:active, .kpu-check:active { transform: scale(.99); }
  .kpu-head { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 900; color: #0F1A30; margin-bottom: 6px; }
  .kpu-dot { width: 8px; height: 8px; border-radius: 2px; background: #1B2B4B; transform: rotate(45deg); }
  .kpu-code { margin-left: auto; font-size: 10.5px; font-weight: 800; letter-spacing: .2em; color: #94A3B8; }
  .kpu-ticket { position: relative; margin-top: 12px; border-radius: 22px; padding: 18px; color: #fff; overflow: hidden;
    background:
      radial-gradient(400px 160px at 100% 0%, rgba(110,149,232,.35), transparent 60%),
      linear-gradient(135deg, #0F1A30 0%, #1B2B4B 60%, #24396A 100%);
    box-shadow: 0 16px 34px rgba(15,26,48,.32); border: 1px solid #0B1428; }
  .kpu-perf { height: 1px; margin: 16px -18px 14px; background-image: linear-gradient(90deg, rgba(143,176,240,.45) 50%, transparent 50%); background-size: 10px 1px; position: relative; }
  .kpu-perf::before, .kpu-perf::after { content: ""; position: absolute; top: -9px; width: 18px; height: 18px; border-radius: 50%; background: #EEF2F8; }
  .kpu-perf::before { left: -9px; } .kpu-perf::after { right: -9px; }
  .kpu-guide { display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 10px 2px 4px; margin: 0 -2px; -webkit-overflow-scrolling: touch; }
  .kpu-guide::-webkit-scrollbar { display: none; }
  .kpu-guide-card { flex: 0 0 72%; scroll-snap-align: start; text-align: left; padding: 8px; border-radius: 16px; border: 1px solid #E3E8F0; background: #fff; cursor: zoom-in; font-family: inherit; box-shadow: 0 1px 2px rgba(16,24,40,.04); }
  .kpu-check { display: flex; align-items: center; gap: 12px; padding: 13px 14px; border-radius: 14px; margin-bottom: 8px; cursor: pointer; border: 1.5px solid; transition: all .15s; }
  .kpu-input { display: block; width: 100%; margin-top: 6px; height: 48px; padding: 0 14px; border-radius: 12px; border: 1.5px solid #DCE3EF; background: #F7F9FC; font-size: 15.5px; font-weight: 700; color: #0F1A30; font-family: inherit; outline: none; }
  .kpu-input:focus { border-color: #1B2B4B; background: #fff; box-shadow: 0 0 0 4px rgba(27,43,75,.08); }
  .kpu-drop { position: relative; border: 2px dashed; border-radius: 18px; padding: 26px 16px; text-align: center; cursor: pointer; transition: all .2s; margin-top: 8px; }
  .kpu-corner { position: absolute; width: 16px; height: 16px; border-color: #1B2B4B; border-style: solid; }
  .kpu-corner.tl { top: 10px; left: 10px; border-width: 2.5px 0 0 2.5px; border-radius: 4px 0 0 0; }
  .kpu-corner.tr { top: 10px; right: 10px; border-width: 2.5px 2.5px 0 0; border-radius: 0 4px 0 0; }
  .kpu-corner.bl { bottom: 10px; left: 10px; border-width: 0 0 2.5px 2.5px; border-radius: 0 0 0 4px; }
  .kpu-corner.br { bottom: 10px; right: 10px; border-width: 0 2.5px 2.5px 0; border-radius: 0 0 4px 0; }
  .kpu-btn { height: 50px; border: none; border-radius: 15px; background: linear-gradient(135deg, #1B2B4B, #2D4C82); color: #fff; font-size: 15px; font-weight: 900; cursor: pointer; font-family: inherit; box-shadow: 0 10px 22px rgba(27,43,75,.3); transition: filter .15s, opacity .15s; }
  .kpu-btn:disabled { background: #C9D3E4; box-shadow: none; cursor: not-allowed; color: #fff; }
  .kpu-btn:not(:disabled):active { filter: brightness(1.12); }
  .kpu-btn-ghost { height: 50px; border-radius: 15px; border: 1.5px solid #DCE3EF; background: #fff; color: #334155; font-size: 15px; font-weight: 800; cursor: pointer; font-family: inherit; }
  .kpu-dock { position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; padding: 12px 14px calc(12px + env(safe-area-inset-bottom)); background: linear-gradient(180deg, rgba(238,242,248,0), #EEF2F8 35%); }
  .kpu-dock > * { max-width: 492px; margin: 0 auto; display: block; }
  .kpu-overlay { position: fixed; inset: 0; background: rgba(11,20,40,.6); display: flex; justify-content: center; z-index: 10000; padding: 0; }
  .kpu-sheet { width: 100%; max-width: 520px; background: #fff; border-radius: 26px 26px 0 0; padding: 20px 18px calc(22px + env(safe-area-inset-bottom)); box-shadow: 0 -12px 40px rgba(0,0,0,.25); animation: kpuUp .28s cubic-bezier(.2,.9,.3,1.05) both; max-height: 92vh; overflow-y: auto; }
  @keyframes kpuUp { from { transform: translateY(40px); opacity: 0 } to { transform: none; opacity: 1 } }
  @keyframes kpuPulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
  .kpu-pulse { animation: kpuPulse 1.4s ease-in-out infinite; }
  @keyframes kpuRing { 0% { transform: scale(.8); opacity: .7 } 100% { transform: scale(1.6); opacity: 0 } }
  .kpu-ring { position: absolute; inset: 0; border-radius: 13px; border: 2px solid #4B6CB7; animation: kpuRing 1.6s ease-out infinite; }
  @keyframes kpuSpin { to { transform: rotate(360deg) } }
  .kpu-spin { animation: kpuSpin .9s linear infinite; }
  @keyframes kpuPop { 0% { transform: scale(.4); opacity: 0 } 70% { transform: scale(1.08) } 100% { transform: scale(1); opacity: 1 } }
  .kpu-pop { animation: kpuPop .5s cubic-bezier(.2,.9,.3,1.2) both; }
`;

// ────────────────────────────────────────
// 서브 컴포넌트
// ────────────────────────────────────────
function InfoBox({ label, value }) {
  return (
    <div style={{ borderBottom: "2px solid #e2e8f0", padding: "0 2px 8px" }}>
      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {/* lineHeight를 명시하지 않으면 숫자만 있는 값(전화번호 등)이 한글이 섞인 값보다
          글꼴 세로 정렬 기준이 달라 밑줄에서 붕 뜬 것처럼 위로 치우쳐 보였다 — 모든
          필드가 동일한 기준선을 갖도록 고정 line-height를 준다. */}
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", lineHeight: "20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

// 전화번호: 하이픈 포맷 + 뒷자리 블러 마스킹 (010-7763-**** 형태에서 마지막 그룹만
// CSS blur로 흐리게 처리 — 가운데 자리까지는 그대로 보이고 맨 뒷자리만 안 보이게)
function MaskedPhone({ value }) {
  const d = String(value || "").replace(/[^\d]/g, "");
  if (!d) return <>-</>;
  let parts;
  if (d.length === 11) parts = [d.slice(0, 3), d.slice(3, 7), d.slice(7, 11)];
  else if (d.length === 10) parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)];
  else return <>{value}</>;
  return (
    <span>
      {parts[0]}-{parts[1]}-
      <span style={{ filter: "blur(4px)", userSelect: "none" }}>{parts[2]}</span>
    </span>
  );
}
