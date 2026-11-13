// ===================== src/ErrorBoundary.jsx =====================
// 화면 어딘가에서 예상 못한 JS 오류(예: 렌더링 중 ReferenceError 등)가 나면
// 리액트는 기본적으로 화면 전체를 새하얗게 지워버린다(백지 화면). 특히
// 모바일에서 이런 일이 생기면 사용자는 뭐가 잘못됐는지 전혀 알 수 없고
// 새로고침 방법도 못 찾는 경우가 많다. 앱 전체를 이 경계로 감싸서, 오류가
// 나면 백지 대신 "새로고침" 버튼이 있는 안내 화면을 보여주고, 실제 오류
// 내용은 콘솔에 그대로 남겨 나중에 원인 파악에 쓸 수 있게 한다.
import React from "react";

// 🛠 2026-11-14 새 버전이 올라간 뒤 예전 화면에서 아직 안 받은 메뉴(예: 인수증관리)를 열면 그 조각 파일이 서버에 없다(404).
//  preloadError 를 막아 둔 탓에 import 가 빈 값으로 끝나 "Cannot read properties of undefined (reading 'default')"로 나타난다
//  → 조각 파일을 못 받은 직후의 이 오류도 같은 경우로 보고 한 번 새로고침한다(새 버전 화면으로 열린다)
const isStaleLazyError = (e) => { try { return /Cannot read propert(y|ies) of undefined \(reading '|undefined is not an object \(evaluating '|\.default is undefined|is undefined$/i.test(String(e?.message || e || "")) && Date.now() - Number(window.__kpPreloadFailed || 0) < 60000; } catch { return false; } };
export const isChunkLoadError = (e) => isStaleLazyError(e) || /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed|Unable to preload CSS/i.test(String(e?.message || e || ""));
export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem("kpChunkReloadAt") || 0);
    if (Date.now() - last < 30000) return false; // 30초 안에 또 실패하면 무한 새로고침 방지 — 안내 화면 그대로
    sessionStorage.setItem("kpChunkReloadAt", String(Date.now()));
    if (window.__kpMenu) sessionStorage.setItem("kpReloadMenu", JSON.stringify({ menu: window.__kpMenu, at: Date.now() })); // 새로고침 뒤 보던 메뉴로
  } catch { /* 저장 실패해도 진행 */ }
  window.location.reload();
  return true;
}

// 🧯 2026-11-10 [오류 보내기] — 로그인한 누구나 누를 수 있고, 최고관리자만 관리센터에서 본다(src/errorReport.js)
export function ReportErrorButton({ error, section, dark = true }) {
  const [st, setSt] = React.useState({ s: "idle" });
  const send = async () => {
    setSt({ s: "sending" });
    try {
      const { sendErrorReport } = await import("./errorReport");
      const code = await sendErrorReport(error, section);
      setSt({ s: "sent", code });
    } catch (e) { setSt({ s: "fail", msg: String(e?.message || e).slice(0, 120) }); }
  };
  if (st.s === "sent") return <div style={{ fontSize: 13, fontWeight: 700, color: "#1F7A4D" }}>보냈습니다 · 오류 번호 <b style={{ fontFamily: "monospace", letterSpacing: 1 }}>{st.code}</b></div>;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <button type="button" onClick={send} disabled={st.s === "sending"}
        style={{ height: dark ? 44 : 36, padding: dark ? "0 22px" : "0 14px", borderRadius: 10, border: "1px solid #DCE3EE", background: "#fff", color: "#1B2B4B", fontSize: dark ? 14 : 13, fontWeight: 700, cursor: "pointer", opacity: st.s === "sending" ? 0.6 : 1 }}>
        {st.s === "sending" ? "보내는 중…" : "오류 보내기"}
      </button>
      {st.s === "fail" && <span style={{ fontSize: 11.5, color: "#B4342A" }}>보내지 못했어요 — {st.msg}</span>}
    </span>
  );
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] 화면 오류:", error, info?.componentStack);
    // ⭐ 2026-11-01 새 버전 배포 직후 — 열려 있던 화면이 예전 파일(지금은 서버에 없는 조각 파일)을 불러오다 실패하면
    //    이 안내가 떴다(새로고침하면 해결). 이런 "화면 파일 불러오기 실패"는 자동으로 한 번 새로고침한다.
    if (isChunkLoadError(error)) reloadOnce();
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: 24,
          textAlign: "center", background: "#F5F7FA", fontFamily: "sans-serif",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1B2B4B", marginBottom: 8 }}>
            화면을 불러오는 중 오류가 발생했습니다
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
            새로고침하면 대부분 해결됩니다. 계속되면 [오류 보내기]를 눌러 주세요.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "12px 28px", borderRadius: 10, border: "none",
              background: "#1B2B4B", color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: "pointer",
            }}
          >
            새로고침
          </button>
          <div style={{ marginTop: 10 }}><ReportErrorButton error={this.state.error} section="전체 화면" /></div>
          {/* ⭐ 2026-11-10 원인 찾기용 — 오류 내용을 작게 보여 준다(캡처해서 보내면 바로 원인을 찾는다) */}
          <div style={{ marginTop: 18, maxWidth: 560, fontSize: 11, color: "#9AA9C3", wordBreak: "break-all", fontFamily: "monospace" }}>
            {String(this.state.error?.message || this.state.error || "").slice(0, 300)}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ⭐ 2026-11-10 화면 일부만 감싸는 오류 경계 — 그 부분만 안내로 바꾸고 나머지 프로그램은 그대로 쓴다
export class SectionBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error(`[SectionBoundary:${this.props.name || ""}]`, error, info?.componentStack);
    if (isChunkLoadError(error)) reloadOnce();
  }
  render() {
    if (!this.state.error) return this.props.children;
    const msg = String(this.state.error?.message || this.state.error || "").slice(0, 300);
    return (
      <div style={{ padding: "28px 20px", borderRadius: 18, border: "1px solid #F5C2C2", background: "#FFF8F8", textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#1B2B4B" }}>{this.props.name || "이 화면"}을 불러오지 못했습니다</div>
        <div style={{ fontSize: 12.5, color: "#6b7280", marginTop: 6 }}>[오류 보내기]를 누르면 오류 내용이 바로 전달됩니다.</div>
        <div style={{ marginTop: 10, fontSize: 11, color: "#9AA9C3", wordBreak: "break-all", fontFamily: "monospace" }}>{msg}</div>
        <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "center", alignItems: "flex-start", flexWrap: "wrap" }}>
          <ReportErrorButton error={this.state.error} section={this.props.name || "화면 일부"} dark={false} />
          <button type="button" onClick={() => this.setState({ error: null })} style={{ height: 36, padding: "0 14px", borderRadius: 10, border: "1px solid #DCE3EE", background: "#fff", fontWeight: 700 }}>다시 시도</button>
          {this.props.fallback && <button type="button" onClick={() => this.setState({ error: null, useFallback: true })} style={{ height: 36, padding: "0 14px", borderRadius: 10, border: "none", background: "#1B2B4B", color: "#fff", fontWeight: 700 }}>기본 화면으로 보기</button>}
        </div>
      </div>
    );
  }
}
