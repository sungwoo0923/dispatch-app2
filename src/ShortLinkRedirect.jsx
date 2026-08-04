// ======================= src/ShortLinkRedirect.jsx =======================
// 기사전달용 짧은 업로드 링크(/u/{code}) — 로그인 없이 code로 원본 오더id/토큰을
// 조회해 실제 업로드 페이지(/upload?id=...&t=...)로 넘겨준다.
import React, { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

function CenteredMsg({ text }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "sans-serif", color: "#1B2B4B", fontSize: 15, fontWeight: 600, padding: 20, textAlign: "center",
    }}>
      {text}
    </div>
  );
}

export default function ShortLinkRedirect({ code }) {
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "shortLinks", code));
        if (cancelled) return;
        if (!snap.exists()) { setStatus("notfound"); return; }
        const { id, t } = snap.data();
        window.location.replace(`/upload?id=${id}&t=${t}`);
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (status === "notfound") return <CenteredMsg text="링크를 찾을 수 없습니다. 담당자에게 새 링크를 요청해주세요." />;
  if (status === "error") return <CenteredMsg text="오류가 발생했습니다. 잠시 후 다시 시도해주세요." />;
  return <CenteredMsg text="이동 중입니다..." />;
}
