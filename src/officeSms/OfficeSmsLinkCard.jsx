// ======================= src/officeSms/OfficeSmsLinkCard.jsx =======================
// 💬 2026-11-18 사내문자 — 업무폰("LogisWeb 업무폰" 앱) 설정 화면의 "업무폰 문자 연결" 카드
//  [연결하기] → 문자 권한 허용 → 이 휴대폰이 PC 사내문자 창과 문자를 주고받는다(KpSmsPlugin · KpSmsService)
//  · 앱(APK) 안에서만 보인다. 브라우저 · 아이폰에서는 안내만.
//  · 연결 정보(로그인 토큰)는 이 휴대폰 안에만 저장된다. [연결 끊기]를 누르면 지운다.
//  ⚠ Capacitor 플러그인 객체는 thenable처럼 보여 Promise로 넘기면 멈춘다(DriverHome.jsx 주석) — 메서드만 바로 부른다
import React from "react";
import { registerPlugin } from "@capacitor/core";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { kpConfirm, kpAlert } from "../kpDialog";
import { watchBox } from "./officeSmsStore";
import { phoneState, timeLabel } from "./officeSmsCore";

const KpSms = registerPlugin("KpSms");
// 📦 "LogisWeb 업무폰" 앱(smslink) — 문자 권한은 이 앱에만 있다. 기사앱 · LogisWeb 앱에 넣으면 Play 프로텍트가 설치를 막는다
const APK_URL = "https://github.com/sungwoo0923/dispatch-app2/releases/download/logisweb-apk-latest/LogisWeb-SMS.apk";

const isNative = () => { try { return !!window.Capacitor?.isNativePlatform?.(); } catch { return false; } };
const hasPlugin = () => { try { return !!window.Capacitor?.isPluginAvailable?.("KpSms"); } catch { return false; } };

export default function OfficeSmsLinkCard({ currentUser, Card, Row, go, showSuccess }) {
  const uid = currentUser?.uid || "";
  const [st, setSt] = React.useState(null);
  const [box, setBox] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const native = isNative();
  const plugin = native && hasPlugin();
  const unsupported = plugin && st && st.supported === false; // 플레이스토어 앱 · 예전 APK

  const refresh = React.useCallback(() => {
    if (!plugin) return;
    try { KpSms.status().then((s) => setSt(s)).catch(() => {}); } catch { /* 무시 */ }
  }, [plugin]);
  React.useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    const v = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [refresh]);
  React.useEffect(() => watchBox(uid, setBox), [uid]);

  const mine = !!st?.linked && st.uid === uid;
  const other = !!st?.linked && st.uid && st.uid !== uid;
  const server = phoneState(box);

  const link = async () => {
    if (busy || !uid) return;
    const ok = await kpConfirm(
      "이 휴대폰을 내 업무폰으로 연결할까요?\n\n· PC 배차 프로그램에서 보낸 문자를 이 휴대폰이 보내요\n· 이 휴대폰에 온 문자(최근 2일부터)를 PC 사내문자 창에 보여줘요\n· 🔒 문자는 나만 볼 수 있어요. 관리자도 못 봐요\n\n다음 화면에서 문자 권한을 [허용]해 주세요.",
      { title: "업무폰 문자 연결", okText: "연결하기" });
    if (!ok) return;
    const u = auth.currentUser;
    if (!u?.refreshToken) { await kpAlert("로그인 정보를 찾지 못했어요. 다시 로그인한 뒤 해 주세요."); return; }
    setBusy(true);
    try {
      const s = await KpSms.link({ uid, refreshToken: u.refreshToken, apiKey: auth.app.options.apiKey, projectId: auth.app.options.projectId, backfillDays: 2 });
      setSt(s);
      await setDoc(doc(db, "smsBox", uid), { linked: true, device: s?.device || "", linkedAt: serverTimestamp() }, { merge: true }).catch(() => {});
      if (s && !s.ignoringBattery) {
        const b = await kpConfirm("화면이 꺼져 있어도 문자가 끊기지 않게 '배터리 사용 제한 없음'으로 바꿀게요.\n다음 화면에서 [허용]을 눌러 주세요.", { title: "배터리 설정", okText: "바꾸기" });
        if (b) { try { await KpSms.requestIgnoreBattery(); } catch { /* 무시 */ } }
      }
      showSuccess?.("업무폰 연결 완료 · PC 사내문자 창에서 확인해 보세요");
    } catch (e) {
      const m = String(e?.message || e);
      if (m.includes("NOT_AUTHORIZED")) {
        const open = await kpConfirm("문자 권한이 꺼져 있어 연결하지 못했어요.\n\n[앱 설정 열기] → 권한 → SMS → 허용으로 바꿔 주세요.\n\n'제한된 설정' 안내가 뜨면: 앱 정보 화면 오른쪽 위 ⋮ → [제한된 설정 허용]을 먼저 눌러 주세요.", { title: "문자 권한 필요", okText: "앱 설정 열기" });
        if (open) { try { await KpSms.openAppSettings(); } catch { /* 무시 */ } }
      } else await kpAlert(`연결하지 못했어요\n${m}`);
    } finally { setBusy(false); refresh(); }
  };

  const unlink = async () => {
    const ok = await kpConfirm("업무폰 문자 연결을 끊을까요?\nPC 사내문자 창에서 이 휴대폰으로 문자를 보낼 수 없게 돼요.\n(지금까지 주고받은 대화는 PC 창에 남아요)", { title: "연결 끊기", okText: "끊기", danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      const s = await KpSms.unlink();
      setSt(s);
      // 다른 계정이 연결해 둔 폰이면 그 계정 문서는 건드리지 못한다(규칙) — 내 것만
      if (mine) await setDoc(doc(db, "smsBox", uid), { linked: false, unlinkedAt: serverTimestamp() }, { merge: true }).catch(() => {});
      showSuccess?.("연결을 끊었어요");
    } catch (e) { await kpAlert(`끊지 못했어요\n${e?.message || e}`); }
    finally { setBusy(false); refresh(); }
  };

  const perm = st ? [st.send ? null : "보내기", st.read ? null : "읽기", st.receive ? null : "받기"].filter(Boolean) : [];
  const sub = !native ? "LogisWeb 앱(안드로이드)에서만 켤 수 있어요"
    : (!plugin || unsupported) ? "문자 기능은 'LogisWeb 업무폰' 앱에만 있어요 — 설치할 때 Play 프로텍트를 잠깐 꺼 주세요"
      : mine ? (st.authError ? `⚠ ${st.authError}` : `${server.label}${server.lastMs ? ` · ${timeLabel(server.lastMs)}` : ""}`)
        : other ? "다른 계정에 연결돼 있어요"
          : "PC 배차 프로그램에서 이 휴대폰으로 문자를 보내고 받아요";

  return (
    <Card en="OFFICE SMS" title="업무폰 문자 연결" flush>
      <Row label={mine ? "● 이 휴대폰 연결됨" : "업무폰 문자 연결"} sub={sub}
        onClick={!native || busy ? undefined : (!plugin || unsupported) ? () => { window.location.href = APK_URL; } : mine ? undefined : link}
        right={!native ? null : (!plugin || unsupported) ? go("업무폰 앱 받기") : mine ? null : go(busy ? "…" : other ? "이 계정으로" : "연결하기")} />
      {mine && perm.length > 0 && (
        <Row label="문자 권한" sub={`꺼진 권한: ${perm.join(" · ")} — 앱 설정 › 권한 › SMS에서 허용`} onClick={() => { try { KpSms.openAppSettings(); } catch { /* 무시 */ } }} right={go("열기")} />
      )}
      {mine && st && !st.ignoringBattery && (
        <Row label="배터리 사용 제한 없음" sub="화면이 꺼져도 문자가 끊기지 않게" onClick={() => { try { KpSms.requestIgnoreBattery(); } catch { /* 무시 */ } }} right={go("바꾸기")} />
      )}
      {mine && st?.authError && <Row label="다시 연결" sub="비밀번호를 바꿨으면 다시 연결해 주세요" onClick={link} right={go("연결")} />}
      {(mine || other) && <Row label="연결 끊기" sub="이 휴대폰에 저장한 연결 정보를 지워요" onClick={busy ? undefined : unlink} right={go("끊기")} />}
    </Card>
  );
}
