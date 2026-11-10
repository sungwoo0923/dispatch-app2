// ======================= pnk-site/src/pages/Files.jsx =======================
// 자료실 — 회사 서류 · 계약서 · 세무 · 디자인 · 개발 문서. 파일은 Storage pnk/files/{자료 번호}/{파일 이름}(50MB 미만)
//  순서: 자료 문서(pnkFiles) 먼저 만들고 → 파일 올리기 → 문서에 경로 · 크기 적기 (규칙이 문서를 보고 판단)
import React from "react";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "../firebase";
import { useMeCtx } from "../App";
import { FILE_CATS, addRow, by, fmtTime, patchRow, removeRow, useCol } from "../pnkApi";
import { Btn, Card, Chip, Empty, Field, Hero, HeroBtn, Input, Loading, Modal, Select, cx, fail } from "../ui";
import Icon from "../icons";

const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const ext = (n) => String(n || "").split(".").pop().toUpperCase().slice(0, 4);

export default function Files() {
  const me = useMeCtx();
  const [rows] = useCol("pnkFiles", [], []);
  const [cat, setCat] = React.useState("");
  const [q, setQ] = React.useState("");
  const [up, setUp] = React.useState(false);
  const list = (rows || []).filter((f) => f.storagePath && (!cat || f.category === cat) && (!q || `${f.name} ${f.note}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const open = async (f) => { try { window.open(await getDownloadURL(ref(storage, f.storagePath)), "_blank"); } catch (e) { fail(e); } };
  const del = async (f) => {
    if (!window.confirm(`${f.name} 을(를) 지울까요?`)) return;
    try { await deleteObject(ref(storage, f.storagePath)).catch(() => {}); await removeRow("pnkFiles", f.id); } catch (e) { fail(e); }
  };
  const used = (rows || []).reduce((a, f) => a + (f.size || 0), 0);

  return (
    <div>
      <Hero en="ARCHIVE" title="자료실" desc={`회사 문서를 한곳에 — ${list.length}개 · 전체 ${size(used)}`}>
        <HeroBtn icon="upload" onClick={() => setUp(true)}>올리기</HeroBtn>
      </Hero>
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 md:gap-5">
        <div className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar">
          {["", ...FILE_CATS].map((c) => {
            const n = (rows || []).filter((f) => f.storagePath && (!c || f.category === c)).length;
            return (
              <button key={c || "all"} type="button" onClick={() => setCat(c)} className={cx("flex items-center gap-2.5 h-11 px-3.5 rounded-xl text-[13.5px] font-bold whitespace-nowrap", cat === c ? "bg-navy text-white" : "bg-white border border-line text-[#3A4A66] hover:border-navy-500")}>
                <Icon name="folder" size={17} /><span className="flex-1 text-left">{c || "전체"}</span><span className="text-[12px] opacity-70 tnum">{n}</span>
              </button>
            );
          })}
        </div>
        <Card pad={false}>
          <div className="p-3 border-b border-[#EEF1F6] relative"><Icon name="search" size={16} className="absolute left-6 top-6 text-[#7A8AA8]" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="파일 이름 · 메모 검색" className="pl-9" /></div>
          {!rows ? <Loading /> : list.length === 0 ? <Empty icon="folder">자료가 없습니다.</Empty> : (
            <ul className="divide-y divide-[#EEF1F6]">
              {list.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFD]">
                  <div className="w-11 h-11 rounded-xl bg-navy-100 text-navy text-[11px] font-black flex items-center justify-center shrink-0">{ext(f.name)}</div>
                  <button type="button" onClick={() => open(f)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-1.5"><span className="text-[14px] font-bold truncate">{f.name}</span>{f.adminOnly && <Chip tone="dark">관리자</Chip>}</div>
                    <div className="text-[12px] text-[#7A8AA8] truncate">{f.category} · {size(f.size || 0)} · {f.uploaderName} · {fmtTime(f.createdAt)}{f.note ? ` · ${f.note}` : ""}</div>
                  </button>
                  <Btn kind="ghost" icon="download" onClick={() => open(f)} aria-label="받기" />
                  {(f.uploaderUid === me.user.uid || me.isAdmin) && <Btn kind="danger" icon="trash" onClick={() => del(f)} aria-label="지우기" />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {up && <Upload me={me} defCat={cat || FILE_CATS[0]} onClose={() => setUp(false)} />}
    </div>
  );
}

function Upload({ me, defCat, onClose }) {
  const [files, setFiles] = React.useState([]);
  const [category, setCategory] = React.useState(defCat);
  const [note, setNote] = React.useState("");
  const [adminOnly, setAdminOnly] = React.useState(false);
  const [pct, setPct] = React.useState(null);
  const [drag, setDrag] = React.useState(false);
  const go = async () => {
    const big = files.find((f) => f.size >= 50 * 1048576);
    if (big) { window.alert(`${big.name} — 50MB 이상은 올릴 수 없습니다.`); return; }
    const b = by(me);
    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const r = await addRow("pnkFiles", { name: file.name, category, note, adminOnly: me.isAdmin && adminOnly, storagePath: "", size: file.size, contentType: file.type || "", uploaderUid: b.uid, uploaderName: b.name });
        const path = `pnk/files/${r.id}/${file.name.replace(/[/\\#?]/g, "_")}`;
        try {
          await new Promise((res, rej) => {
            const t = uploadBytesResumable(ref(storage, path), file, { contentType: file.type || "application/octet-stream" });
            t.on("state_changed", (s) => setPct(Math.round(((i + s.bytesTransferred / s.totalBytes) / files.length) * 100)), rej, res);
          });
          await patchRow("pnkFiles", r.id, { storagePath: path });
        } catch (e) { await removeRow("pnkFiles", r.id).catch(() => {}); throw e; }
      }
      onClose();
    } catch (e) { fail(e); setPct(null); }
  };
  return (
    <Modal open title="자료 올리기" onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>취소</Btn><Btn icon="upload" onClick={go} disabled={!files.length || pct != null}>{pct != null ? `올리는 중 ${pct}%` : `${files.length}개 올리기`}</Btn></>}>
      <div className="space-y-3">
        <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); setFiles([...e.dataTransfer.files]); }}
          className={cx("flex flex-col items-center justify-center gap-2 h-36 rounded-2xl border-2 border-dashed cursor-pointer transition", drag ? "border-navy-500 bg-navy-50" : "border-[#C9D3E4] hover:border-navy-500")}>
          <Icon name="upload" size={26} className="text-navy-500" />
          <span className="text-[13.5px] font-bold">{files.length ? files.map((f) => f.name).join(", ") : "파일을 끌어다 놓거나 눌러서 고르기"}</span>
          <span className="text-[12px] text-[#7A8AA8]">파일 하나에 50MB 미만</span>
          <input type="file" multiple className="hidden" onChange={(e) => setFiles([...e.target.files])} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="분류"><Select custom value={category} onChange={(e) => setCategory(e.target.value)} options={FILE_CATS} /></Field>
          <Field label="메모"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        {me.isAdmin && <label className="flex items-center gap-2 text-[13px] font-bold"><input type="checkbox" checked={adminOnly} onChange={(e) => setAdminOnly(e.target.checked)} />관리자만 보기 (계약서 · 세무 자료 등)</label>}
        {pct != null && <div className="h-2 rounded-full bg-navy-100 overflow-hidden"><div className="h-full bg-navy transition-all" style={{ width: `${pct}%` }} /></div>}
      </div>
    </Modal>
  );
}
