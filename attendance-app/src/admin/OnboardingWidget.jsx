import { useEffect, useState } from "react";
import {
  doc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Building2, Plus, Pencil, Trash2, ChevronLeft, Search, Clock } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { openAddressSearch } from "../utils/daumPostcode";

const WEEKDAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];
const EMPTY_SHIFT_FORM = {
  name: "",
  workTimeType: "실근무",
  baseStartTime: "09:00",
  baseEndTime: "18:00",
  workDays: { 월요일: true, 화요일: true, 수요일: true, 목요일: true, 금요일: true, 토요일: false, 일요일: false },
  breakFrom: "12:00",
  breakTo: "13:00",
  overtimeFrom: 5,
  overtimeTo: 5,
  lateFrom: "",
  lateTo: "",
};

// 이름 하나만 가지는 목록(소속업체/센터의 기본형)을 추가/수정/삭제할 수 있는 팝업.
// "내 회사 등록하기" 안에서 버튼으로 열리는 서브 팝업 공통 UI.
function NameListModal({ open, onClose, title, items, onAdd, onRename, onRemove, extraFields }) {
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [extra, setExtra] = useState({});
  const [error, setError] = useState("");

  const startAdd = () => {
    setEditingId("new");
    setName("");
    setExtra({});
    setError("");
  };
  const startEdit = (item) => {
    setEditingId(item.id);
    setName(item.name);
    setExtra(item);
    setError("");
  };
  const cancelEdit = () => {
    setEditingId(null);
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      if (editingId === "new") {
        if (!(await confirm(`'${name.trim()}'을(를) 추가하시겠습니까?`, "save"))) return;
        await onAdd(name.trim(), extra);
      } else {
        if (!(await confirm(`'${name.trim()}'(으)로 수정하시겠습니까?`, "edit"))) return;
        await onRename(editingId, name.trim(), extra);
      }
      setEditingId(null);
    } catch (err) {
      setError(`저장에 실패했습니다: ${err.code || err.message}`);
    }
  };

  const remove = async (item) => {
    if (!(await confirm(`'${item.name}'을(를) 삭제하시겠습니까?`, "delete"))) return;
    try {
      await onRemove(item.id);
    } catch (err) {
      setError(`삭제에 실패했습니다: ${err.code || err.message}`);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      {editingId ? (
        <form onSubmit={submit} className="space-y-3">
          <button type="button" onClick={cancelEdit} className="flex items-center gap-1 text-xs text-muted hover:text-primary">
            <ChevronLeft size={14} /> 목록으로
          </button>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">이름</span>
            <input
              autoFocus
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {extraFields?.(extra, setExtra)}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex flex-nowrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={cancelEdit}>
              취소
            </Button>
            <Button type="submit">{editingId === "new" ? "추가" : "저장"}</Button>
          </div>
        </form>
      ) : (
        <div>
          <Button size="sm" className="mb-3" onClick={startAdd}>
            <Plus size={14} /> 신규 추가
          </Button>
          {error && <p className="mb-3 text-xs text-danger">{error}</p>}
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-2.5 text-sm text-ink">
                <span className="truncate">{item.name}</span>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => startEdit(item)} className="p-1.5 text-muted hover:text-primary">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => remove(item)} className="p-1.5 text-muted hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {items.length === 0 && <p className="px-4 py-6 text-center text-xs text-muted">등록된 항목이 없습니다.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

// 회사 개설 직후 한 번에 채워둘 최소 정보(사업자등록번호/소속업체/센터/시간템플릿)를
// 모으는 단일 화면 팝업. 소속업체·센터는 각각 목록 관리용 서브 팝업(추가/수정/삭제)을
// 버튼으로 열어 처리한다.
export default function OnboardingWidget() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const [company, setCompany] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [businessEntities, setBusinessEntities] = useState([]);
  const [open, setOpen] = useState(false);
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState(EMPTY_SHIFT_FORM);

  const [bizRegNo, setBizRegNo] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(doc(db, "companies", profile.companyId), (snap) => {
        if (!snap.exists()) return;
        setCompany({ id: snap.id, ...snap.data() });
        setBizRegNo((prev) => (prev ? prev : snap.data().bizRegNo || ""));
      }),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (snap) =>
        setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (snap) =>
        setBusinessEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const saveBizRegNo = async () => {
    setError("");
    if (!bizRegNo.trim()) return;
    try {
      if (!(await confirm("사업자등록번호를 저장하시겠습니까?", "save"))) return;
      await updateDoc(doc(db, "companies", profile.companyId), { bizRegNo: bizRegNo.trim() });
    } catch (err) {
      setError("저장에 실패했습니다. 권한 문제일 수 있으니 잠시 후 다시 시도해주세요. (" + (err.code || err.message) + ")");
    }
  };

  const searchSiteAddress = async (setExtra) => {
    const result = await openAddressSearch();
    if (result) setExtra((f) => ({ ...f, address: result.address }));
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Building2 size={16} /> 내 회사 등록하기
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="내 회사 등록하기" size="lg" footer={<Button onClick={() => setOpen(false)}>닫기</Button>}>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">회사명</span>
            <input disabled className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-muted" value={company?.name || ""} />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사업자등록번호</span>
            <div className="flex flex-nowrap gap-2">
              <input
                className="w-full min-w-0 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={bizRegNo}
                onChange={(e) => setBizRegNo(e.target.value)}
                placeholder="000-00-00000"
              />
              <Button type="button" variant="outline" className="shrink-0" onClick={saveBizRegNo}>
                저장
              </Button>
            </div>
            {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
          </label>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">소속업체</span>
              <Button type="button" variant="outline" className="w-full" onClick={() => setVendorModalOpen(true)}>
                소속업체 관리 ({vendors.length})
              </Button>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
              <Button type="button" variant="outline" className="w-full" onClick={() => setSiteModalOpen(true)}>
                센터 관리 ({workSites.length})
              </Button>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">시간템플릿</span>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setShiftForm(EMPTY_SHIFT_FORM);
                  setShiftModalOpen(true);
                }}
              >
                <Clock size={14} /> 시간템플릿 등록
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted">센터의 위치 반경(위경도)은 조직 &gt; 센터에서 나중에 설정할 수 있습니다.</p>
        </div>
      </Modal>

      <NameListModal
        open={vendorModalOpen}
        onClose={() => setVendorModalOpen(false)}
        title="소속업체 관리"
        items={vendors}
        onAdd={(name) => addDoc(collection(db, "vendors"), { companyId: profile.companyId, name, createdAt: serverTimestamp() })}
        onRename={(id, name) => updateDoc(doc(db, "vendors", id), { name })}
        onRemove={(id) => deleteDoc(doc(db, "vendors", id))}
      />

      <NameListModal
        open={siteModalOpen}
        onClose={() => setSiteModalOpen(false)}
        title="센터 관리"
        items={workSites}
        onAdd={(name, extra) =>
          addDoc(collection(db, "workSites"), {
            companyId: profile.companyId,
            businessEntityId: businessEntities[0]?.id || "",
            name,
            address: extra.address || "",
            lat: null,
            lng: null,
            radiusM: 100,
            createdAt: serverTimestamp(),
          })
        }
        onRename={(id, name, extra) => updateDoc(doc(db, "workSites", id), { name, address: extra.address || "" })}
        onRemove={(id) => deleteDoc(doc(db, "workSites", id))}
        extraFields={(extra, setExtra) => (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">주소</span>
            <div className="flex flex-nowrap gap-2">
              <input
                readOnly
                className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm"
                value={extra.address || ""}
                placeholder="주소검색 버튼으로 입력하세요"
              />
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => searchSiteAddress(setExtra)}>
                <Search size={13} /> 주소검색
              </Button>
            </div>
          </label>
        )}
      />

      <ShiftTemplateModal
        open={shiftModalOpen}
        onClose={() => setShiftModalOpen(false)}
        form={shiftForm}
        setForm={setShiftForm}
        companyId={profile?.companyId}
        businessEntityId={businessEntities[0]?.id || ""}
      />
    </>
  );
}

// "근무시간 설정하기" 참고화면과 동일한 구성의 시간템플릿 신규등록 팝업(단일화면).
// 템플릿 > 시간템플릿의 상세 탭 구조(휴게/연장/지각)를 한 화면에 압축해 최초 1개를
// 빠르게 등록할 수 있게 한다 — 추가 편집은 템플릿 > 시간템플릿에서 계속할 수 있다.
function ShiftTemplateModal({ open, onClose, form, setForm, companyId, businessEntityId }) {
  const confirm = useConfirm();
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) setError("");
  }, [open]);

  const toggleDay = (day) => setForm((f) => ({ ...f, workDays: { ...f.workDays, [day]: !f.workDays[day] } }));

  const save = async () => {
    if (!form.name.trim()) return;
    if (!(await confirm("저장하시겠습니까?", "save"))) return;
    setError("");
    try {
      const weekdays = Object.fromEntries(
        WEEKDAYS.map((w) => [w, { holiday: !form.workDays[w], work: !!form.workDays[w], start: form.baseStartTime, end: form.baseEndTime }])
      );
      await addDoc(collection(db, "shiftTemplates"), {
        companyId,
        businessEntityId,
        name: form.name.trim(),
        memo: "",
        workTimeType: form.workTimeType,
        visibility: "보임",
        baseStartTime: form.baseStartTime,
        baseEndTime: form.baseEndTime,
        weekdays,
        breaks: [{ from: form.breakFrom, to: form.breakTo }],
        overtimeRules: [{ from: Number(form.overtimeFrom) || 0, to: Number(form.overtimeTo) || 0 }],
        lateRules: form.lateFrom && form.lateTo ? [{ from: Number(form.lateFrom), to: Number(form.lateTo) }] : [],
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch (err) {
      setError(`저장에 실패했습니다: ${err.code || err.message}`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="근무시간 설정하기"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={save}>저장</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">템플릿명 *</span>
          <input
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="예: 주간성형실"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">근무시간유형</span>
          <div className="flex h-[38px] items-center gap-4 text-sm">
            {["공수", "실근무"].map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input type="radio" name="workTimeType" checked={form.workTimeType === t} onChange={() => setForm((f) => ({ ...f, workTimeType: t }))} />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">기본근무시작 *</span>
            <input type="time" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.baseStartTime} onChange={(e) => setForm((f) => ({ ...f, baseStartTime: e.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">기본근무종료 *</span>
            <input type="time" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={form.baseEndTime} onChange={(e) => setForm((f) => ({ ...f, baseEndTime: e.target.value }))} />
          </label>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">근무요일</span>
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto overscroll-x-contain text-sm">
            {WEEKDAYS.map((w) => (
              <label key={w} className="flex shrink-0 items-center gap-1.5">
                <input type="checkbox" checked={!!form.workDays[w]} onChange={() => toggleDay(w)} />
                {w[0]}
              </label>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">휴게시간 설정</span>
          <div className="flex flex-nowrap items-center gap-2 text-sm">
            <input type="time" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.breakFrom} onChange={(e) => setForm((f) => ({ ...f, breakFrom: e.target.value }))} />
            <span className="text-muted">부터</span>
            <input type="time" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.breakTo} onChange={(e) => setForm((f) => ({ ...f, breakTo: e.target.value }))} />
            <span className="text-muted">까지</span>
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">연장시간 설정</span>
          <div className="flex flex-nowrap items-center gap-2 text-sm">
            <input type="number" className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.overtimeFrom} onChange={(e) => setForm((f) => ({ ...f, overtimeFrom: e.target.value }))} />
            <span className="text-muted">분 부터</span>
            <input type="number" className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.overtimeTo} onChange={(e) => setForm((f) => ({ ...f, overtimeTo: e.target.value }))} />
            <span className="text-muted">분 연장</span>
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">지각설정 (선택)</span>
          <div className="flex flex-nowrap items-center gap-2 text-sm">
            <input type="number" className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.lateFrom} onChange={(e) => setForm((f) => ({ ...f, lateFrom: e.target.value }))} placeholder="0" />
            <span className="text-muted">분 지각시</span>
            <input type="number" className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.lateTo} onChange={(e) => setForm((f) => ({ ...f, lateTo: e.target.value }))} placeholder="0" />
            <span className="text-muted">분 소급</span>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-muted">
          <p className="mb-1 font-semibold text-ink">안내사항</p>
          <p>시간 기준을 미리 정해두고, 근로자의 출퇴근을 자동으로 관리하는 설정입니다.</p>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
