// src/planner/PlannerImageCropper.jsx — 사진을 업로드하기 전에 위치/확대를 직접
// 맞춰볼 수 있는 간단한 크롭 도구. 얼굴이 잘리는 문제(자동 object-fit:cover만
// 쓰던 예전 방식) 때문에 추가했다 — 외부 라이브러리 없이 캔버스로 직접 그린다.
import React, { useEffect, useRef, useState } from "react";
import useBodyScrollLock from "./useBodyScrollLock";
import { ACCENT } from "./plannerTheme";

const FRAME_W = 300; // 화면에 보여주는 프레임 크기(타임라인 사진 비율 4:3에 맞춤)
const ASPECT = 4 / 3;
const FRAME_H = Math.round(FRAME_W / ASPECT);
const OUTPUT_W = 960; // 실제 저장(캔버스로 잘라내는) 해상도
const OUTPUT_H = Math.round(OUTPUT_W / ASPECT);

export default function PlannerImageCropper({ file, onCancel, onConfirm }) {
  useBodyScrollLock();
  const [imgURL] = useState(() => URL.createObjectURL(file));
  const [natural, setNatural] = useState(null); // { w, h }
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // 프레임 중심 기준 이동(px)
  const [saving, setSaving] = useState(false);
  const dragRef = useRef(null);

  useEffect(() => () => URL.revokeObjectURL(imgURL), [imgURL]);

  // zoom=1일 때 이미지가 프레임을 빈틈없이 채우도록(object-fit: cover와 동일한 배율).
  const baseScale = natural ? Math.max(FRAME_W / natural.w, FRAME_H / natural.h) : 1;
  const scale = baseScale * zoom;
  const dispW = natural ? natural.w * scale : 0;
  const dispH = natural ? natural.h * scale : 0;
  const maxOffX = Math.max(0, (dispW - FRAME_W) / 2);
  const maxOffY = Math.max(0, (dispH - FRAME_H) / 2);

  // 확대/축소하면 이동 가능 범위가 바뀌므로, 범위를 벗어난 오프셋을 다시 안으로 당겨온다.
  useEffect(() => {
    setOffset((o) => ({
      x: Math.min(maxOffX, Math.max(-maxOffX, o.x)),
      y: Math.min(maxOffY, Math.max(-maxOffY, o.y)),
    }));
  }, [maxOffX, maxOffY]);

  const onPointerDown = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, offX: offset.x, offY: offset.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({
      x: Math.min(maxOffX, Math.max(-maxOffX, dragRef.current.offX + dx)),
      y: Math.min(maxOffY, Math.max(-maxOffY, dragRef.current.offY + dy)),
    });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const confirm = async () => {
    if (!natural) return;
    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_W;
      canvas.height = OUTPUT_H;
      const ctx = canvas.getContext("2d");
      const ratio = OUTPUT_W / FRAME_W;
      const dw = dispW * ratio;
      const dh = dispH * ratio;
      const dx = (OUTPUT_W - dw) / 2 + offset.x * ratio;
      const dy = (OUTPUT_H - dh) / 2 + offset.y * ratio;
      const img = new Image();
      img.src = imgURL;
      if (!img.complete) await new Promise((res) => { img.onload = res; img.onerror = res; });
      ctx.drawImage(img, dx, dy, dw, dh);
      canvas.toBlob((blob) => {
        setSaving(false);
        if (blob) onConfirm(blob);
      }, "image/jpeg", 0.9);
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10040] flex flex-col items-center justify-center bg-black/75 p-4">
      <div className="text-white text-[12.5px] font-semibold mb-3">사진을 끌어서 위치를 맞추고, 필요하면 확대해 주세요</div>

      {!natural && (
        <>
          <img src={imgURL} alt="" className="hidden" onLoad={(e) => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })} />
          <div className="text-white text-[12.5px]">불러오는 중...</div>
        </>
      )}

      {natural && (
        <>
          <div
            className="relative overflow-hidden rounded-2xl touch-none select-none"
            style={{ width: FRAME_W, height: FRAME_H, background: "#111", cursor: "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img
              src={imgURL}
              alt=""
              draggable={false}
              style={{
                position: "absolute", left: "50%", top: "50%",
                width: dispW, height: dispH,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                pointerEvents: "none",
              }}
            />
          </div>

          <div className="flex items-center gap-3 mt-4 w-full" style={{ maxWidth: FRAME_W }}>
            <span className="text-white text-[11px] shrink-0">축소</span>
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1" />
            <span className="text-white text-[11px] shrink-0">확대</span>
          </div>

          <div className="flex gap-2 mt-5 w-full" style={{ maxWidth: FRAME_W }}>
            <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-white/15 text-white text-[13px] font-semibold">취소</button>
            <button onClick={confirm} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold disabled:opacity-60" style={{ background: ACCENT }}>
              {saving ? "저장 중..." : "이 위치로 저장"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
