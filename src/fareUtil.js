export const calcFare = (dispatchData, {pickup, drop, vehicle, ton, cargo}) => {

  const norm = (s = "") => String(s).trim().toLowerCase();
  const todayStr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const extractPalletNum = (text = "") => {
    const m = String(text).match(/(\d+)\s*(p|파렛|팔레트|pl)/i);
    if (m) return Number(m[1]);
    const m2 = String(text).match(/^(\d+)$/);
    return m2 ? Number(m2[1]) : null;
  };

  const extractLeadingNum = (text = "") => {
    const m = String(text).match(/^(\d+)/);
    return m ? Number(m[1]) : null;
  };

  const extractTonNum = (text = "") => {
    const m = String(text).replace(/톤|t/gi, "").match(/(\d+(\.\d+)?)/);
    return m ? Number(m[1]) : null;
  };

  const inputTonNum   = extractTonNum(ton);
  const inputPallet   = extractPalletNum(cargo);
  const inputCargoNum = extractLeadingNum(cargo);

  let filtered = (dispatchData || []).filter(r => {
    if ((r.상차일 || "").slice(0, 10) === todayStr) return false;
    if (!r.상차지명 || !r.하차지명) return false;

    const matchPickup =
      norm(r.상차지명).includes(norm(pickup)) ||
      norm(pickup).includes(norm(r.상차지명));

    const matchDrop =
      norm(r.하차지명).includes(norm(drop)) ||
      norm(drop).includes(norm(r.하차지명));

    if (!matchPickup || !matchDrop) return false;

    if (vehicle) {
      const ok =
        norm(r.차량종류 || "").includes(norm(vehicle)) ||
        norm(vehicle).includes(norm(r.차량종류 || ""));
      if (!ok) return false;
    }

    if (inputTonNum != null) {
      const rowTon = extractTonNum(r.차량톤수 || "");
      if (rowTon != null && Math.abs(rowTon - inputTonNum) > 0.5) return false;
    }

    const rowCargo = String(r.화물내용 || "");
    if (inputPallet != null) {
      const rowPallet = extractPalletNum(rowCargo) ?? extractLeadingNum(rowCargo);
      if (rowPallet != null && Math.abs(rowPallet - inputPallet) > 1) return false;
    }

    return true;
  });

  if (!filtered.length) {
    filtered = (dispatchData || []).filter(r => {
      if ((r.상차일 || "").slice(0, 10) === todayStr) return false;
      return (
        norm(r.상차지명).includes(norm(pickup)) &&
        norm(r.하차지명).includes(norm(drop))
      );
    });
  }

  if (!filtered.length) return null;

  const fares = filtered
    .map(r => Number(String(r.청구운임 || "0").replace(/,/g, "")))
    .filter(n => !isNaN(n));

  if (!fares.length) return null;

  const latestRow = filtered
    .slice()
    .sort((a, b) => (b.상차일 || "").localeCompare(a.상차일 || ""))[0];

  return {
    count: filtered.length,
    avg: Math.round(fares.reduce((a, b) => a + b, 0) / fares.length),
    min: Math.min(...fares),
    max: Math.max(...fares),
    latest: latestRow,
  };
};
