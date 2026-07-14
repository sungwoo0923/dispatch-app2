import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import { searchAddressCoords } from "../utils/geocode";

// 배차 프로그램(FleetManagement.jsx)의 "출근지 설정" 팝업과 동일한 UX —
// 다음(카카오) 우편번호 팝업을 거치지 않고 주소를 바로 입력해 검색하면
// 좌표까지 한 번에 확인되고, 저장을 눌러야 실제로 반영된다.
export default function AddressGeocodeModal({ open, title, initialAddress, onSave, onClose }) {
  const [addr, setAddr] = useState(initialAddress || "");
  const [result, setResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setAddr(initialAddress || "");
      setResult(null);
      setError("");
    }
  }, [open, initialAddress]);

  const handleSearch = async () => {
    const kw = addr.trim();
    if (!kw) return;
    setSearching(true);
    setError("");
    setResult(null);
    try {
      const geo = await searchAddressCoords(kw);
      if (geo) setResult({ address: geo.address || kw, lat: geo.lat, lng: geo.lng, precise: geo.precise });
      else setError("주소를 찾을 수 없습니다. 도로명 또는 지번 주소를 입력해주세요.");
    } catch {
      setError("검색 중 오류가 발생했습니다.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title || "출근지 주소 설정"} zIndex={200}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="예: 인천 서구 오류동 1581-3"
            autoFocus
          />
          <Button type="button" size="sm" onClick={handleSearch} disabled={searching}>
            <Search size={13} /> {searching ? "검색 중..." : "검색"}
          </Button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {result && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <p className="text-sm font-semibold text-ink">{result.address}</p>
            <p className="mt-1 text-xs text-muted">
              {result.lat.toFixed(5)}, {result.lng.toFixed(5)}
            </p>
            {!result.precise && (
              <p className="mt-1.5 text-[11px] text-danger">
                건물번지까지 정확히 일치하지 않아 인근 지역 근사 좌표입니다. 실제 근무지에서 "현재 위치로 가져오기"로 다시 확인해주세요.
              </p>
            )}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button type="button" className="flex-1" disabled={!result} onClick={() => result && onSave(result)}>
            저장
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            취소
          </Button>
        </div>
      </div>
    </Modal>
  );
}
