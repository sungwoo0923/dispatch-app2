// ======================= src/promo/PromoHub.jsx =======================
// 📣 2026-11-23 관리자센터 › 홍보 — 영상 편집실 · 블로그 원고를 서로 잇는다(블로그 글 → 숏츠 대본 → 영상 편집실에서 열기)
import React from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { G } from "../adminCenter/admUi";
import VideoEditor, { scriptToProject } from "./VideoEditor";
import BlogEditor from "./BlogEditor";
import { mktCall } from "./promoKit";

const OPEN_KEY = "kpOpenVideo";
export function PromoVideo() {
  const [initial] = React.useState(() => { try { const v = sessionStorage.getItem(OPEN_KEY) || ""; sessionStorage.removeItem(OPEN_KEY); return v; } catch { return ""; } });
  return <VideoEditor initialId={initial} />;
}
export function PromoBlog({ go }) {
  const [busy, setBusy] = React.useState("");
  const makeVideo = async (post) => {
    setBusy("이 글로 숏츠 대본을 쓰는 중… (20~40초)");
    try {
      const r = await mktCall("videoScript", { topic: post.title, format: "shorts", seconds: 25, source: `${post.title}\n\n${post.body}` });
      const p = scriptToProject(r.out, "shorts", post.title); p.fromBlog = post.id || "";
      const ref = await addDoc(collection(db, "mktVideos"), { ...JSON.parse(JSON.stringify(p)), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      try { sessionStorage.setItem(OPEN_KEY, ref.id); } catch { /* 무시 */ }
      go?.("mkt:video");
    } catch (e) { setBusy(e.message); return; }
    setBusy("");
  };
  return <>{busy && <div className="mb-3 text-[13px] font-bold" style={{ color: G.gold }}>{busy}</div>}<BlogEditor onMakeVideo={makeVideo} /></>;
}
