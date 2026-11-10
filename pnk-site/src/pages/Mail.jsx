// ======================= pnk-site/src/pages/Mail.jsx =======================
// 사내메일 — 구성원마다 아이디@pnkproject.com 주소(pnkMembers.mailId, 구성원 화면에서 관리자가 정함)
//  지금: 구성원끼리 주고받기(인트라넷 안 pnkMail 에 저장). 외부 주소로 보내기 · 받기는 도메인 연결 후 켠다.
//  pnkMail: { fromUid, fromName, fromAddr, to:[{uid,name,addr}], cc:[…], toUids:[받는 사람 uid(참조 포함)], subject, body,
//            readBy:{uid:ms}, trashBy:{uid:ms}, starBy:{uid:ms}, replyTo(원래 메일 id) }
import React from "react";
import { useSearchParams } from "react-router-dom";
import { useMeCtx } from "../App";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref as sref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";
import { MAIL_DOMAIN, fmtTime, kstDateTime, mailAddr, patchRow, useCol, useDocLive, where } from "../pnkApi";
import { Btn, Chip, Empty, Field, Hero, HeroBtn, Input, Loading, Modal, Textarea, cx, fail } from "../ui";
import Icon from "../icons";

const BOXES = [
  { key: "inbox", label: "받은메일함", icon: "inbox" },
  { key: "star", label: "중요 메일", icon: "star" },
  { key: "sent", label: "보낸메일함", icon: "send" },
  { key: "trash", label: "휴지통", icon: "trash" },
];
const sec = (m) => m.createdAt?.seconds || 0;

export default function Mail() {
  const me = useMeCtx();
  const uid = me.user.uid;
  const [sp, setSp] = useSearchParams();
  const openId = sp.get("id");
  const [box, setBox] = React.useState("inbox");
  const [q, setQ] = React.useState("");
  const [write, setWrite] = React.useState(null);
  const [inbox] = useCol("pnkMail", [where("toUids", "array-contains", uid)], [uid]);
  const [sent] = useCol("pnkMail", [where("fromUid", "==", uid)], [uid]);
  const [members] = useCol("pnkMembers", [where("status", "==", "active")], []);
  const myAddr = mailAddr(me.member);

  const all = React.useMemo(() => {
    const m = new Map();
    [...(inbox || []), ...(sent || [])].forEach((x) => m.set(x.id, x));
    return [...m.values()].sort((a, b) => sec(b) - sec(a));
  }, [inbox, sent]);
  const inBox = (m, k) => {
    const trashed = !!m.trashBy?.[uid];
    if (k === "trash") return trashed;
    if (trashed) return false;
    if (k === "inbox") return m.toUids?.includes(uid);
    if (k === "sent") return m.fromUid === uid;
    if (k === "star") return !!m.starBy?.[uid];
    return false;
  };
  const list = all.filter((m) => inBox(m, box) && (!q || `${m.subject} ${m.body} ${m.fromName}`.toLowerCase().includes(q.toLowerCase())));
  const unread = all.filter((m) => inBox(m, "inbox") && !m.readBy?.[uid]).length;
  const cur = openId ? all.find((m) => m.id === openId) : null;

  React.useEffect(() => {
    if (cur && cur.toUids?.includes(uid) && !cur.readBy?.[uid]) patchRow("pnkMail", cur.id, { [`readBy.${uid}`]: Date.now() }).catch(() => {});
  }, [cur, uid]);

  const [html, setHtml] = React.useState(false);
  const info = useDocLive("pnkCompany/info");
  const external = info?.mailExternal === true;
  const toggle = (m, k) => patchRow("pnkMail", m.id, { [`${k}.${uid}`]: m[k]?.[uid] ? null : Date.now() }).catch(fail);

  return (
    <div>
      <Hero title="사내메일" desc={<span className="tnum">{myAddr || "메일 주소 없음 — 관리자에게 요청"}</span>}>
        <Chip tone={external ? "green" : "gray"}>{external ? "외부 메일 연결됨" : "사내 전용"}</Chip>
        <HeroBtn icon="pen" onClick={() => setWrite({})}>메일 쓰기</HeroBtn>
      </Hero>

      {/* 메일함 · 목록 · 읽기를 한 판에 */}
      <div className="bg-white rounded-2xl border border-line overflow-hidden lg:grid lg:grid-cols-[190px_minmax(0,380px)_1fr] lg:h-[calc(100vh-170px)] lg:min-h-[480px]">
        {/* 메일함 */}
        <div className="flex lg:flex-col gap-1 p-2 overflow-x-auto no-scrollbar border-b lg:border-b-0 lg:border-r border-[#EEF1F6]">
          {BOXES.map((b) => (
            <button key={b.key} type="button" onClick={() => { setBox(b.key); setSp({}); }}
              className={cx("flex items-center gap-2.5 h-10 px-3 rounded-lg text-[13.5px] whitespace-nowrap transition", box === b.key ? "bg-navy text-white font-black" : "font-bold text-[#3A4A66] hover:bg-navy-50")}>
              <Icon name={b.icon} size={17} /><span className="flex-1 text-left">{b.label}</span>
              {b.key === "inbox" && unread > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-black flex items-center justify-center" style={{ background: "#FF3B30", color: "#fff" }}>{unread}</span>}
            </button>
          ))}
        </div>

        {/* 목록 */}
        <div className={cx("min-h-0 flex flex-col lg:border-r border-[#EEF1F6]", cur && "hidden lg:flex")}>
          <div className="p-3 border-b border-[#EEF1F6] relative"><Icon name="search" size={16} className="absolute left-6 top-6 text-[#7A8AA8]" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="메일 검색" className="pl-9" /></div>
          {!inbox || !sent ? <Loading /> : list.length === 0 ? <Empty icon="inbox">메일이 없습니다.</Empty> : (
            <ul className="divide-y divide-[#EEF1F6] flex-1 min-h-0 overflow-y-auto">
              {list.map((m) => {
                const isUnread = m.toUids?.includes(uid) && !m.readBy?.[uid];
                const who = box === "sent" ? `받는 사람: ${(m.to || []).map((x) => x.name || x.addr).join(", ")}` : m.fromName || m.fromAddr;
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => setSp({ id: m.id })} className={cx("w-full text-left px-4 py-3 flex gap-3 hover:bg-navy-50", m.id === openId && "bg-navy-50")}>
                      <div className={cx("w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-black shrink-0", isUnread ? "bg-navy text-white" : "bg-navy-100 text-navy")}>{(m.fromName || "?").slice(0, 1)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><span className={cx("truncate text-[13.5px] flex-1", isUnread ? "font-black" : "font-bold text-[#3A4A66]")}>{who}</span><span className="text-[11.5px] text-[#7A8AA8] shrink-0">{fmtTime(m.createdAt)}</span></div>
                        <div className={cx("truncate text-[13.5px]", isUnread ? "font-bold text-navy-950" : "text-[#3A4A66]")}>{m.starBy?.[uid] && "★ "}{m.external && <span className="text-[10.5px] font-black text-amber-700 mr-1">외부</span>}{m.extStatus === "failed" && <span className="text-[10.5px] font-black text-rose-600 mr-1">발송 실패</span>}{m.attachments?.length ? "📎 " : ""}{m.subject || "(제목 없음)"}</div>
                        <div className="truncate text-[12px] text-[#7A8AA8]">{String(m.body || "").slice(0, 70)}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 읽기 */}
        {cur ? (
          <div className="min-h-0 overflow-y-auto">
            <div className="px-5 md:px-7 pt-5 pb-4 border-b border-[#EEF1F6]">
              <button type="button" onClick={() => setSp({})} className="lg:hidden mb-3 text-[13px] font-bold text-navy-500">← 목록</button>
              <div className="flex items-start gap-2">
                <h2 className="flex-1 text-[19px] font-black leading-snug">{cur.subject || "(제목 없음)"}</h2>
                <button type="button" title="중요" onClick={() => toggle(cur, "starBy")} className={cx("w-9 h-9 rounded-lg flex items-center justify-center", cur.starBy?.[uid] ? "text-amber-500" : "text-[#C0C8D6] hover:text-navy")}><Icon name="star" size={18} /></button>
              </div>
              <div className="mt-3 text-[13px] space-y-0.5">
                <div><span className="text-[#7A8AA8] w-14 inline-block">보낸 사람</span><b>{cur.fromName}</b> <span className="text-[#7A8AA8] tnum">&lt;{cur.fromAddr}&gt;</span></div>
                <div><span className="text-[#7A8AA8] w-14 inline-block">받는 사람</span>{(cur.to || []).map((x) => `${x.name} <${x.addr}>`).join(", ")}</div>
                {cur.cc?.length > 0 && <div><span className="text-[#7A8AA8] w-14 inline-block">참조</span>{cur.cc.map((x) => x.name).join(", ")}</div>}
                <div><span className="text-[#7A8AA8] w-14 inline-block">날짜</span>{kstDateTime(cur.createdAt)}</div>
              </div>
            </div>
            {cur.fromUid === uid && cur.extStatus && (
              <div className={cx("mx-5 md:mx-7 mt-4 rounded-xl px-4 py-2.5 text-[13px] font-bold", cur.extStatus === "sent" ? "bg-emerald-50 text-emerald-700" : cur.extStatus === "failed" ? "bg-rose-50 text-rose-700" : "bg-navy-50 text-navy")}>
                외부 발송 {cur.extStatus === "sent" ? "완료" : cur.extStatus === "failed" ? `실패 — ${cur.extError || ""}` : "중…"} · {(cur.extTo || []).concat(cur.extCc || []).join(", ")}
              </div>
            )}
            {cur.direction === "in" && <div className="mx-5 md:mx-7 mt-4 rounded-xl px-4 py-2 text-[12.5px] font-bold bg-amber-50 text-amber-800">외부에서 온 메일입니다 — 모르는 사람이 보낸 링크 · 첨부는 조심해 주세요.</div>}
            {html && cur.html ? (
              <iframe title="원문" sandbox="" srcDoc={cur.html} className="mx-5 md:mx-7 my-5 w-[calc(100%-2.5rem)] md:w-[calc(100%-3.5rem)] h-[60vh] rounded-xl border border-line bg-white" />
            ) : (
              <div className="px-5 md:px-7 py-6 text-[15px] leading-[1.8] whitespace-pre-wrap break-words min-h-[200px]">{cur.body}</div>
            )}
            <Attachments list={cur.attachments} />
            <div className="px-5 md:px-7 py-3 border-t border-[#EEF1F6] flex flex-wrap gap-2">
              <Btn icon="reply" onClick={() => setWrite({ reply: cur })}>답장</Btn>
              <Btn kind="ghost" icon="send" onClick={() => setWrite({ forward: cur })}>전달</Btn>
              {cur.html && <Btn kind="ghost" icon="eye" onClick={() => setHtml((v) => !v)}>{html ? "글자로 보기" : "원문(HTML) 보기"}</Btn>}
              <Btn kind="ghost" icon="trash" onClick={() => toggle(cur, "trashBy").then(() => setSp({}))}>{cur.trashBy?.[uid] ? "휴지통에서 꺼내기" : "휴지통으로"}</Btn>
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex items-center justify-center"><Empty icon="mail">메일을 골라 주세요</Empty></div>
        )}
      </div>

      {write && <Compose external={external} me={me} members={members || []} init={write} onClose={() => setWrite(null)} onSent={() => { setWrite(null); setBox("sent"); }} />}
    </div>
  );
}

// 받는 사람: { uid?, name, addr } — uid 가 있으면 구성원(인트라넷 안으로 바로), 없으면 외부(서버가 발송 서버로 보냄)
function Compose({ me, members, init, onClose, onSent, external }) {
  const uid = me.user.uid;
  const r = init.reply; const fw = init.forward;
  const book = members.filter((m) => m.mailId);
  const asR = (m) => ({ uid: m.uid, name: m.name, addr: mailAddr(m) });
  const [to, setTo] = React.useState(() => {
    if (!r) return [];
    const m = book.find((x) => x.uid === r.fromUid);
    return m ? [asR(m)] : r.fromAddr ? [{ name: r.fromName || "", addr: r.fromAddr }] : [];
  });
  const [cc, setCc] = React.useState([]);
  const [text, setText] = React.useState("");
  const [subject, setSubject] = React.useState(r ? `RE: ${r.subject}` : fw ? `FW: ${fw.subject}` : "");
  const quote = (m) => `\n\n-----원본 메일-----\n보낸 사람: ${m.fromName} <${m.fromAddr}>\n날짜: ${kstDateTime(m.createdAt)}\n제목: ${m.subject}\n\n${m.body}`;
  const [body, setBody] = React.useState(r ? quote(r) : fw ? quote(fw) : "");
  const [files, setFiles] = React.useState([]);
  const [busy, setBusy] = React.useState("");
  const [field, setField] = React.useState("to");
  const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

  const add = (raw) => {
    const s = String(raw || "").trim().replace(/[,;]$/, "");
    if (!s) return;
    const low = s.toLowerCase();
    const m = book.find((x) => mailAddr(x) === low || x.name === s || x.mailId === low);
    let rcp = m ? asR(m) : null;
    if (!rcp) {
      if (!EMAIL.test(low)) { window.alert(`${s} — 구성원 이름 · 아이디나 메일 주소를 넣어 주세요.`); return; }
      if (low.endsWith(`@${MAIL_DOMAIN}`)) { window.alert(`${low} — 없는 사내 주소입니다.`); return; }
      if (!external) { window.alert(`${low} — 외부 메일(네이버 · 구글 등)은 아직 연결 전입니다.\n회사 정보 › 메일 서버에서 연결하면 보낼 수 있습니다.`); return; }
      rcp = { name: "", addr: low };
    }
    const setL = field === "cc" ? setCc : setTo;
    setL((l) => (l.some((x) => x.addr === rcp.addr) ? l : [...l, rcp]));
    setText("");
  };
  const sugg = text.trim() ? book.filter((m) => `${m.name} ${m.mailId} ${m.dept}`.toLowerCase().includes(text.trim().toLowerCase())).slice(0, 6) : [];
  const extOf = (l) => l.filter((x) => !x.uid).map((x) => x.addr);
  const send = async () => {
    if (!to.length) { window.alert("받는 사람을 넣어 주세요."); return; }
    if (!mailAddr(me.member)) { window.alert("내 메일 주소가 아직 없습니다. 관리자에게 메일 아이디를 받아 주세요."); return; }
    const total = files.reduce((a, f) => a + f.size, 0);
    if (files.some((f) => f.size >= 20 * 1048576)) { window.alert("파일 하나에 20MB 미만만 올릴 수 있습니다."); return; }
    if (extOf([...to, ...cc]).length && total > 15 * 1048576) { window.alert("외부로 보내는 메일은 첨부 합계 15MB까지입니다."); return; }
    setBusy("보내는 중…");
    try {
      const ref = doc(collection(db, "pnkMail"));
      const atts = [];
      for (const f of files) {
        setBusy(`첨부 올리는 중 ${atts.length + 1}/${files.length}`);
        const path = `pnk/mail/${ref.id}/${Date.now()}_${f.name.replace(/[/\\#?]/g, "_")}`;
        await uploadBytes(sref(storage, path), f, { contentType: f.type || "application/octet-stream" });
        atts.push({ name: f.name, path, size: f.size, type: f.type || "" });
      }
      const ext = extOf(to); const extCc = extOf(cc);
      await setDoc(ref, {
        fromUid: uid, fromName: me.member?.name || "", fromAddr: mailAddr(me.member),
        to, cc, toUids: [...new Set([...to, ...cc].filter((x) => x.uid).map((x) => x.uid))],
        subject: subject.trim(), body, attachments: atts, readBy: {}, trashBy: {}, starBy: {}, replyTo: r?.id || "",
        external: !!(ext.length || extCc.length), direction: ext.length || extCc.length ? "out" : "internal",
        extTo: ext, extCc, extStatus: ext.length || extCc.length ? "queued" : "",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      onSent();
    } catch (e) { fail(e); } finally { setBusy(""); }
  };
  const Chips = ({ list, set }) => list.map((m) => (
    <span key={m.addr} className={cx("inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-lg text-[12.5px] font-bold", m.uid ? "bg-navy-100 text-navy" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200")}>
      {m.name || ""} <span className="font-medium tnum opacity-80">{m.addr}</span>{!m.uid && <span className="text-[10.5px] font-black">외부</span>}
      <button type="button" onClick={() => set((l) => l.filter((x) => x.addr !== m.addr))} className="w-5 h-5 flex items-center justify-center"><Icon name="x" size={12} /></button></span>
  ));
  return (
    <Modal open wide title={r ? "답장" : fw ? "전달" : "메일 쓰기"} onClose={onClose}
      footer={<><span className="mr-auto text-[12px] text-[#7A8AA8] self-center">보내는 주소 <b className="tnum">{mailAddr(me.member) || "없음"}</b>{external ? " · 외부 메일 연결됨" : " · 구성원끼리만"}</span><Btn kind="ghost" onClick={onClose}>취소</Btn><Btn icon="send" onClick={send} disabled={!!busy}>{busy || "보내기"}</Btn></>}>
      <div className="space-y-3">
        {[["to", "받는 사람", to, setTo], ["cc", "참조", cc, setCc]].map(([k, label, list, set]) => (
          <Field key={k} label={label}>
            <div className="flex flex-wrap items-center gap-1.5 min-h-10 px-2 py-1.5 rounded-xl border border-[#DCE3EE] focus-within:border-navy-500 relative">
              <Chips list={list} set={set} />
              <input value={field === k ? text : ""} onFocus={() => setField(k)} onChange={(e) => { setField(k); setText(e.target.value); }}
                onBlur={() => { if (field === k && text.includes("@")) add(text); }}
                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === "," || e.key === ";") && !e.nativeEvent.isComposing) { e.preventDefault(); add(text); } }}
                placeholder={list.length ? "" : external ? "이름 · 아이디 · 외부 메일 주소" : "이름 또는 아이디 입력"} className="flex-1 min-w-[160px] h-7 outline-none text-[14px]" />
              {field === k && sugg.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white rounded-xl border border-line shadow-lg py-1">
                  {sugg.map((m) => (
                    <button key={m.uid} type="button" onMouseDown={(e) => { e.preventDefault(); set((l) => (l.some((x) => x.uid === m.uid) ? l : [...l, asR(m)])); setText(""); }}
                      className="w-full text-left px-3 py-2 hover:bg-navy-50 text-[13px]"><b>{m.name}</b> <span className="text-[#7A8AA8]">{m.dept} · {mailAddr(m)}</span></button>
                  ))}
                </div>
              )}
            </div>
          </Field>
        ))}
        <Field label="제목"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="내용"><Textarea rows={11} value={body} onChange={(e) => setBody(e.target.value)} autoFocus={!!r} /></Field>
        <div>
          <label className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl border border-dashed border-[#C9D3E4] text-[13px] font-bold text-[#5A6A86] cursor-pointer hover:border-navy-500">
            <Icon name="upload" size={16} />파일 첨부<input type="file" multiple className="hidden" onChange={(e) => setFiles((l) => [...l, ...e.target.files])} />
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">{files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-lg bg-navy-50 text-[12.5px] font-bold">{f.name} <span className="text-[#7A8AA8] font-medium">{fsize(f.size)}</span>
              <button type="button" onClick={() => setFiles((l) => l.filter((_, k) => k !== i))} className="w-5 h-5 flex items-center justify-center"><Icon name="x" size={12} /></button></span>
          ))}</div>
        </div>
      </div>
    </Modal>
  );
}

const fsize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
function Attachments({ list }) {
  if (!list?.length) return null;
  const open = async (a) => { try { window.open(await getDownloadURL(sref(storage, a.path)), "_blank"); } catch (e) { fail(e); } };
  return (
    <div className="px-5 md:px-7 pb-5 flex flex-wrap gap-2">
      {list.map((a) => (
        <button key={a.path} type="button" onClick={() => open(a)} className="flex items-center gap-2 h-10 px-3 rounded-xl border border-line hover:border-navy-500 text-[13px]">
          <Icon name="file" size={16} className="text-navy" /><b className="max-w-[220px] truncate">{a.name}</b><span className="text-[#7A8AA8]">{fsize(a.size || 0)}</span><Icon name="download" size={14} className="text-[#7A8AA8]" />
        </button>
      ))}
    </div>
  );
}
