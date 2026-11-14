// ======================= functions/companyMailInbox.js =======================
// 📥 2026-11-14 회사 메일함 › 받은메일 — 회사정보 › 메일 설정에 등록한 메일 계정(같은 앱 비밀번호)의 받은편지함을 IMAP으로 읽는다
//  · 보낸메일은 지금처럼 emailLogs(프로그램이 보낸 기록) · 받은메일은 여기(메일 서버에 있는 그대로 — 프로그램에 따로 저장하지 않음)
//  · 호출형 companyMailInbox { action: "list", limit, before } → 최근 메일 목록(보낸 사람 · 제목 · 날짜 · 읽음 · 첨부)
//                            { action: "get", uid } → 본문(html · text) · 첨부 이름(읽음 표시는 바꾸지 않는다 — 읽기 전용)
//  · 볼 수 있는 사람: 회사 관리자 · 경리(메일 설정을 바꿀 수 있는 사람과 같은 기준 + 경리 · 회계 · 재무 팀)
//  · IMAP 서버: 메일 서비스별 받는 서버(아래 IMAP) · 직접 입력은 smtp.→imap. 으로 바꿔 993(SSL)
const IMAP = {
  daum: "imap.daum.net", naver: "imap.naver.com", gmail: "imap.gmail.com", outlook: "outlook.office365.com", nate: "imap.nate.com",
};
const imapHostOf = (st = {}, smtpHost = "") => IMAP[st.preset] || (st.imapHost ? String(st.imapHost) : String(smtpHost || "").replace(/^smtp\./, "imap."));
const MAX_LIST = 60;
const addr = (a) => (a?.value || a || []).map?.((x) => ({ name: String(x.name || ""), address: String(x.address || "") })) || [];
const imapErrorText = (e, preset = "") => {
  const m = String(e?.responseText || e?.message || e || "");
  if (/auth|login|credentials|password|AUTHENTICATIONFAILED/i.test(m)) return preset === "naver" || preset === "daum"
    ? "메일 계정의 IMAP 사용이 꺼져 있거나 앱 비밀번호가 맞지 않아요. 메일 › 환경설정 › POP3/IMAP 에서 IMAP 사용을 켜 주세요"
    : "메일 서버 로그인에 실패했어요. 메일 설정의 앱 비밀번호와 IMAP 사용 여부를 확인해 주세요";
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|timed? ?out|ETIMEDOUT/i.test(m)) return "받는 메일 서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요";
  return "받은메일을 불러오지 못했어요. 잠시 뒤 다시 해 주세요";
};

function makeCompanyMailInbox({ HttpsError, mail, getImapFlow, getParser, log = console }) {
  const err = (code, msg) => new HttpsError(code, msg);
  return async function companyMailInbox(data = {}, context) {
    const w = await mail.who(context, data);
    const finTeam = /경리|회계|재무/.test(String(w.u?.team || ""));
    if (!(w.admin || finTeam || ["hrAcct", "test"].includes(w.role))) throw err("permission-denied", "받은메일은 회사 관리자 · 경리만 볼 수 있어요");
    const { st, smtp, user, pass } = await mail.loadSender(w.company);
    const host = imapHostOf(st, smtp.host);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) throw err("failed-precondition", "받는 메일 서버를 알 수 없어요");
    const ImapFlow = getImapFlow();
    const client = new ImapFlow({ host, port: 993, secure: true, auth: { user, pass }, logger: false, socketTimeout: 25000, greetingTimeout: 12000 });
    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const total = client.mailbox?.exists || 0;
        if (data.action === "get") {
          const uid = Number(data.uid);
          if (!(uid > 0)) throw err("invalid-argument", "메일을 다시 골라 주세요");
          const msg = await client.fetchOne(String(uid), { source: true, flags: true }, { uid: true });
          if (!msg?.source) throw err("not-found", "메일을 찾지 못했어요(지워졌을 수 있어요)");
          if (msg.source.length > 15 * 1024 * 1024) throw err("resource-exhausted", "메일이 너무 커서 여기서 열 수 없어요. 메일 사이트에서 열어 주세요");
          const p = await getParser()(msg.source);
          return {
            uid, subject: String(p.subject || ""), date: p.date ? p.date.getTime() : 0,
            from: addr(p.from), to: addr(p.to), cc: addr(p.cc),
            html: p.html ? String(p.html).slice(0, 2 * 1024 * 1024) : "", text: p.html ? "" : String(p.text || "").slice(0, 400000),
            attachments: (p.attachments || []).map((a) => ({ filename: String(a.filename || "첨부"), size: a.size || 0, contentType: String(a.contentType || "") })),
          };
        }
        // list — 최근 것부터
        const limit = Math.min(MAX_LIST, Math.max(10, Number(data.limit) || 40));
        const end = Number(data.before) > 1 ? Math.min(total, Number(data.before) - 1) : total;
        if (end < 1) return { total, items: [], next: 0 };
        const start = Math.max(1, end - limit + 1);
        const items = [];
        for await (const m of client.fetch(`${start}:${end}`, { uid: true, envelope: true, flags: true, bodyStructure: true, size: true })) {
          const e = m.envelope || {};
          const hasAtt = JSON.stringify(m.bodyStructure || {}).includes('"disposition":"attachment"');
          items.push({ uid: m.uid, seq: m.seq, subject: String(e.subject || "(제목 없음)"), date: e.date ? new Date(e.date).getTime() : 0,
            from: (e.from || []).map((x) => ({ name: String(x.name || ""), address: String(x.address || "") })),
            seen: !!m.flags?.has?.("\\Seen"), attach: hasAtt, size: m.size || 0 });
        }
        items.sort((a, b) => b.seq - a.seq);
        return { total, items, next: start > 1 ? start : 0, account: user };
      } finally { lock.release(); }
    } catch (e) {
      if (e instanceof HttpsError || e?.httpErrorCode) throw e;
      log.warn("[회사 메일함] IMAP 실패:", e?.message || e);
      throw err("unavailable", imapErrorText(e, st.preset));
    } finally {
      try { await client.logout(); } catch { /* 무시 */ }
    }
  };
}

module.exports = { makeCompanyMailInbox, imapHostOf, imapErrorText };
