import { Component } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { tryAutoRecoverOnce, resetAutoRecoverGuard, clearStaleCachesAndReload } from "../utils/staleChunkRecovery";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("App crashed:", error, info?.componentStack);
    tryAutoRecoverOnce(error);
  }

  handleReload = () => {
    resetAutoRecoverGuard();
    clearStaleCachesAndReload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <AlertTriangle size={26} />
        </div>
        <div>
          <p className="text-base font-bold text-ink">일시적인 오류가 발생했습니다</p>
          <p className="mt-1.5 text-sm text-muted">새로고침하면 대부분 바로 해결됩니다.</p>
        </div>
        <button
          type="button"
          onClick={this.handleReload}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95"
        >
          <RefreshCw size={15} /> 새로고침
        </button>
      </div>
    );
  }
}
