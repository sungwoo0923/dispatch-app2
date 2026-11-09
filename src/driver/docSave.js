// ======================= src/driver/docSave.js =======================
// ⭐ 2026-11-10 기사앱 서류 저장 — 기기마다 되는 방법이 달라 순서대로 시도한다.
//  1) 안드로이드 기사앱(APK): 네이티브 KpSave 플러그인 → 휴대폰 "다운로드/LogisWeb" 폴더 저장 + 공유 창
//     (웹화면 WebView는 a[download] 파일 내려받기가 동작하지 않는다)
//  2) 아이폰 홈 화면 앱·모바일 브라우저: 공유 시트(navigator.share files) — "파일에 저장"·"이미지 저장"·카톡 보내기
//  3) PC 브라우저 등: 바로 내려받기(a[download])
import { registerPlugin } from "@capacitor/core";

const KpSave = registerPlugin("KpSave");
const isNative = () => typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();

const blobToBase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result || "").split(",")[1] || "");
  r.onerror = () => rej(r.error || new Error("파일을 읽지 못했어요"));
  r.readAsDataURL(blob);
});

export async function toBlob(src) {
  if (src instanceof Blob) return src;
  const s = String(src || "");
  if (s.startsWith("data:")) {
    const [head, body] = s.split(",");
    const mime = /data:([^;,]+)/.exec(head)?.[1] || "application/octet-stream";
    const bin = /;base64/.test(head) ? atob(body) : decodeURIComponent(body);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }
  const r = await fetch(s);
  if (!r.ok) throw new Error(`파일을 받지 못했어요 (${r.status})`);
  return r.blob();
}

const extOf = (mime) => ({ "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/heic": "heic" }[mime] || "");
export const safeName = (name) => String(name || "서류").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 80);

// 저장 — 결과 문구를 돌려준다(화면에 안내용)
export async function saveDocFile(src, name = "서류") {
  const blob = await toBlob(src);
  const mime = blob.type || "application/octet-stream";
  let file = safeName(name);
  const ext = extOf(mime);
  if (ext && !new RegExp(`\\.${ext}$`, "i").test(file)) file = `${file}.${ext}`;

  if (isNative()) {
    try {
      const r = await KpSave.save({ data: await blobToBase64(blob), name: file, mime, share: true });
      return r?.downloaded ? "휴대폰 '다운로드/LogisWeb' 폴더에 저장했어요" : "공유 창에서 저장할 곳을 골라 주세요";
    } catch (e) {
      // 예전 기사앱(저장 기능 없는 버전) — 새 기사앱으로 다시 설치해야 저장된다
      if (/not implemented|UNIMPLEMENTED|not available/i.test(String(e?.message || e?.code || e))) {
        throw new Error("이 기사앱 버전은 저장 기능이 없어요. 새 기사앱으로 다시 설치하면 저장할 수 있어요.");
      }
      throw e;
    }
  }
  // 휴대폰만 공유 시트(PC는 바로 내려받기 — 윈도우 크롬은 공유 창이 떠서 오히려 불편)
  const phone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "") || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform || ""));
  try {
    const f = new File([blob], file, { type: mime });
    if (phone && navigator.canShare?.({ files: [f] })) {
      await navigator.share({ files: [f], title: file });
      return "공유 창에서 저장할 곳을 골라 주세요";
    }
  } catch (e) {
    if (e?.name === "AbortError") return "";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = file; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
  return "내려받았어요";
}

// 화면 요소(계약서·명세서) → PDF 저장
export async function saveElementPdf(el, name = "서류") {
  if (!el) throw new Error("저장할 화면을 찾지 못했어요");
  const { pdfBlobOf } = await import("../a4Export");
  const blob = await pdfBlobOf(el);
  return saveDocFile(new Blob([blob], { type: "application/pdf" }), `${safeName(name)}.pdf`);
}
