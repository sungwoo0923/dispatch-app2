// ===================== src/ErrorBoundary.jsx =====================
// 화면 어딘가에서 예상 못한 JS 오류(예: 렌더링 중 ReferenceError 등)가 나면
// 리액트는 기본적으로 화면 전체를 새하얗게 지워버린다(백지 화면). 특히
// 모바일에서 이런 일이 생기면 사용자는 뭐가 잘못됐는지 전혀 알 수 없고
// 새로고침 방법도 못 찾는 경우가 많다. 앱 전체를 이 경계로 감싸서, 오류가
// 나면 백지 대신 "새로고침" 버튼이 있는 안내 화면을 보여주고, 실제 오류
// 내용은 콘솔에 그대로 남겨 나중에 원인 파악에 쓸 수 있게 한다.
import React from "react";

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
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: 24,
          textAlign: "center", background: "#F5F7FA", fontFamily: "sans-serif",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
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
