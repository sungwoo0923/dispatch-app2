import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Search, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { openAddressSearch } from "../utils/daumPostcode";
import { searchAddressCoords } from "../utils/geocode";

const MAX_SITES = 10;
const TABS = [
  { key: "info", label: "센터정보" },
  { key: "vendors", label: "소속업체" },
  { key: "shift", label: "근무구분&형태" },
  { key: "deptpos", label: "부서&직급" },
  { key: "holidays", label: "지정외휴일" },
];
const EMPTY_INFO = { businessEntityId: "", name: "", contractYN: "사용", faceYN: "사용", address: "", memo: "", lat: "", lng: "", radiusM: 100 };

function VendorsTabMobile({ companyId, site, entityName }) {
  const [allVendors, setAllVendors] = useState([]);
  const [links, setLinks] = useState([]);

  useEffect(() => {
    if (!companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", companyId)), (s) => setAllVendors(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "siteVendors"), where("companyId", "==", companyId), where("siteId", "==", site.id)), (s) => setLinks(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [companyId, site.id]);

  const linkedIds = new Set(links.map((l) => l.vendorId));
  const toggleLink = async (vendorId) => {
    if (linkedIds.has(vendorId)) {
      const link = links.find((l) => l.vendorId === vendorId);
      if (link) await deleteDoc(doc(db, "siteVendors", link.id));
    } else {
      await setDoc(doc(db, "siteVendors", `${site.id}_${vendorId}`), { companyId, siteId: site.id, vendorId, createdAt: serverTimestamp() });
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">체크하면 이 센터에 소속업체가 연결됩니다.</p>
      {allVendors.length === 0 && <p className="py-4 text-center text-xs text-muted">등록된 소속업체가 없습니다.</p>}
      {allVendors.map((v) => (
        <label key={v.id} className={`flex items-center gap-2.5 rounded-xl border p-3 text-sm ${linkedIds.has(v.id) ? "border-primary bg-primary-light/40" : "border-slate-200"}`}>
          <input type="checkbox" checked={linkedIds.has(v.id)} onChange={() => toggleLink(v.id)} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{v.name}</p>
            <p className="truncate text-xs text-muted">{entityName(v.businessEntityId)}</p>
          </div>
        </label>
      ))}
    </div>
  );
}

function OrderedListMobile({ companyId, siteId, collectionName, fieldLabel }) {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!companyId || !siteId) return;
    const unsub = onSnapshot(query(collection(db, collectionName), where("companyId", "==", companyId), where("siteId", "==", siteId)), (s) =>
      setItems(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
    );
    return () => unsub();
  }, [companyId, siteId, collectionName]);

  const add = async () => {
    if (!name.trim()) return;
    await addDoc(collection(db, collectionName), { companyId, siteId, name: name.trim(), order: items.length, active: true, createdAt: serverTimestamp() });
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
  const remove = async (id) => deleteDoc(doc(db, collectionName, id));

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <input className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder={fieldLabel} />
        <Button size="sm" onClick={add}>추가</Button>
      </div>
      {items.length === 0 && <p className="py-2 text-center text-xs text-muted">등록된 항목이 없습니다.</p>}
      {items.map((it, i) => (
        <div key={it.id} className="flex items-center gap-1.5 rounded-lg border border-slate-100 px-2.5 py-2">
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{it.name}</span>
          <button type="button" onClick={() => updateDoc(doc(db, collectionName, it.id), { active: !it.active })} className={`shrink-0 text-[11px] font-medium ${it.active ? "text-primary" : "text-muted"}`}>
            {it.active ? "사용" : "미사용"}
          </button>
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="shrink-0 p-1 text-muted disabled:opacity-30"><ArrowUp size={13} /></button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="shrink-0 p-1 text-muted disabled:opacity-30"><ArrowDown size={13} /></button>
          <button type="button" onClick={() => remove(it.id)} className="shrink-0 p-1 text-muted hover:text-danger"><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function HolidaysTabMobile({ companyId, siteId }) {
  const [holidays, setHolidays] = useState([]);
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!companyId || !siteId) return;
    const unsub = onSnapshot(query(collection(db, "siteHolidays"), where("companyId", "==", companyId), where("siteId", "==", siteId)), (s) =>
      setHolidays(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.date || "").localeCompare(b.date || "")))
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
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <input type="date" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
        <Button size="sm" onClick={add}>추가</Button>
      </div>
      {holidays.length === 0 && <p className="py-2 text-center text-xs text-muted">등록된 지정외휴일이 없습니다.</p>}
      {holidays.map((h) => (
        <div key={h.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
          <span className="text-ink">{h.date}</span>
          <button type="button" onClick={() => remove(h.id)} className="text-muted hover:text-danger"><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  );
}

// 센터의 모바일 전용 화면 — 카드 목록 + 탭 바텀시트(센터정보/소속업체/
// 근무구분&형태/부서&직급/지정외휴일). 주소검색은 데스크톱과 동일한
// 다음(카카오) 우편번호 팝업을 그대로 사용한다.
export default function AdminMobileCenters() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [entities, setEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [search, setSearch] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("info");
  const [info, setInfo] = useState(EMPTY_INFO);
  const [searchingAddress, setSearchingAddress] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (s) => setEntities(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";
  const rows = useMemo(() => workSites.filter((s) => !search.trim() || s.name?.includes(search.trim())).sort((a, b) => (a.name || "").localeCompare(b.name || "")), [workSites, search]);
  const selectedSite = workSites.find((s) => s.id === selectedId) || null;

  const searchCenterAddress = async () => {
    const result = await openAddressSearch();
    if (!result) return;
    setInfo((f) => ({ ...f, address: result.address }));
    setSearchingAddress(true);
    try {
      const geo = await searchAddressCoords(result.address);
      if (geo) setInfo((f) => ({ ...f, lat: geo.lat, lng: geo.lng }));
      else toast.error("좌표를 자동으로 찾지 못했습니다. 위도/경도를 직접 입력해주세요.");
    } finally {
      setSearchingAddress(false);
    }
  };

  const startNew = () => {
    if (workSites.length >= MAX_SITES) {
      toast.error(`근무지는 최대 ${MAX_SITES}개까지 등록할 수 있습니다.`);
      return;
    }
    setSelectedId(null);
    setInfo(EMPTY_INFO);
    setTab("info");
    setDetailOpen(true);
  };

  const select = (s) => {
    setSelectedId(s.id);
    setInfo({ businessEntityId: s.businessEntityId || "", name: s.name || "", contractYN: s.contractYN || "사용", faceYN: s.faceYN || "사용", address: s.address || "", memo: s.memo || "", lat: s.lat ?? "", lng: s.lng ?? "", radiusM: s.radiusM ?? 100 });
    setTab("info");
    setDetailOpen(true);
  };

  const saveInfo = async () => {
    if (!info.businessEntityId || !info.name.trim()) return toast.error("사업자와 센터명을 입력해주세요.");
    const payload = { ...info, lat: info.lat === "" ? null : parseFloat(info.lat), lng: info.lng === "" ? null : parseFloat(info.lng), radiusM: Number(info.radiusM) || 100 };
    if (selectedId) {
      await updateDoc(doc(db, "workSites", selectedId), payload);
    } else {
      const ref_ = await addDoc(collection(db, "workSites"), { companyId: profile.companyId, ...payload, createdAt: serverTimestamp() });
      setSelectedId(ref_.id);
    }
    toast.success("저장되었습니다");
  };

  const removeSite = async () => {
    if (!selectedId) return;
    if (!(await confirm(`'${selectedSite?.name}' 센터를 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "workSites", selectedId));
    toast.success("삭제되었습니다");
    setDetailOpen(false);
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">센터 ({rows.length}/{MAX_SITES})</p>
        <Button size="sm" onClick={startNew}>
          <Plus size={13} /> 등록
        </Button>
      </div>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="센터명 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">등록된 센터가 없습니다.</div>}
        {rows.map((s) => (
          <button key={s.id} type="button" onClick={() => select(s)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink">{s.name}</span>
                <Badge tone={s.contractYN === "사용" ? "success" : "muted"}>{s.contractYN === "사용" ? "계약서 Y" : "계약서 N"}</Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">{entityName(s.businessEntityId)} · {s.address || "주소 미등록"}</p>
            </div>
          </button>
        ))}
      </div>

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={selectedSite ? selectedSite.name : "신규 센터"}>
        <div className="space-y-4">
          <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={!selectedId && t.key !== "info"}
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-30 ${tab === t.key ? "bg-primary text-white" : "bg-white text-muted border border-slate-200"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "info" && (
            <div className="space-y-3">
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={info.businessEntityId} onChange={(e) => setInfo((f) => ({ ...f, businessEntityId: e.target.value }))}>
                <option value="">사업자 선택 *</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">센터 *</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={info.name} onChange={(e) => setInfo((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">근로계약서</span>
                <div className="flex gap-2">
                  {["사용", "미사용"].map((v) => (
                    <button key={v} type="button" onClick={() => setInfo((f) => ({ ...f, contractYN: v }))} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${info.contractYN === v ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">얼굴촬영</span>
                <div className="flex gap-2">
                  {["사용", "미사용"].map((v) => (
                    <button key={v} type="button" onClick={() => setInfo((f) => ({ ...f, faceYN: v }))} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${info.faceYN === v ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">주소</span>
                <div className="flex gap-2">
                  <input readOnly className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" value={info.address} placeholder="주소검색 버튼으로 입력" />
                  <Button size="sm" variant="outline" className="shrink-0" onClick={searchCenterAddress} disabled={searchingAddress}>
                    <Search size={13} /> {searchingAddress ? "검색중" : "검색"}
                  </Button>
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">비고</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={info.memo} onChange={(e) => setInfo((f) => ({ ...f, memo: e.target.value }))} />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">위도</span>
                  <input type="number" step="0.000001" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" value={info.lat} onChange={(e) => setInfo((f) => ({ ...f, lat: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">경도</span>
                  <input type="number" step="0.000001" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" value={info.lng} onChange={(e) => setInfo((f) => ({ ...f, lng: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">반경(m)</span>
                  <input type="number" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" value={info.radiusM} onChange={(e) => setInfo((f) => ({ ...f, radiusM: e.target.value }))} />
                </label>
              </div>
              <div className="flex gap-2">
                {selectedId && (
                  <Button variant="outline" onClick={removeSite}>
                    <Trash2 size={13} />
                  </Button>
                )}
                <Button className="flex-1" onClick={saveInfo}>
                  저장
                </Button>
              </div>
            </div>
          )}
          {tab === "vendors" && selectedId && <VendorsTabMobile companyId={profile.companyId} site={selectedSite} entityName={entityName} />}
          {tab === "shift" && selectedId && (
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-ink">근무구분 목록</p>
                <OrderedListMobile companyId={profile.companyId} siteId={selectedId} collectionName="siteShiftCategories" fieldLabel="근무구분" />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-ink">근무형태 목록</p>
                <OrderedListMobile companyId={profile.companyId} siteId={selectedId} collectionName="siteShiftTypes" fieldLabel="근무형태" />
              </div>
            </div>
          )}
          {tab === "deptpos" && selectedId && (
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-ink">부서 목록</p>
                <OrderedListMobile companyId={profile.companyId} siteId={selectedId} collectionName="siteDepartments" fieldLabel="부서" />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-ink">직급 목록</p>
                <OrderedListMobile companyId={profile.companyId} siteId={selectedId} collectionName="sitePositions" fieldLabel="직급" />
              </div>
            </div>
          )}
          {tab === "holidays" && selectedId && <HolidaysTabMobile companyId={profile.companyId} siteId={selectedId} />}
        </div>
      </Modal>
    </div>
  );
}
