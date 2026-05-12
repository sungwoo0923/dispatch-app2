// ===================== src/UpdateBanner.jsx =====================
import React from "react";

export default function UpdateBanner() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const onUpdateReady = () => {
      setVisible(true);
      
      // 👇 변경 1: 500ms 후 자동으로 업데이트 적용
      setTimeout(() => {
        window.applyAppUpdate?.();
      }, 500);

      // 👇 변경 2: 3초 후 알림 자동 사라짐
      setTimeout(() => {
        setVisible(false);
      }, 3000);
    };

    window.addEventListener("app-update-ready", onUpdateReady);
    return () =>
      window.removeEventListener("app-update-ready", onUpdateReady);
  }, []);

  if (!visible) return null;

  return (
    <div style={styles.wrap}>
      {/* 👇 변경 3: 텍스트 변경 + 버튼 제거 */}
      <span style={styles.text}>✓ 새 버전으로 업데이트되고 있습니다.</span>
    </div>
  );
}

const styles = {
  wrap: {
    position: "fixed",
    // 👇 변경 4: 위치 변경 (bottom: 0 → bottom: 20, left/right → 중앙)
    bottom: 20,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 9999,
    background: "#111",
    color: "#fff",
    padding: "12px 20px",
    // 👇 변경 5: flex 제거 (버튼 없으므로)
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    // 👇 변경 6: 애니메이션 추가
    animation: "slideIn 0.3s ease-out, slideOut 0.3s ease-out 2.7s forwards",
  },
  text: {
    opacity: 0.9,
  },
  // 👇 변경 7: btn 스타일 제거 (버튼이 없으므로)
};

// 👇 변경 8: 애니메이션 CSS 추가
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
  
  @keyframes slideOut {
    from {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    to {
      opacity: 0;
      transform: translateX(-50%) translateY(20px);
    }
  }
`;
if (document.head) document.head.appendChild(styleSheet);
