// ======================= pnk-site/src/pages/Mail.jsx =======================
// 사내메일 — 구성원마다 아이디@logisweb.co.kr 주소(pnkMembers.mailId, 구성원 화면에서 관리자가 정함)
//  지금: 구성원끼리 주고받기(인트라넷 안 pnkMail 에 저장). 외부 주소로 보내기 · 받기는 도메인 연결 후 켠다.
//  pnkMail: { fromUid, fromName, fromAddr, to:[{uid,name,addr}], cc:[…], toUids:[받는 사람 uid(참조 포함)], subject, body,
//            readBy:{uid:ms}, trashBy:{uid:ms}, starBy:{uid:ms}, replyTo(원래 메일 id) }
import React from "react";
import { useSearchParams } from "react-router-dom";
import { useMeCtx } from "../App";
import { MAIL_DOMAIN, addRow, fmtTime, kstDateTime, mailAddr, patchRow, useCol, where } from "../pnkApi";
import { Btn, Card, Empty, Field, Input, Loading, Modal, Textarea, cx, fail } from "../ui";
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

  const toggle = (m, k) => patchRow("pnkMail", m.id, { [`${k}.${uid}`]: m[k]?.[uid] ? null : Date.now() }).catch(fail);

  return (
    <div>
      <section className="relative overflow-hidden rounded-[26px] px-6 md:px-8 py-6 text-white mb-5 shadow-[0_14px_34px_rgba(27,43,75,0.25)]" style={{ background: "linear-gradient(120deg, #1B2B4B 0%, #233B66 55%, #2D4C82 100%)" }}>
        <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-white/[0.06]" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <div className="text-[11px] font-extrabold tracking-[0.18em] text-blue-200/80">MAIL</div>
            <h1 className="mt-1 text-[24px] font-black">사내메일</h1>
            <p className="mt-1 text-[14px] text-blue-50/90">내 주소 <b className="tnum">{myAddr || "아직 없음 — 관리자에게 메일 아이디를 받아 주세요"}</b></p>
          </div>
          <button type="button" onClick={() => setWrite({})} className="flex items-center justify-center gap-2 h-11 px-5 rounded-2xl bg-white text-navy text-[14px] font-black shadow"><Icon name="pen" size={17} />메일 쓰기</button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_minmax(0,380px)_1fr] gap-4">
        {/* 메일함 */}
        <div className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar">
          {BOXES.map((b) => (
            <button key={b.key} type="button" onClick={() => { setBox(b.key); setSp({}); }}
              className={cx("flex items-center gap-2.5 h-11 px-3.5 rounded-xl text-[13.5px] font-bold whitespace-nowrap transition", box === b.key ? "bg-navy text-white" : "bg-white border border-line text-[#3A4A66] hover:border-navy-500")}>
              <Icon name={b.icon} size={17} /><span className="flex-1 text-left">{b.label}</span>
              {b.key === "inbox" && unread > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-black flex items-center justify-center" style={{ background: "#FF3B30", color: "#fff" }}>{unread}</span>}
            </button>
          ))}
          <div className="hidden lg:block mt-3 rounded-2xl bg-white border border-line p-3.5 text-[12px] leading-relaxed text-[#5A6A86]">
            <b className="text-navy">외부 메일 연결 전</b><br />지금은 PnK 구성원끼리만 주고받습니다. <span className="tnum">@{MAIL_DOMAIN}</span> 도메인 연결 후 외부로도 보내고 받습니다.
          </div>
        </div>

        {/* 목록 */}
        <Card pad={false} className={cx(cur && "hidden lg:block")}>
          <div className="p-3 border-b border-[#EEF1F6] relative"><Icon name="search" size={16} className="absolute left-6 top-6 text-[#7A8AA8]" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="메일 검색" className="pl-9" /></div>
          {!inbox || !sent ? <Loading /> : list.length === 0 ? <Empty icon="inbox">메일이 없습니다.</Empty> : (
            <ul className="divide-y divide-[#EEF1F6] max-h-[70vh] overflow-y-auto">
              {list.map((m) => {
                const isUnread = m.toUids?.includes(uid) && !m.readBy?.[uid];
                const who = box === "sent" ? `받는 사람: ${(m.to || []).map((x) => x.name).join(", ")}` : m.fromName;
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => setSp({ id: m.id })} className={cx("w-full text-left px-4 py-3 flex gap-3 hover:bg-navy-50", m.id === openId && "bg-navy-50")}>
                      <div className={cx("w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-black shrink-0", isUnread ? "bg-navy text-white" : "bg-navy-100 text-navy")}>{(m.fromName || "?").slice(0, 1)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><span className={cx("truncate text-[13.5px] flex-1", isUnread ? "font-black" : "font-bold text-[#3A4A66]")}>{who}</span><span className="text-[11.5px] text-[#7A8AA8] shrink-0">{fmtTime(m.createdAt)}</span></div>
                        <div className={cx("truncate text-[13.5px]", isUnread ? "font-bold text-navy-950" : "text-[#3A4A66]")}>{m.starBy?.[uid] && "★ "}{m.subject || "(제목 없음)"}</div>
                        <div className="truncate text-[12px] text-[#7A8AA8]">{String(m.body || "").slice(0, 70)}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* 읽기 */}
        {cur ? (
          <Card pad={false}>
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
            <div className="px-5 md:px-7 py-6 text-[15px] leading-[1.8] whitespace-pre-wrap break-words min-h-[200px]">{cur.body}</div>
            <div className="px-5 md:px-7 py-3 border-t border-[#EEF1F6] flex flex-wrap gap-2">
              <Btn icon="reply" onClick={() => setWrite({ reply: cur })}>답장</Btn>
              <Btn kind="ghost" icon="send" onClick={() => setWrite({ forward: cur })}>전달</Btn>
              <Btn kind="ghost" icon="trash" onClick={() => toggle(cur, "trashBy").then(() => setSp({}))}>{cur.trashBy?.[uid] ? "휴지통에서 꺼내기" : "휴지통으로"}</Btn>
            </div>
          </Card>
        ) : (
          <Card className="hidden lg:flex items-center justify-center"><Empty icon="mail">메일을 고르면 여기에 내용이 보입니다.</Empty></Card>
        )}
      </div>

      {write && <Compose me={me} members={members || []} init={write} onClose={() => setWrite(null)} onSent={() => { setWrite(null); setBox("sent"); }} />}
    </div>
  );
}

function Compose({ me, members, init, onClose, onSent }) {
  const uid = me.user.uid;
  const r = init.reply; const fw = init.forward;
  const book = members.filter((m) => m.mailId);
  const findM = (u) => book.find((m) => m.uid === u);
  const [to, setTo] = React.useState(() => (r ? [findM(r.fromUid)].filter(Boolean) : []));
  const [cc, setCc] = React.useState([]);
  const [text, setText] = React.useState("");
  const [subject, setSubject] = React.useState(r ? `RE: ${r.subject}` : fw ? `FW: ${fw.subject}` : "");
  const quote = (m) => `\n\n-----원본 메일-----\n보낸 사람: ${m.fromName} <${m.fromAddr}>\n날짜: ${kstDateTime(m.createdAt)}\n제목: ${m.subject}\n\n${m.body}`;
  const [body, setBody] = React.useState(r ? quote(r) : fw ? quote(fw) : "");
  const [busy, setBusy] = React.useState(false);
  const [field, setField] = React.useState("to");

  const add = (raw) => {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) return;
    const m = book.find((x) => mailAddr(x) === s || x.mailId === s.split("@")[0] && s.endsWith(`@${MAIL_DOMAIN}`) || x.name === raw.trim() || x.mailId === s);
    if (!m) { window.alert(`${raw} — 구성원 주소가 아닙니다.\n외부 주소(네이버 · 구글 등)로 보내기는 도메인 연결 후 사용할 수 있습니다.`); return; }
    const setL = field === "cc" ? setCc : setTo;
    setL((l) => (l.some((x) => x.uid === m.uid) ? l : [...l, m]));
    setText("");
  };
  const sugg = text.trim() ? book.filter((m) => `${m.name} ${m.mailId} ${m.dept}`.toLowerCase().includes(text.trim().toLowerCase())).slice(0, 6) : [];
  const send = async () => {
    if (!to.length) { window.alert("받는 사람을 넣어 주세요."); return; }
    if (!mailAddr(me.member)) { window.alert("내 메일 주소가 아직 없습니다. 관리자에게 메일 아이디를 받아 주세요."); return; }
    setBusy(true);
    const pack = (l) => l.map((m) => ({ uid: m.uid, name: m.name, addr: mailAddr(m) }));
    try {
      await addRow("pnkMail", {
        fromUid: uid, fromName: me.member?.name || "", fromAddr: mailAddr(me.member),
        to: pack(to), cc: pack(cc), toUids: [...new Set([...to, ...cc].map((m) => m.uid))],
        subject: subject.trim(), body, readBy: {}, trashBy: {}, starBy: {}, replyTo: r?.id || "", external: false,
      });
      onSent();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const Chips = ({ list, set }) => list.map((m) => (
    <span key={m.uid} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-lg bg-navy-100 text-navy text-[12.5px] font-bold">{m.name} <span className="text-[#5A6A86] font-medium tnum">{mailAddr(m)}</span>
      <button type="button" onClick={() => set((l) => l.filter((x) => x.uid !== m.uid))} className="w-5 h-5 flex items-center justify-center"><Icon name="x" size={12} /></button></span>
  ));
  return (
    <Modal open wide title={r ? "답장" : fw ? "전달" : "메일 쓰기"} onClose={onClose}
      footer={<><span className="mr-auto text-[12px] text-[#7A8AA8] self-center">보내는 주소 <b className="tnum">{mailAddr(me.member) || "없음"}</b></span><Btn kind="ghost" onClick={onClose}>취소</Btn><Btn icon="send" onClick={send} disabled={busy}>{busy ? "보내는 중…" : "보내기"}</Btn></>}>
      <div className="space-y-3">
        {[["to", "받는 사람", to, setTo], ["cc", "참조", cc, setCc]].map(([k, label, list, set]) => (
          <Field key={k} label={label}>
            <div className="flex flex-wrap items-center gap-1.5 min-h-10 px-2 py-1.5 rounded-xl border border-[#DCE3EE] focus-within:border-navy-500 relative">
              <Chips list={list} set={set} />
              <input value={field === k ? text : ""} onFocus={() => setField(k)} onChange={(e) => { setField(k); setText(e.target.value); }}
                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && !e.nativeEvent.isComposing) { e.preventDefault(); add(text); } }}
                placeholder={list.length ? "" : "이름 또는 아이디 입력"} className="flex-1 min-w-[140px] h-7 outline-none text-[14px]" />
              {field === k && sugg.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white rounded-xl border border-line shadow-lg py-1">
                  {sugg.map((m) => (
                    <button key={m.uid} type="button" onMouseDown={(e) => { e.preventDefault(); set((l) => (l.some((x) => x.uid === m.uid) ? l : [...l, m])); setText(""); }}
                      className="w-full text-left px-3 py-2 hover:bg-navy-50 text-[13px]"><b>{m.name}</b> <span className="text-[#7A8AA8]">{m.dept} · {mailAddr(m)}</span></button>
                  ))}
                </div>
              )}
            </div>
          </Field>
        ))}
        <Field label="제목"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="내용"><Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} autoFocus={!!r} /></Field>
      </div>
    </Modal>
  );
}
