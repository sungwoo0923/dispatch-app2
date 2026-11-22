// ======================= src/trafficCctv.jsx =======================
// 🚦 2026-11-22 관제센터 1단계 — 돌발상황 근처 도로 CCTV 보기
//  · 어느 지도(Leaflet · Tmap · React 밖)에서도 openCctv(돌발) 하나로 띄운다.
//  · 영상은 ITS가 주는 실시간 스트리밍(HLS). 크롬 · 엣지는 hls.js(필요할 때만 받음), 사파리 · 아이폰은 기본 재생.
import React from "react";
import { createRoot } from "react-dom/client";
import { fetchCctvNear, kindMeta, eventTitle, eventTimeText, prettyMessage } from "./trafficCore";

const Z = 10000090;
let _host = null, _root = null;

export function openCctv(ev) {
  if (typeof document === "undefined" || !ev) return;
  if (!_host) { _host = document.createElement("div"); _host.setAttribute("data-kp", "cctv-host"); document.body.appendChild(_host); _root = createRoot(_host); }
  _root.render(<CctvModal key={ev.id || `${ev.lat},${ev.lng}`} ev={ev} onClose={() => _root.render(null)} />);
}

function HlsVideo({ url }) {
  const ref = React.useRef(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    const v = ref.current;
    if (!v || !url) return undefined;
    setErr("");
    let hls = null, alive = true;
    const isHls = /\.m3u8(\?|$)/i.test(url) || /hls/i.test(url);
    if (!isHls || v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = url; v.play().catch(() => {});
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (!alive) return;
        if (!Hls.isSupported()) { v.src = url; return; }
        hls = new Hls({ lowLatencyMode: true, maxBufferLength: 10 });
        hls.on(Hls.Events.ERROR, (_e, d) => { if (d?.fatal) setErr("영상을 불러오지 못했어요"); });
        hls.loadSource(url); hls.attachMedia(v);
        v.play().catch(() => {});
      }).catch(() => setErr("영상 재생기를 불러오지 못했어요"));
    }
    const onErr = () => setErr("영상을 불러오지 못했어요");
    v.addEventListener("error", onErr);
    return () => { alive = false; v.removeEventListener("error", onErr); if (hls) hls.destroy(); v.removeAttribute("src"); v.load(); };
  }, [url]);
  const insecure = typeof location !== "undefined" && location.protocol === "https:" && /^http:/i.test(url);
  return (
    <div style={{ position: "relative", background: "#000", borderRadius: 14, overflow: "hidden", aspectRatio: "16/9" }}>
      <video ref={ref} muted playsInline autoPlay controls style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      {(err || insecure) && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "rgba(0,0,0,.72)", color: "#E6EEFF", fontSize: 13, fontWeight: 700, textAlign: "center", padding: 16 }}>
          {insecure ? "이 CCTV는 보안 연결(https)을 지원하지 않아 여기서 바로 재생되지 않아요" : err}
          <a href={url} target="_blank" rel="noreferrer" style={{ color: "#8FB0F0", fontWeight: 800 }}>새 창에서 열기 ↗</a>
        </div>
      )}
    </div>
  );
}

function CctvModal({ ev, onClose }) {
  const [st, setSt] = React.useState({ loading: true, items: [], reason: "" });
  const [pick, setPick] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    fetchCctvNear(ev.lat, ev.lng)
      .then((v) => alive && setSt({ loading: false, items: v.items, reason: v.ok ? "" : v.reason }))
      .catch(() => alive && setSt({ loading: false, items: [], reason: "error" }));
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => { alive = false; window.removeEventListener("keydown", k); };
  }, [ev, onClose]);
  const m = kindMeta(ev);
  const cur = st.items[pick];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: Z, background: "rgba(6,12,26,.66)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
      <div onClick={(e) => e.stopPropagation()} data-kp="cctv-modal"
        style={{ width: "min(720px,100%)", maxHeight: "100%", overflowY: "auto", borderRadius: 20, background: "linear-gradient(160deg,#0F1A30,#0B1428)", border: "1px solid rgba(143,176,240,.25)", color: "#fff", padding: 16, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 30px 80px rgba(0,0,0,.55)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{m.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 900, color: m.color }}>{m.label} — {prettyMessage(ev.msg, ev.road).where || eventTitle(ev)}</div>
            <div style={{ marginTop: 4, fontSize: 12.5, fontWeight: 600, color: "rgba(207,224,255,.75)", lineHeight: 1.5 }}>
              {(() => { const pm = prettyMessage(ev.msg, ev.road); return [eventTimeText(ev), pm.lanes || (ev.lanes && `${ev.lanes} 차단`), ...pm.lines.slice(0, 2)].filter(Boolean).join(" · "); })()}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" style={{ width: 34, height: 34, borderRadius: 11, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.05)", color: "#E6EEFF", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
        {st.loading && <div style={{ padding: 30, textAlign: "center", fontSize: 13, color: "rgba(207,224,255,.7)", fontWeight: 700 }}>근처 CCTV를 찾는 중…</div>}
        {!st.loading && !cur && (
          <div style={{ padding: "26px 10px", textAlign: "center", fontSize: 13, color: "rgba(207,224,255,.75)", fontWeight: 700, lineHeight: 1.6 }}>
            {st.reason === "no-key" ? "CCTV는 ITS 인증키를 연결하면 볼 수 있어요" : "이 근처(약 6km)에는 볼 수 있는 CCTV가 없어요"}
          </div>
        )}
        {cur && (
          <>
            <HlsVideo url={cur.url} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {st.items.map((c, i) => (
                <button key={`${c.url}-${i}`} type="button" onClick={() => setPick(i)}
                  style={{ height: 30, padding: "0 10px", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 800, border: `1px solid ${i === pick ? "#8FB0F0" : "rgba(143,176,240,.2)"}`, background: i === pick ? "rgba(143,176,240,.2)" : "rgba(255,255,255,.04)", color: "#E6EEFF" }}>
                  {c.name} <span style={{ opacity: 0.65, fontWeight: 700 }}>{c.km < 1 ? `${Math.round(c.km * 1000)}m` : `${c.km.toFixed(1)}km`}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div style={{ fontSize: 10.5, color: "rgba(207,224,255,.45)", fontWeight: 600 }}>자료: 국가교통정보센터(ITS) · 1~2분마다 새로 받아요</div>
      </div>
    </div>
  );
}
