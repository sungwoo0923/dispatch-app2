// ===================== src/UpdateBanner.jsx =====================
import React from "react";

export default function UpdateBanner() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const onUpdateReady = () => setVisible(true);
    window.addEventListener("app-update-ready", onUpdateReady);
    return () =>
      window.removeEventListener("app-update-ready", onUpdateReady);
  }, []);

  if (!visible) return null;

  return (
    <div style={styles.wrap}>
      <span style={styles.text}>새 버전이 있습니다.</span>
      <button
        style={styles.btn}
        onClick={() => window.applyAppUpdate?.()}
      >
        업데이트
      </button>
    </div>
  );
}

const styles = {
  wrap: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    background: "#111",
    color: "#fff",
    padding: "12px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 14,
  },
  text: {
    opacity: 0.9,
  },
  btn: {
    background: "#22c55e",
    border: "none",
    color: "#000",
    padding: "6px 14px",
    borderRadius: 6,
    fontWeight: 600,
    cursor: "pointer",
  },
};
