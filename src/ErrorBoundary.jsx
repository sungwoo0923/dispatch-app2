// ===================== src/ErrorBoundary.jsx =====================
// 화면 어딘가에서 예상 못한 JS 오류(예: 렌더링 중 ReferenceError 등)가 나면
// 리액트는 기본적으로 화면 전체를 새하얗게 지워버린다(백지 화면). 특히
// 모바일에서 이런 일이 생기면 사용자는 뭐가 잘못됐는지 전혀 알 수 없고
// 새로고침 방법도 못 찾는 경우가 많다. 앱 전체를 이 경계로 감싸서, 오류가
// 나면 백지 대신 "새로고침" 버튼이 있는 안내 화면을 보여주고, 실제 오류
// 내용은 콘솔에 그대로 남겨 나중에 원인 파악에 쓸 수 있게 한다.
import React from "react";

export const isChunkLoadError = (e) => /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed|Unable to preload CSS/i.test(String(e?.message || e || ""));
export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem("kpChunkReloadAt") || 0);
    if (Date.now() - last < 30000) return false; // 30초 안에 또 실패하면 무한 새로고침 방지 — 안내 화면 그대로
    sessionStorage.setItem("kpChunkReloadAt", String(Date.now()));
  } catch { /* 저장 실패해도 진행 */ }
  window.location.reload();
  return true;
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
            새로고침하면 대부분 해결됩니다. 계속되면 관리자에게 알려주세요.
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
        </div>
      );
    }
    return this.props.children;
  }
}
