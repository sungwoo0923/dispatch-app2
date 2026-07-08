import { useState } from "react";
import { Search } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import { searchAddressCoords } from "../utils/geocode";

// 배차 프로그램의 "출근지 설정" 팝업과 동일한 방식 — 주소를 검색하면 좌표까지
// 함께 확보되어, 관리자가 지도에서 직접 좌표를 찾아 입력할 필요가 없다.
export default function AddressSearchModal({ open, onClose, title = "출근지 설정", onApply }) {
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    const kw = keyword.trim();
    if (!kw) return;
    setSearching(true);
    setError("");
    setResult(null);
    const found = await searchAddressCoords(kw);
    if (found) setResult(found);
    else setError("주소를 찾을 수 없습니다. 도로명 또는 지번 주소를 입력하세요.");
    setSearching(false);
  };

  const apply = () => {
    if (!result) return;
    onApply(result);
    setKeyword("");
    setResult(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={apply} disabled={!result}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-nowrap gap-2">
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="예: 인천시 서구 당하동 완정로8번길"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button type="button" size="sm" className="shrink-0" onClick={handleSearch} disabled={searching}>
            <Search size={13} /> {searching ? "..." : "검색"}
          </Button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {result && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
            <p className="text-sm font-semibold text-ink">{result.address}</p>
            <p className="mt-1 text-xs text-muted">
              {result.lat.toFixed(5)}, {result.lng.toFixed(5)}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
