// ======================= src/approvalFiles.js =======================
// 📎 2026-11-08 전자결재 첨부 파일(모든 양식) — 종류·크기 검사, 저장 경로(순수 함수, 화면·테스트 공용)
//  · 파일은 Firebase Storage approvals/{회사 키}/{문서 id}/{시각_파일명} 에 올리고, 문서에는 정보만 남긴다
//    approvals/{id}.files = [{ name, size, type, path, uploadedBy, uploadedByName, at }]
//  · 회사 키 = 회사명에서 / 공백 # ? [ ] 를 _로 바꾼 값(storage.rules와 같은 식)
//  · 받는 종류: 사진(PNG·JPG·GIF·WEBP·HEIC·BMP) · PDF · PPT/PPTX · XLS/XLSX · DOC/DOCX · HWP/HWPX · ZIP
//  · 한 파일 20MB 미만 · 한 문서 10개까지(storage.rules · firestore.rules와 같은 한도)
//  · 예전 문서의 사진 첨부(images: base64 data URL, 최대 3장)는 그대로 보이고 저장된다
//  ⚠ node 테스트(scripts/bizPlan.test.mjs)에서도 읽으므로 다른 파일을 가져오지 않는다.

export const AP_FILE_MAX = 20 * 1024 * 1024;
export const AP_FILE_COUNT = 10;
// 확장자 → 저장할 콘텐츠 종류(브라우저가 hwp·zip 종류를 비워 보내는 경우가 많아 확장자로 정한다)
export const AP_FILE_TYPES = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", heic: "image/heic", heif: "image/heif", bmp: "image/bmp",
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  hwp: "application/x-hwp", hwpx: "application/vnd.hancom.hwpx",
  zip: "application/zip",
};
export const AP_FILE_ACCEPT = Object.keys(AP_FILE_TYPES).map((e) => `.${e}`).join(",");
export const extOfName = (name) => { const m = /\.([a-z0-9]{1,6})$/i.exec(String(name || "")); return m ? m[1].toLowerCase() : ""; };

// 파일 종류 묶음(아이콘·미리보기)
export function fileKind(f) {
  const t = String(f?.type || "");
  const e = extOfName(f?.name);
  if (t.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "bmp"].includes(e)) return "image";
  if (t === "application/pdf" || e === "pdf") return "pdf";
  if (["ppt", "pptx"].includes(e)) return "ppt";
  if (["xls", "xlsx"].includes(e)) return "xls";
  if (["doc", "docx"].includes(e)) return "doc";
  if (["hwp", "hwpx"].includes(e)) return "hwp";
  if (e === "zip") return "zip";
  return "file";
}
export const KIND_LABEL = { image: "IMG", pdf: "PDF", ppt: "PPT", xls: "XLS", doc: "DOC", hwp: "HWP", zip: "ZIP", file: "FILE" };
// 브라우저 안에서 바로 볼 수 있는 종류(HEIC는 사파리만 보여 줘서 제외)
export const canPreview = (f) => { const k = fileKind(f); return k === "pdf" || (k === "image" && !["heic", "heif"].includes(extOfName(f?.name))); };

export const fmtSize = (n) => {
  const v = Number(n) || 0;
  if (v >= 1024 * 1024) return `${(v / 1024 / 1024).toFixed(v >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
  if (v >= 1024) return `${Math.round(v / 1024)}KB`;
  return `${v}B`;
};

// 올리기 전 검사 — { ok, type, error }
export function checkApFile(file, count = 0) {
  const name = String(file?.name || "");
  const ext = extOfName(name);
  const type = AP_FILE_TYPES[ext];
  if (count >= AP_FILE_COUNT) return { ok: false, error: `첨부는 한 문서에 ${AP_FILE_COUNT}개까지 올릴 수 있어요.` };
  if (!type) return { ok: false, error: `${name || "이 파일"}은 올릴 수 없는 종류예요. 사진·PDF·PPT·엑셀·워드·한글·ZIP 파일만 올려 주세요.` };
  if (!(Number(file?.size) > 0)) return { ok: false, error: `${name}은 빈 파일이에요.` };
  if (Number(file.size) >= AP_FILE_MAX) return { ok: false, error: `${name}은 ${fmtSize(file.size)}라 너무 커요. 한 파일에 20MB 미만으로 올려 주세요.` };
  return { ok: true, type };
}

export const apCoKey = (co) => String(co || "").trim().replace(/[/\s#?[\]]/g, "_"); // ⭐ 2026-11-09 앞뒤 공백 제거(storage.rules와 같게)
export const safeFileName = (name) => String(name || "file").replace(/[\\/:*?"<>|#[\]\s]+/g, "_").replace(/^\.+/, "").slice(-90) || "file";
export const apFileDir = (co, docId) => `approvals/${apCoKey(co)}/${docId}/`;
export const apFilePath = (co, docId, name, at = Date.now()) => `${apFileDir(co, docId)}${at}_${safeFileName(name)}`;
// 이 문서 폴더에 올린 파일인지(재기안해서 예전 문서 폴더를 가리키는 파일은 지우지 않는다)
export const inDocDir = (f, co, docId) => !!f?.path && String(f.path).startsWith(apFileDir(co, docId));
