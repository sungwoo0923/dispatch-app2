import { useEffect, useRef, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { Plus, Trash2, FileText, Video, Upload, BellRing, Search } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { uploadSafetyMaterialFile } from "../utils/safety";
import { SAFETY_TOPIC_TEMPLATES } from "../utils/safetyTemplates";
import { formatDate } from "../utils/dateUtils";

const EMPTY_FORM = { title: "", type: "text", content: "", topicKey: "" };

// 안전교육자료의 모바일 전용 화면 — 홈 안전영상 관리 + 자료 목록(카드) +
// 신규 등록/이수현황 확인을 전체화면 시트로 재구성했다. 시청 구간 등
// 세부 텔레메트리는 생략하고 이수여부 배지만 보여준다.
export default function AdminMobileSafetyMaterials() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [search, setSearch] = useState("");

  const [registerOpen, setRegisterOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statusView, setStatusView] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const [homeVideoUrl, setHomeVideoUrl] = useState("");
  const [homeVideoUploading, setHomeVideoUploading] = useState(false);
  const homeVideoInputRef = useRef(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.deleted))),
      onSnapshot(query(collection(db, "safetyMaterials"), where("companyId", "==", profile.companyId)), (s) => setMaterials(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "safetyCompletions"), where("companyId", "==", profile.companyId)), (s) => setCompletions(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(doc(db, "companies", profile.companyId), (s) => setHomeVideoUrl(s.data()?.homeSafetyVideoUrl || "")),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const uploadHomeVideo = async (f) => {
    if (!f) return;
    setHomeVideoUploading(true);
    try {
      const url = await uploadSafetyMaterialFile({ companyId: profile.companyId, materialId: "home_ambient", file: f });
      await updateDoc(doc(db, "companies", profile.companyId), { homeSafetyVideoUrl: url });
      toast.success("홈 화면 안전영상이 등록되었습니다");
    } catch (err) {
      toast.error(`업로드에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    } finally {
      setHomeVideoUploading(false);
      if (homeVideoInputRef.current) homeVideoInputRef.current.value = "";
    }
  };

  const removeHomeVideo = async () => {
    if (!(await confirm("홈 화면 안전영상을 삭제하시겠습니까?", "delete"))) return;
    await updateDoc(doc(db, "companies", profile.companyId), { homeSafetyVideoUrl: "" });
    toast.success("삭제되었습니다");
  };

  const sorted = [...materials]
    .filter((m) => !search.trim() || m.title?.includes(search.trim()))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  const completedCountFor = (materialId) => completions.filter((c) => c.materialId === materialId).length;
  const incompleteEmployeesFor = (m) => employees.filter((e) => !completions.some((c) => c.materialId === m.id && c.uid === e.id));

  const openNew = () => {
    setForm(EMPTY_FORM);
    setFile(null);
    setRegisterOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("제목을 입력해주세요.");
    if (form.type === "text" && !form.content.trim()) return toast.error("지침 내용을 입력해주세요.");
    if (form.type === "video" && !file) return toast.error("영상 파일을 선택해주세요.");
    setSaving(true);
    try {
      let videoUrl = "";
      if (form.type === "video") {
        videoUrl = await uploadSafetyMaterialFile({ companyId: profile.companyId, materialId: `tmp_${Date.now()}`, file });
      }
      await addDoc(collection(db, "safetyMaterials"), {
        companyId: profile.companyId,
        title: form.title,
        type: form.type,
        content: form.type === "text" ? form.content : "",
        videoUrl,
        active: true,
        createdAt: serverTimestamp(),
      });
      if (employees.length > 0) {
        const batch = writeBatch(db);
        employees.forEach((emp) => {
          const ref = doc(collection(db, "notifications"));
          batch.set(ref, { companyId: profile.companyId, uid: emp.id, title: "새 안전교육자료가 등록되었습니다", message: form.title, read: false, createdAt: serverTimestamp() });
        });
        await batch.commit();
      }
      toast.success("안전교육자료가 등록되었습니다");
      setRegisterOpen(false);
    } catch (err) {
      toast.error(`등록에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m) => {
    if (!(await confirm(`"${m.title}" 자료를 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "safetyMaterials", m.id));
    toast.success("삭제되었습니다");
  };

  const sendReminderToIncomplete = async (m) => {
    const targets = incompleteEmployeesFor(m);
    if (targets.length === 0) return toast.error("미이수자가 없습니다.");
    if (!(await confirm(`미이수자 ${targets.length}명에게 "${m.title}" 이수 알림을 보내시겠습니까?`, "edit"))) return;
    const batch = writeBatch(db);
    targets.forEach((emp) => {
      const ref = doc(collection(db, "notifications"));
      batch.set(ref, { companyId: profile.companyId, uid: emp.id, title: "안전교육자료 이수 안내", message: `아직 이수하지 않은 안전교육자료가 있습니다: ${m.title}`, read: false, createdAt: serverTimestamp() });
    });
    await batch.commit();
    toast.success(`${targets.length}명에게 알림을 보냈습니다`);
  };

  const sendReminderToAllIncomplete = async () => {
    const targets = employees.filter((e) => sorted.some((m) => !completions.some((c) => c.materialId === m.id && c.uid === e.id)));
    if (targets.length === 0) return toast.error("미이수자가 없습니다.");
    if (!(await confirm(`미이수 항목이 있는 근로자 ${targets.length}명에게 이수 안내 알림을 보내시겠습니까?`, "edit"))) return;
    const batch = writeBatch(db);
    targets.forEach((emp) => {
      const ref = doc(collection(db, "notifications"));
      batch.set(ref, { companyId: profile.companyId, uid: emp.id, title: "안전교육자료 이수 안내", message: "아직 이수하지 않은 안전교육자료가 있습니다. 확인 후 이수해주세요.", read: false, createdAt: serverTimestamp() });
    });
    await batch.commit();
    toast.success(`${targets.length}명에게 알림을 보냈습니다`);
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div>
        <p className="text-sm font-semibold text-ink">안전교육자료</p>
        <p className="mt-0.5 text-xs text-muted">근로자가 필수로 확인·서명해야 이수 처리됩니다</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
        <p className="mb-2 text-xs font-medium text-muted">홈 화면 안전영상</p>
        {homeVideoUrl ? (
          <div className="space-y-2">
            <video src={homeVideoUrl} className="h-28 w-full rounded-xl bg-black object-cover" muted loop autoPlay playsInline />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => homeVideoInputRef.current?.click()} disabled={homeVideoUploading}>
                <Upload size={13} /> {homeVideoUploading ? "업로드 중..." : "교체"}
              </Button>
              <Button size="sm" variant="danger" className="flex-1" onClick={removeHomeVideo} disabled={homeVideoUploading}>
                <Trash2 size={13} /> 삭제
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" className="w-full" onClick={() => homeVideoInputRef.current?.click()} disabled={homeVideoUploading}>
            <Upload size={13} /> {homeVideoUploading ? "업로드 중..." : "영상 업로드"}
          </Button>
        )}
        <input ref={homeVideoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => uploadHomeVideo(e.target.files?.[0])} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">목록 {sorted.length}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={sendReminderToAllIncomplete}>
            <BellRing size={13} />
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus size={13} /> 등록
          </Button>
        </div>
      </div>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="제목 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {sorted.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">등록된 안전교육자료가 없습니다.</div>}
        {sorted.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
              {m.type === "video" ? <Video size={16} /> : <FileText size={16} />}
            </div>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setStatusFilter("all"); setStatusView(m); }}>
              <p className="truncate text-sm font-semibold text-ink">{m.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {m.createdAt?.toDate ? formatDate(m.createdAt.toDate().toISOString().slice(0, 10)) : "-"} · 이수 {completedCountFor(m.id)}/{employees.length}명
              </p>
            </button>
            <button type="button" onClick={() => remove(m)} className="shrink-0 rounded-lg p-1.5 text-muted active:bg-slate-100">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <Modal open={registerOpen} onClose={() => setRegisterOpen(false)} title="안전교육자료 등록">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">제목 *</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">유형 *</span>
            <div className="flex gap-2">
              {[{ key: "text", label: "지침(글)" }, { key: "video", label: "영상" }].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: t.key }))}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold ${form.type === t.key ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {form.type === "text" ? (
            <>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">교육 주제 (선택 시 기본 양식 자동 입력)</span>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.topicKey}
                  onChange={(e) => {
                    const t = SAFETY_TOPIC_TEMPLATES.find((x) => x.key === e.target.value);
                    setForm((f) => ({ ...f, topicKey: e.target.value, title: t ? t.title : f.title, content: t ? t.content : f.content }));
                  }}
                >
                  <option value="">직접 작성</option>
                  {SAFETY_TOPIC_TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>{t.topic}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">지침 내용 *</span>
                <textarea className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={8} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
              </label>
            </>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">영상 파일 *</span>
              <input type="file" accept="video/*" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          )}
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? "등록 중..." : "등록"}
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(statusView)} onClose={() => setStatusView(null)} title={`이수현황 · ${statusView?.title || ""}`}>
        {statusView && (
          <div className="space-y-3">
            <div className="flex flex-nowrap items-center justify-between gap-2">
              <select className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">전체보기</option>
                <option value="done">이수자만</option>
                <option value="undone">미이수자만</option>
              </select>
              <Button size="sm" variant="outline" onClick={() => sendReminderToIncomplete(statusView)}>
                <BellRing size={13} /> 미이수자 알림
              </Button>
            </div>
            <div className="max-h-80 space-y-1.5 overflow-y-auto">
              {employees
                .map((e) => ({ e, c: completions.find((x) => x.materialId === statusView.id && x.uid === e.id) }))
                .filter(({ c }) => (statusFilter === "done" ? c : statusFilter === "undone" ? !c : true))
                .map(({ e, c }) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{e.name}</p>
                      <p className="truncate text-xs text-muted">{[e.team, e.position].filter(Boolean).join(" / ") || "-"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge tone={c ? "success" : "warning"}>{c ? "이수완료" : "미이수"}</Badge>
                      {c?.completedAt?.toDate && <p className="mt-0.5 text-[11px] text-muted">{formatDate(c.completedAt.toDate().toISOString().slice(0, 10))}</p>}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
