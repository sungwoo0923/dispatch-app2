import { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Building2, Save } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Panel from "../components/Panel";
import Card from "../components/Card";
import Button from "../components/Button";

const EMPTY_FORM = {
  name: "",
  regNumber: "",
  representativeName: "",
  address: "",
  businessType: "",
  businessCategory: "",
};

// 인력사무소 자체 사업자등록증 정보 — 여기에 등록해야 도급사 프로그램의
// 스케줄등록/출근현황 "사업자" 컬럼에 그 인력사무소가 배정한 외부인력의
// 사업자명으로 표시된다(등록 전에는 공백으로 남는다).
export default function AgencyBusiness() {
  const { agency } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agency) return;
    setForm({ ...EMPTY_FORM, ...(agency.business || {}) });
  }, [agency?.id, agency?.business]);

  const registered = Boolean(agency?.business?.name);

  const save = async () => {
    if (!form.name.trim() || !form.regNumber.trim()) {
      toast.error("상호명과 사업자등록번호는 필수입니다.");
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "agencies", agency.id), { business: form });
      toast.success("사업자등록증 정보가 저장되었습니다");
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel icon={Building2} title="회사관리">
        <p className="mb-3 text-xs text-muted">
          사업자등록증 정보를 입력하고 저장하면 도급사 화면의 "사업자" 항목에 이 상호명이 표시됩니다. 등록하지 않으면 공백으로 표시됩니다.
        </p>
        <div className="mb-4">
          {registered ? (
            <span className="rounded-full bg-primary-light px-3 py-1.5 text-xs font-medium text-primary">등록완료 · {agency.business.name}</span>
          ) : (
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-muted">사업자 미등록</span>
          )}
        </div>
        <Card className="max-w-xl space-y-3 p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">상호명 *</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="예: 남강인력"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사업자등록번호 *</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.regNumber}
              onChange={(e) => setForm((f) => ({ ...f, regNumber: e.target.value }))}
              placeholder="000-00-00000"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">대표자명</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.representativeName}
              onChange={(e) => setForm((f) => ({ ...f, representativeName: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사업장 주소</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">업태</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={form.businessType}
                onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))}
                placeholder="예: 서비스업"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">종목</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={form.businessCategory}
                onChange={(e) => setForm((f) => ({ ...f, businessCategory: e.target.value }))}
                placeholder="예: 인력공급업"
              />
            </label>
          </div>
          <div className="flex justify-end pt-1">
            <Button onClick={save} disabled={saving}>
              <Save size={14} /> {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </Card>
      </Panel>
    </div>
  );
}
