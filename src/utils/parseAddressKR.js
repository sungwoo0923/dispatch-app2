// 대한민국 주소 자동 분해 (실무 안정 버전)
export function parseAddressKR(addr = "") {
  const result = {
    wide: "",
    sgg: "",
    dong: "",
    detail: "",
  };

  if (!addr) return result;

  const clean = addr.replace(/\s+/g, " ").trim();
  const tokens = clean.split(" ");

  // 시/도
  const wideIdx = tokens.findIndex(t =>
    /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/.test(t)
  );
  if (wideIdx >= 0) result.wide = tokens[wideIdx];

  // 시/군/구
  const sggIdx = tokens.findIndex(t => /(시|군|구)$/.test(t));
  if (sggIdx >= 0) result.sgg = tokens[sggIdx];

  // 읍/면/동/리
  const dongIdx = tokens.findIndex(t => /(읍|면|동|리)$/.test(t));
  if (dongIdx >= 0) result.dong = tokens[dongIdx];

  // 상세주소
  const lastIdx = Math.max(wideIdx, sggIdx, dongIdx);
  if (lastIdx >= 0 && tokens.length > lastIdx + 1) {
    result.detail = tokens.slice(lastIdx + 1).join(" ");
  }

  return result;
}
