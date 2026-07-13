import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { MapPin, Plus, RefreshCw, FileSpreadsheet, ArrowUp, ArrowDown, Search, Trash2 } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import SidePanel from "../components/SidePanel";
import { downloadCsv } from "../utils/exportCsv";
import { openAddressSearch } from "../utils/daumPostcode";
import { searchAddressCoords } from "../utils/geocode";
import { TEAM_OPTIONS, POSITION_OPTIONS, SHIFT_TYPE_OPTIONS, SHIFT_WORK_TYPE_OPTIONS } from "../constants/hr";

const MAX_SITES = 10;

const TABS = [
  { key: "info", label: "센터정보" },
  { key: "vendors", label: "소속업체" },
  { key: "shift", label: "근무구분&형태" },
  { key: "deptpos", label: "부서&직급" },
  { key: "holidays", label: "지정외 휴일추가" },
];

const EMPTY_INFO = {
  businessEntityId: "",
  name: "",
  contractYN: "사용",
  faceYN: "사용",
  address: "",
  phone: "",
  memo: "",
  lat: "",
  lng: "",
  radiusM: 100,
};

export default function Centers() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [entities, setEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState("info");
  const [info, setInfo] = useState(EMPTY_INFO);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [locatingMe, setLocatingMe] = useState(false);

  // 주소 지오코딩은 도로명주소 DB의 정확도에 좌우돼, 신도시/분구 지역 등은
  // 건물 단위가 아니라 동 단위 근사 좌표로 떨어질 수 있다(수백~1000m 이상
  // 오차) — 관리자가 실제 근무지 현장에서 이 버튼을 누르면 기기의 실측
  // GPS 좌표를 그대로 위도/경도에 채워, 지오코딩 오차와 무관하게 정확한
  // 반경 기준점을 확보할 수 있다.
  const useCurrentLocationForCenter = () => {
    if (!navigator.geolocation) {
      toast.error("이 기기/브라우저에서는 위치 확인을 지원하지 않습니다.");
      return;
    }
    setLocatingMe(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setInfo((f) => ({ ...f, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        toast.success(`현재 위치로 좌표를 채웠습니다 (정확도 약 ${Math.round(pos.coords.accuracy)}m)`);
        setLocatingMe(false);
      },
      (err) => {
        toast.error(`위치를 가져오지 못했습니다: ${err.message}`);
        setLocatingMe(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  };

  // "내 회사 등록하기 > 센터 관리"와 동일한 다음(카카오) 우편번호 팝업으로
  // 정확한 실제 주소를 목록에서 골라 받고, 그 도로명주소를 그대로
  // 지오코딩해 위도/경도까지 한 번에 채운다 — 별도의 좌표 검색 팝업/직접
  // 타이핑 없이 주소검색 버튼 한 번으로 끝난다.
  const searchCenterAddress = async () => {
    const result = await openAddressSearch();
    if (!result) return;
    setInfo((f) => ({ ...f, address: result.address }));
    setSearchingAddress(true);
    try {
      const geo = await searchAddressCoords(result.address);
      if (geo) {
        setInfo((f) => ({ ...f, lat: geo.lat, lng: geo.lng }));
        if (!geo.precise) {
          toast.error("건물번지까지 정확히 일치하는 좌표를 찾지 못해 인근 지역 좌표로 채워졌습니다. 출근 반경이 좁다면(50~100m) 위도/경도를 직접 미세조정해주세요.");
        }
      } else {
        toast.error("좌표를 자동으로 찾지 못했습니다. 위도/경도를 직접 입력해주세요.");
      }
    } finally {
      setSearchingAddress(false);
    }
  };

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubEntities = onSnapshot(
      query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)),
      (snap) => setEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubSites = onSnapshot(
      query(collection(db, "workSites"), where("companyId", "==", profile.companyId)),
      (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubEntities();
      unsubSites();
    };
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";

  const rows = useMemo(
    () => workSites.filter((s) => !search || s.name?.includes(search)).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [workSites, search]
  );

  const selectedSite = workSites.find((s) => s.id === selectedId) || null;

  const startNew = () => {
    if (workSites.length >= MAX_SITES) {
      window.alert(`근무지는 최대 ${MAX_SITES}개까지 등록할 수 있습니다. 먼저 사용하지 않는 센터를 삭제해주세요.`);
      return;
    }
    setSelectedId(null);
    setInfo(EMPTY_INFO);
    setTab("info");
    setPanelOpen(true);
  };
  const tabIndex = TABS.findIndex((t) => t.key === tab);
  const goStep = (dir) => {
    const next = TABS[tabIndex + dir];
    if (next && (selectedId || next.key === "info")) setTab(next.key);
  };

  const closePanel = () => setPanelOpen(false);

  const removeSite = async () => {
    if (!selectedId) return;
    if (!(await confirm(`'${selectedSite?.name}' 센터를 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "workSites", selectedId));
    toast.success("삭제되었습니다");
    setSelectedId(null);
    setInfo(EMPTY_INFO);
    setTab("info");
    setPanelOpen(false);
  };

  const select = (s) => {
    setSelectedId(s.id);
    setInfo({
      businessEntityId: s.businessEntityId || "",
      name: s.name || "",
      contractYN: s.contractYN || "사용",
      faceYN: s.faceYN || "사용",
      address: s.address || "",
      phone: s.phone || "",
      memo: s.memo || "",
      lat: s.lat ?? "",
      lng: s.lng ?? "",
      radiusM: s.radiusM ?? 100,
    });
    setTab("info");
    setPanelOpen(true);
  };

  // 이전에는 저장 실패 시(필수값 누락, 권한/네트워크 오류 등) 화면에 아무
  // 표시도 없이 조용히 끝났다 — 그래서 "위도/경도를 수정하고 저장했는데
  // 다시 열어보니 안 바뀌어있다"는 증상이 실제로는 저장 자체가 실패한
  // 것인데도 사용자에게는 원인을 알 방법이 없었다. 모든 실패 경로에
  // 에러 토스트를 붙여, 실패하면 반드시 화면에 이유가 뜨게 한다.
  const saveInfo = async () => {
    if (!info.businessEntityId || !info.name.trim()) {
      toast.error("사업자와 센터 이름은 필수입니다");
      return;
    }
    if (!(await confirm("저장하시겠습니까?", "save"))) return;
    const payload = {
      ...info,
      lat: info.lat === "" ? null : parseFloat(info.lat),
      lng: info.lng === "" ? null : parseFloat(info.lng),
      radiusM: Number(info.radiusM) || 100,
    };
    try {
      if (selectedId) {
        await updateDoc(doc(db, "workSites", selectedId), payload);
      } else {
        const ref_ = await addDoc(collection(db, "workSites"), {
          companyId: profile.companyId,
          ...payload,
          createdAt: serverTimestamp(),
        });
        setSelectedId(ref_.id);
      }
      toast.success("저장되었습니다");
    } catch (err) {
      toast.error(`저장에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    }
  };

  const exportCsv = () => {
    const headers = ["사업자", "센터", "센터주소", "센터사용", "지정외 휴일", "얼굴촬영"];
    downloadCsv(
      "센터",
      headers,
      rows.map((s) => [entityName(s.businessEntityId), s.name, s.address || "-", "Y", s.contractYN === "사용" ? "Y" : "N", s.faceYN || "-"])
    );
  };

  return (
    <div className="space-y-6">
      <Panel icon={MapPin} title="센터">
        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">사업자</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" disabled>
                <option>전체</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="센터명을 입력하세요."
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50"
                title="새로고침"
                onClick={() => setSearch("")}
              >
                <RefreshCw size={16} />
              </button>
              <Button>검색</Button>
            </div>
          </div>
        </Card>

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="text-xs font-medium text-muted">
            목록 {rows.length} / 최대 {MAX_SITES}
            <span className="ml-2 text-[11px] text-muted">
              * 센터정보, 근무구분&형태, 부서&직급, 지정외 휴일추가 등을 수정할 수 있습니다.
            </span>
          </p>
          <div className="flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain">
            <Button size="sm" onClick={startNew}>
              <Plus size={13} /> 신규
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <FileSpreadsheet size={13} /> 엑셀
            </Button>
          </div>
        </div>
        <div className="mb-4 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
          <table className="w-full min-w-[640px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-2.5 font-semibold">순번</th>
                <th className="px-3 py-2.5 font-semibold">상세</th>
                <th className="px-3 py-2.5 font-semibold">사업자</th>
                <th className="px-3 py-2.5 font-semibold">센터</th>
                <th className="px-3 py-2.5 font-semibold">센터주소</th>
                <th className="px-3 py-2.5 font-semibold">센터사용</th>
                <th className="px-3 py-2.5 font-semibold">지정일외 휴일</th>
                <th className="px-3 py-2.5 font-semibold">얼굴촬영</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={s.id} className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50" onDoubleClick={() => select(s)}>
                  <td className="px-3 py-2.5 text-ink">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <button className="text-xs text-primary hover:underline" onClick={() => select(s)}>
                      상세
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-ink">{entityName(s.businessEntityId)}</td>
                  <td className="px-3 py-2.5 text-ink">{s.name}</td>
                  <td className="px-3 py-2.5 text-ink">{s.address || "-"}</td>
                  <td className="px-3 py-2.5 text-ink">Y</td>
                  <td className="px-3 py-2.5 text-ink">{s.contractYN === "사용" ? "Y" : "N"}</td>
                  <td className="px-3 py-2.5 text-ink">{s.faceYN || "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-xs text-muted">
                    등록된 센터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </Panel>

      <SidePanel
        open={panelOpen}
        onClose={closePanel}
        title="센터 > 상세"
        footer={
          <>
            {selectedId && (
              <Button variant="outline" onClick={removeSite}>
                삭제
              </Button>
            )}
            {tab === "info" && <Button onClick={saveInfo}>저장</Button>}
          </>
        }
      >
        <Card className="p-0">
          <div className="flex flex-col lg:flex-row">
            <div className="border-b border-slate-100 p-4 lg:w-48 lg:border-b-0 lg:border-r">
              <div className="mb-3 rounded-xl bg-primary-light/40 px-3 py-2 text-center text-sm font-semibold text-primary">
                {selectedSite ? selectedSite.name : "신규 센터"}
              </div>
              <div className="flex flex-row gap-1 overflow-x-auto overscroll-x-contain lg:flex-col">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    disabled={!selectedId && t.key !== "info"}
                    onClick={() => setTab(t.key)}
                    className={`shrink-0 rounded-lg px-3 py-2 text-center text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                      tab === t.key ? "bg-primary-light text-primary" : "text-muted hover:bg-slate-50"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 p-4">
              {tab === "info" && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-ink">센터정보</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
                      <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={info.businessEntityId}
                        onChange={(e) => setInfo((f) => ({ ...f, businessEntityId: e.target.value }))}
                      >
                        <option value="">선택</option>
                        {entities.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">센터 *</span>
                      <input
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={info.name}
                        onChange={(e) => setInfo((f) => ({ ...f, name: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="mb-1.5 block text-xs font-medium text-muted">근로계약서</span>
                      <div className="flex flex-nowrap gap-4 overflow-x-auto overscroll-x-contain text-sm">
                        {["사용", "미사용"].map((v) => (
                          <label key={v} className="flex items-center gap-1.5">
                            <input type="radio" checked={info.contractYN === v} onChange={() => setInfo((f) => ({ ...f, contractYN: v }))} />
                            {v}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="mb-1.5 block text-xs font-medium text-muted">얼굴촬영</span>
                      <div className="flex flex-nowrap gap-4 overflow-x-auto overscroll-x-contain text-sm">
                        {["사용", "미사용"].map((v) => (
                          <label key={v} className="flex items-center gap-1.5">
                            <input type="radio" checked={info.faceYN === v} onChange={() => setInfo((f) => ({ ...f, faceYN: v }))} />
                            {v}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">주소</span>
                      <div className="flex flex-nowrap gap-2">
                        <input
                          readOnly
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                          value={info.address}
                          placeholder="주소검색 버튼으로 입력하세요"
                        />
                        <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={searchCenterAddress} disabled={searchingAddress}>
                          <Search size={13} /> {searchingAddress ? "좌표 찾는 중..." : "주소검색"}
                        </Button>
                      </div>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">센터 전화번호</span>
                      <input
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={info.phone}
                        onChange={(e) => setInfo((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="02-000-0000"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">비고</span>
                      <input
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={info.memo}
                        onChange={(e) => setInfo((f) => ({ ...f, memo: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted">
                      주소 검색으로 채운 좌표는 주소 데이터베이스의 근사치일 수 있습니다. 실제 근무지에서 직접 눌러 정확한 좌표로 덮어쓸 수 있습니다.
                    </span>
                    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={useCurrentLocationForCenter} disabled={locatingMe}>
                      <MapPin size={13} /> {locatingMe ? "위치 확인 중..." : "현재 위치로 가져오기"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">위도(lat) *</span>
                      <input
                        type="number"
                        step="0.000001"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={info.lat}
                        onChange={(e) => setInfo((f) => ({ ...f, lat: e.target.value }))}
                        placeholder="예: 37.5665"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">경도(lng) *</span>
                      <input
                        type="number"
                        step="0.000001"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={info.lng}
                        onChange={(e) => setInfo((f) => ({ ...f, lng: e.target.value }))}
                        placeholder="예: 126.9780"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">출근인정반경(m)</span>
                      <input
                        type="number"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={info.radiusM}
                        onChange={(e) => setInfo((f) => ({ ...f, radiusM: e.target.value }))}
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-muted">
                    "주소검색"으로 주소를 검색하면 위도/경도가 자동으로 입력됩니다. 위도/경도가 설정되어 있어야 근로자 모바일
                    앱에서 반경 내 자동/수동 출근이 정상 동작합니다. 필요 시 아래 값을 직접 수정할 수도 있습니다.
                  </p>
                  <p className="text-[11px] text-muted">
                    센터 생성 시 근로계약서 / 테블릿 출퇴근 시 얼굴촬영 사용여부 선택하여 사용 관리 가능합니다. 센터정보 하단 세부정보 입력은 센터정보 저장 시
                    활성화 됩니다. 센터의 주소는 전자문서양식(계약서,사직서 등)의 근무장소로 연동됩니다.
                  </p>
                </div>
              )}
              {tab === "vendors" && selectedId && <VendorsTab companyId={profile.companyId} site={selectedSite} entityName={entityName} />}
              {tab === "shift" && selectedId && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <OrderedList companyId={profile.companyId} siteId={selectedId} collectionName="siteShiftCategories" title="근무구분 목록" fieldLabel="근무구분" presetOptions={SHIFT_TYPE_OPTIONS} />
                  <OrderedList companyId={profile.companyId} siteId={selectedId} collectionName="siteShiftTypes" title="근무형태 목록" fieldLabel="근무형태" presetOptions={SHIFT_WORK_TYPE_OPTIONS} />
                </div>
              )}
              {tab === "deptpos" && selectedId && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <OrderedList companyId={profile.companyId} siteId={selectedId} collectionName="siteDepartments" title="부서 목록" fieldLabel="부서" presetOptions={TEAM_OPTIONS} />
                  <OrderedList companyId={profile.companyId} siteId={selectedId} collectionName="sitePositions" title="직급 목록" fieldLabel="직급" presetOptions={POSITION_OPTIONS} />
                </div>
              )}
              {tab === "holidays" && selectedId && <HolidaysTab companyId={profile.companyId} siteId={selectedId} />}

              {selectedId && (
                <div className="mt-4 flex justify-between border-t border-slate-100 pt-3">
                  <Button size="sm" variant="outline" disabled={tabIndex === 0} onClick={() => goStep(-1)}>
                    이전단계
                  </Button>
                  <Button size="sm" variant="outline" disabled={tabIndex === TABS.length - 1} onClick={() => goStep(1)}>
                    다음단계
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      </SidePanel>
    </div>
  );
}

function VendorsTab({ companyId, site, entityName }) {
  const [allVendors, setAllVendors] = useState([]);
  const [links, setLinks] = useState([]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [checkedAvailable, setCheckedAvailable] = useState(() => new Set());
  const [checkedLinked, setCheckedLinked] = useState(() => new Set());

  useEffect(() => {
    if (!companyId) return;
    const unsubVendors = onSnapshot(query(collection(db, "vendors"), where("companyId", "==", companyId)), (snap) =>
      setAllVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubLinks = onSnapshot(
      query(collection(db, "siteVendors"), where("companyId", "==", companyId), where("siteId", "==", site.id)),
      (snap) => setLinks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubVendors();
      unsubLinks();
    };
  }, [companyId, site.id]);

  const linkedIds = new Set(links.map((l) => l.vendorId));
  const available = allVendors.filter((v) => !linkedIds.has(v.id) && (!vendorSearch || v.name?.includes(vendorSearch)));
  const linkedVendors = links.map((l) => ({ link: l, vendor: allVendors.find((v) => v.id === l.vendorId) })).filter((x) => x.vendor);

  const toggle = (set, setSet, id) =>
    setSet((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const register = async () => {
    for (const vendorId of checkedAvailable) {
      await setDoc(doc(db, "siteVendors", `${site.id}_${vendorId}`), {
        companyId,
        siteId: site.id,
        vendorId,
        createdAt: serverTimestamp(),
      });
    }
    setCheckedAvailable(new Set());
  };

  const unregister = async () => {
    for (const link of links.filter((l) => checkedLinked.has(l.vendorId))) {
      await deleteDoc(doc(db, "siteVendors", link.id));
    }
    setCheckedLinked(new Set());
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-ink">소속업체</p>
      <div>
        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <span className="text-xs font-medium text-muted">등록가능 소속업체</span>
        </div>
        <div className="mb-2 flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
          <input
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={vendorSearch}
            onChange={(e) => setVendorSearch(e.target.value)}
            placeholder="소속업체"
          />
          <Button size="sm" variant="outline">
            <Search size={13} /> 검색
          </Button>
        </div>
        <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-100">
          <table className="w-full text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="w-8 px-3 py-2"></th>
                <th className="px-3 py-2 font-semibold">사업자</th>
                <th className="px-3 py-2 font-semibold">소속업체</th>
              </tr>
            </thead>
            <tbody>
              {available.map((v) => (
                <tr key={v.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={checkedAvailable.has(v.id)} onChange={() => toggle(checkedAvailable, setCheckedAvailable, v.id)} />
                  </td>
                  <td className="px-3 py-2 text-ink">{entityName(v.businessEntityId)}</td>
                  <td className="px-3 py-2 text-ink">{v.name}</td>
                </tr>
              ))}
              {available.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-xs text-muted">
                    조회조건에 해당하는 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={register} disabled={checkedAvailable.size === 0}>
            등록
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <span className="text-xs font-medium text-muted">등록된 소속업체</span>
          <Button size="sm" variant="outline" onClick={unregister} disabled={checkedLinked.size === 0}>
            <Trash2 size={13} /> 삭제
          </Button>
        </div>
        <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-100">
          <table className="w-full text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="w-8 px-3 py-2"></th>
                <th className="px-3 py-2 font-semibold">사업자</th>
                <th className="px-3 py-2 font-semibold">소속업체</th>
              </tr>
            </thead>
            <tbody>
              {linkedVendors.map(({ link, vendor }) => (
                <tr key={link.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={checkedLinked.has(vendor.id)} onChange={() => toggle(checkedLinked, setCheckedLinked, vendor.id)} />
                  </td>
                  <td className="px-3 py-2 text-ink">{entityName(vendor.businessEntityId)}</td>
                  <td className="px-3 py-2 text-ink">{vendor.name}</td>
                </tr>
              ))}
              {linkedVendors.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-xs text-muted">
                    등록된 소속업체가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-muted">사업자에 연동된 소속업체를 센터와 매칭하여 연결해 줍니다.</p>
    </div>
  );
}

function OrderedList({ companyId, siteId, collectionName, title, fieldLabel, presetOptions = [] }) {
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState(presetOptions.length ? "preset" : "custom");
  const [preset, setPreset] = useState(presetOptions[0] || "");
  const [name, setName] = useState("");
  const [checked, setChecked] = useState(() => new Set());

  useEffect(() => {
    if (!companyId || !siteId) return;
    const unsub = onSnapshot(
      query(collection(db, collectionName), where("companyId", "==", companyId), where("siteId", "==", siteId)),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
    );
    return () => unsub();
  }, [companyId, siteId, collectionName]);

  const currentName = (mode === "preset" ? preset : name).trim();

  const add = async () => {
    if (!currentName) return;
    await addDoc(collection(db, collectionName), {
      companyId,
      siteId,
      name: currentName,
      order: items.length,
      active: true,
      createdAt: serverTimestamp(),
    });
    setName("");
  };

  const move = async (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[idx];
    const b = items[target];
    await updateDoc(doc(db, collectionName, a.id), { order: b.order ?? target });
    await updateDoc(doc(db, collectionName, b.id), { order: a.order ?? idx });
  };

  const toggleChecked = (id) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remove = async () => {
    for (const id of checked) await deleteDoc(doc(db, collectionName, id));
    setChecked(new Set());
  };

  return (
    <div>
      <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <div className="flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain">
          <Button size="sm" variant="outline" onClick={remove} disabled={checked.size === 0}>
            삭제
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
        <table className="w-full text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="w-8 px-2 py-2"></th>
              <th className="px-2 py-2 font-semibold">순번</th>
              <th className="px-2 py-2 font-semibold">{fieldLabel}</th>
              <th className="px-2 py-2 font-semibold">위로</th>
              <th className="px-2 py-2 font-semibold">아래로</th>
              <th className="px-2 py-2 font-semibold">사용여부</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className="border-b border-slate-50 last:border-0">
                <td className="px-2 py-2">
                  <input type="checkbox" checked={checked.has(it.id)} onChange={() => toggleChecked(it.id)} />
                </td>
                <td className="px-2 py-2 text-ink">{i + 1}</td>
                <td className="px-2 py-2 text-ink">{it.name}</td>
                <td className="px-2 py-2">
                  <button className="text-muted hover:text-primary" onClick={() => move(i, -1)}>
                    <ArrowUp size={13} />
                  </button>
                </td>
                <td className="px-2 py-2">
                  <button className="text-muted hover:text-primary" onClick={() => move(i, 1)}>
                    <ArrowDown size={13} />
                  </button>
                </td>
                <td className="px-2 py-2">
                  <button
                    className={`text-xs font-medium ${it.active ? "text-primary" : "text-muted"}`}
                    onClick={() => updateDoc(doc(db, collectionName, it.id), { active: !it.active })}
                  >
                    {it.active ? "사용" : "미사용"}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-xs text-muted">
                  등록된 항목이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 space-y-2">
        {presetOptions.length > 0 && (
          <div className="flex flex-nowrap gap-3 text-xs text-ink">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={mode === "preset"} onChange={() => setMode("preset")} /> 기본목록에서 선택
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} /> 직접입력
            </label>
          </div>
        )}
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
          {mode === "preset" && presetOptions.length > 0 ? (
            <select className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {presetOptions.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${fieldLabel} 직접 입력`}
            />
          )}
          <Button size="sm" onClick={add} disabled={!currentName}>
            저장
          </Button>
        </div>
      </div>
    </div>
  );
}

function HolidaysTab({ companyId, siteId }) {
  const [holidays, setHolidays] = useState([]);
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!companyId || !siteId) return;
    const unsub = onSnapshot(
      query(collection(db, "siteHolidays"), where("companyId", "==", companyId), where("siteId", "==", siteId)),
      (snap) => setHolidays(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.date || "").localeCompare(b.date || "")))
    );
    return () => unsub();
  }, [companyId, siteId]);

  const add = async () => {
    if (!date) return;
    await addDoc(collection(db, "siteHolidays"), { companyId, siteId, date, createdAt: serverTimestamp() });
    setDate("");
  };

  const remove = (id) => deleteDoc(doc(db, "siteHolidays", id));

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-ink">지정외 휴일 추가</p>
      <div className="mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
        <input type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
        <Button size="sm" onClick={add}>
          추가
        </Button>
      </div>
      <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
        <table className="w-full text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-3 py-2 font-semibold">No.</th>
              <th className="px-3 py-2 font-semibold">지정외 휴일</th>
              <th className="px-3 py-2 font-semibold">삭제</th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((h, i) => (
              <tr key={h.id} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2 text-ink">{i + 1}</td>
                <td className="px-3 py-2 text-ink">{h.date}</td>
                <td className="px-3 py-2">
                  <button className="text-muted hover:text-danger" onClick={() => remove(h.id)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {holidays.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-xs text-muted">
                  조회 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        저장된 '지정외 휴일'은 정산에 자동 반영됩니다. 정산에서 법정공휴일은 자동으로 설정되며, 법정공휴일 외 회사 내규 휴일이 있는 경우 추가하여 설정할 수
        있습니다.
      </p>
    </div>
  );
}
