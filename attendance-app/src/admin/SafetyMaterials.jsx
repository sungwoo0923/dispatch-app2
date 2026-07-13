import { useEffect, useState, useRef } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { ShieldCheck, Plus, Trash2, FileText, Video, Upload, BellRing } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Panel from "../components/Panel";
import SidePanel from "../components/SidePanel";
import { uploadSafetyMaterialFile } from "../utils/safety";
import { SAFETY_TOPIC_TEMPLATES } from "../utils/safetyTemplates";
import { formatDate, calculateAge } from "../utils/dateUtils";

const EMPTY_FORM = { title: "", type: "text", content: "", topicKey: "" };

function formatSec(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SafetyMaterials() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [completions, setCompletions] = useState([]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statusView, setStatusView] = useState(null); // material
  const [statusFilter, setStatusFilter] = useState("all"); // all | done | undone

  const [homeVideoUrl, setHomeVideoUrl] = useState("");
  const [homeVideoUploading, setHomeVideoUploading] = useState(false);
  const homeVideoInputRef = useRef(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) =>
        setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.deleted))
      ),
      onSnapshot(query(collection(db, "safetyMaterials"), where("companyId", "==", profile.companyId)), (s) =>
        setMaterials(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "safetyCompletions"), where("companyId", "==", profile.companyId)), (s) =>
        setCompletions(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(doc(db, "companies", profile.companyId), (s) => setHomeVideoUrl(s.data()?.homeSafetyVideoUrl || "")),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  // 모바일 홈 화면의 "오늘도 안전하게" 카드에서 계속 반복재생되는 짧은
  // 안내영상 — 이수/서명이 필요한 안전교육자료(위 목록)와는 별개로, 회사당
  // 하나만 두는 단순한 앰비언트 영상이라 companies 문서에 URL 하나만 저장한다.
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

  const sorted = [...materials].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  // completions에는 이미 삭제된(퇴사/탈퇴) 근로자의 이수기록도 남아있을 수 있어
  // (탈퇴 시 completions까지 연쇄삭제하지 않음) 현재 재직 중인 근로자로만
  // 필터링하지 않으면 이수인원이 대상인원(employees.length)보다 커지는
  // "3 / 1명" 같은 표시가 생긴다. uid 기준으로도 중복 제거한다.
  const completedCountFor = (materialId) => {
    const activeUids = new Set(employees.map((e) => e.id));
    const uniqueUids = new Set(
      completions.filter((c) => c.materialId === materialId && activeUids.has(c.uid)).map((c) => c.uid)
    );
    return uniqueUids.size;
  };

  const openNew = () => {
    setForm(EMPTY_FORM);
    setFile(null);
    setPanelOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("제목을 입력해주세요.");
      return;
    }
    if (form.type === "text" && !form.content.trim()) {
      toast.error("지침 내용을 입력해주세요.");
      return;
    }
    if (form.type === "video" && !file) {
      toast.error("영상 파일을 선택해주세요.");
      return;
    }
    setSaving(true);
    try {
      // 영상은 업로드가 실패할 수 있는 지점이므로, Storage 업로드를 먼저 끝낸
      // 뒤에 Firestore 문서를 만든다 — 순서를 반대로 하면 업로드 실패 시
      // 영상 없는 "빈 껍데기" 자료가 목록에 등록된 것처럼 남는다.
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

      // 회사 소속 전 직원에게 새 안전교육자료 등록 알림을 보낸다. notifications는
      // 원래 근로자 1명을 대상으로 하는 구조라, 여기서는 그 형태를 유지한 채
      // 직원 수만큼 문서를 각각 만든다(회사 전체 브로드캐스트 알림의 첫 사례).
      if (employees.length > 0) {
        const batch = writeBatch(db);
        employees.forEach((emp) => {
          const ref = doc(collection(db, "notifications"));
          batch.set(ref, {
            companyId: profile.companyId,
            uid: emp.id,
            title: "새 안전교육자료가 등록되었습니다",
            message: form.title,
            read: false,
            createdAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }

      toast.success("안전교육자료가 등록되었습니다");
      setPanelOpen(false);
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

  const incompleteEmployeesFor = (m) => employees.filter((e) => !completions.some((c) => c.materialId === m.id && c.uid === e.id));

  // 특정 안전교육자료의 미이수자에게만 이수 안내 알림을 보낸다. 새 자료
  // 등록 시 전체 발송하던 것과 동일한 브로드캐스트 방식(직원 수만큼
  // notifications 문서 생성)을, 대상만 "아직 이수 안 한 사람"으로 좁혀 재사용한다.
  const sendReminderToIncomplete = async (m) => {
    const targets = incompleteEmployeesFor(m);
    if (targets.length === 0) {
      toast.error("미이수자가 없습니다.");
      return;
    }
    if (!(await confirm(`미이수자 ${targets.length}명에게 "${m.title}" 이수 알림을 보내시겠습니까?`, "edit"))) return;
    const batch = writeBatch(db);
    targets.forEach((emp) => {
      const ref = doc(collection(db, "notifications"));
      batch.set(ref, {
        companyId: profile.companyId,
        uid: emp.id,
        title: "안전교육자료 이수 안내",
        message: `아직 이수하지 않은 안전교육자료가 있습니다: ${m.title}`,
        read: false,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
    toast.success(`${targets.length}명에게 알림을 보냈습니다`);
  };

  // 자료 하나만이 아니라 회사 전체 안전교육자료 중 하나라도 미이수인
  // 근로자에게 한 번에 알림을 보내는 메뉴 상단 버튼용 함수.
  const sendReminderToAllIncomplete = async () => {
    const targets = employees.filter((e) => sorted.some((m) => !completions.some((c) => c.materialId === m.id && c.uid === e.id)));
    if (targets.length === 0) {
      toast.error("미이수자가 없습니다.");
      return;
    }
    if (!(await confirm(`미이수 항목이 있는 근로자 ${targets.length}명에게 이수 안내 알림을 보내시겠습니까?`, "edit"))) return;
    const batch = writeBatch(db);
    targets.forEach((emp) => {
      const ref = doc(collection(db, "notifications"));
      batch.set(ref, {
        companyId: profile.companyId,
        uid: emp.id,
        title: "안전교육자료 이수 안내",
        message: "아직 이수하지 않은 안전교육자료가 있습니다. 확인 후 이수해주세요.",
        read: false,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
    toast.success(`${targets.length}명에게 알림을 보냈습니다`);
  };

  return (
    <div className="space-y-6">
      <Panel icon={Video} title="홈 화면 안전영상">
        <p className="mb-4 text-xs text-muted">
          모바일 홈 화면 "오늘도 안전하게!" 카드에서 끊김 없이 계속 반복재생되는 짧은 안내영상입니다(음소거 기본, 근로자가 소리 켜기 가능).
          이수 서명이 필요한 안전교육자료와는 별개이며, 회사당 1개만 등록할 수 있습니다. 3분 미만의 짧은 영상을 권장합니다.
        </p>
        {homeVideoUrl ? (
          <div className="flex flex-wrap items-center gap-4">
            <video src={homeVideoUrl} className="h-32 w-56 rounded-xl bg-black object-cover" muted loop autoPlay playsInline />
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={() => homeVideoInputRef.current?.click()} disabled={homeVideoUploading}>
                <Upload size={13} /> {homeVideoUploading ? "업로드 중..." : "다른 영상으로 교체"}
              </Button>
              <Button size="sm" variant="danger" onClick={removeHomeVideo} disabled={homeVideoUploading}>
                <Trash2 size={13} /> 삭제
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" onClick={() => homeVideoInputRef.current?.click()} disabled={homeVideoUploading}>
            <Upload size={13} /> {homeVideoUploading ? "업로드 중..." : "영상 업로드"}
          </Button>
        )}
        <input
          ref={homeVideoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => uploadHomeVideo(e.target.files?.[0])}
        />
      </Panel>

      <Panel icon={ShieldCheck} title="안전교육자료">
        <p className="mb-4 text-xs text-muted">
          지침(글) 또는 영상을 등록하면 근로자 앱에서 필수로 확인 후 서명해야 이수 처리됩니다. 미이수 근로자는 출근 시 안내됩니다.
        </p>
        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted">목록 {sorted.length}</p>
          <div className="flex flex-nowrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={sendReminderToAllIncomplete}>
              <BellRing size={13} /> 미이수자 전체 알림
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus size={13} /> 신규 등록
            </Button>
          </div>
        </div>
        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[640px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-3 font-semibold">순번</th>
                <th className="px-3 py-3 font-semibold">제목</th>
                <th className="px-3 py-3 font-semibold">유형</th>
                <th className="px-3 py-3 font-semibold">등록일</th>
                <th className="px-3 py-3 font-semibold">이수현황</th>
                <th className="px-3 py-3 font-semibold">삭제</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => (
                <tr key={m.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-3 text-ink">{i + 1}</td>
                  <td className="px-3 py-3 text-ink">{m.title}</td>
                  <td className="px-3 py-3 text-ink">
                    <span className="inline-flex items-center gap-1">
                      {m.type === "video" ? <Video size={13} /> : <FileText size={13} />}
                      {m.type === "video" ? "영상" : "지침"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-ink">{m.createdAt?.toDate ? formatDate(m.createdAt.toDate().toISOString().slice(0, 10)) : "-"}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => {
                        setStatusFilter("all");
                        setStatusView(m);
                      }}
                    >
                      {completedCountFor(m.id)} / {employees.length}명
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <button type="button" className="text-muted hover:text-danger" onClick={() => remove(m)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted">
                    등록된 안전교육자료가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="안전교육자료 신규 등록"
        footer={
          <Button onClick={save} disabled={saving}>
            {saving ? "등록 중..." : "등록"}
          </Button>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">제목 *</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">유형 *</span>
            <div className="flex flex-nowrap items-center gap-3 text-sm">
              {[
                { key: "text", label: "지침(글)" },
                { key: "video", label: "영상" },
              ].map((t) => (
                <label key={t.key} className="flex items-center gap-1.5">
                  <input type="radio" checked={form.type === t.key} onChange={() => setForm((f) => ({ ...f, type: t.key }))} />
                  {t.label}
                </label>
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
                    setForm((f) => ({
                      ...f,
                      topicKey: e.target.value,
                      title: t ? t.title : f.title,
                      content: t ? t.content : f.content,
                    }));
                  }}
                >
                  <option value="">직접 작성</option>
                  {SAFETY_TOPIC_TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.topic}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">지침 내용 *</span>
                <textarea
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  rows={10}
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                />
              </label>
            </>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">영상 파일 *</span>
              <input type="file" accept="video/*" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          )}
        </div>
      </SidePanel>

      <SidePanel
        open={Boolean(statusView)}
        onClose={() => setStatusView(null)}
        title={`이수현황 · ${statusView?.title || ""}`}
        footer={<Button onClick={() => setStatusView(null)}>닫기</Button>}
      >
        {statusView && (
          <div className="space-y-3">
            <div className="flex flex-nowrap items-center justify-between gap-2">
              <select
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">전체보기</option>
                <option value="done">이수자만</option>
                <option value="undone">미이수자만</option>
              </select>
              <Button size="sm" variant="outline" onClick={() => sendReminderToIncomplete(statusView)}>
                <BellRing size={13} /> 미이수자에게 알림
              </Button>
            </div>
            <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
              <table className="w-full min-w-[760px] text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-3 py-2 font-semibold">이름</th>
                    <th className="px-3 py-2 font-semibold">나이</th>
                    <th className="px-3 py-2 font-semibold">국적</th>
                    <th className="px-3 py-2 font-semibold">부서/직급</th>
                    <th className="px-3 py-2 font-semibold">연락처</th>
                    <th className="px-3 py-2 font-semibold">이수여부</th>
                    <th className="px-3 py-2 font-semibold">이수일</th>
                    {statusView.type === "video" && (
                      <>
                        <th className="px-3 py-2 font-semibold">시청 시작~종료</th>
                        <th className="px-3 py-2 font-semibold">시청 구간</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {employees
                    .map((e) => ({ e, c: completions.find((x) => x.materialId === statusView.id && x.uid === e.id) }))
                    .filter(({ c }) => (statusFilter === "done" ? c : statusFilter === "undone" ? !c : true))
                    .map(({ e, c }) => (
                      <tr key={e.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-3 py-2 text-ink">{e.name}</td>
                        <td className="px-3 py-2 text-ink">{calculateAge(e.residentNumberFront) ?? "-"}</td>
                        <td className="px-3 py-2 text-ink">{e.country || e.nationality || "-"}</td>
                        <td className="px-3 py-2 text-ink">{[e.team, e.position].filter(Boolean).join(" / ") || "-"}</td>
                        <td className="px-3 py-2 text-ink">{e.phone || "-"}</td>
                        <td className="px-3 py-2">
                          <Badge tone={c ? "success" : "warning"}>{c ? "이수완료" : "미이수"}</Badge>
                        </td>
                        <td className="px-3 py-2 text-ink">
                          {c?.completedAt?.toDate ? formatDate(c.completedAt.toDate().toISOString().slice(0, 10)) : "-"}
                        </td>
                        {statusView.type === "video" && (
                          <>
                            <td className="px-3 py-2 text-ink">
                              {c?.watchStartedAt?.toDate && c?.watchEndedAt?.toDate
                                ? `${c.watchStartedAt.toDate().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} ~ ${c.watchEndedAt.toDate().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`
                                : "-"}
                            </td>
                            <td className="px-3 py-2 text-ink">
                              {c?.watchedMaxSec != null && c?.videoDurationSec != null
                                ? `${formatSec(c.watchedMaxSec)} / ${formatSec(c.videoDurationSec)}`
                                : "-"}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  );
}
