import { Component, type ReactNode } from "react";
import { AudioWaveform, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** resets the boundary when the id changes (e.g. view switches) */
  resetKey?: string;
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * ErrorBoundary — a render crash shows a styled fallback (with the error)
 * instead of blanking the whole app. Remounts children when resetKey changes.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[atori] render error", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-10 text-center">
        <AudioWaveform className="h-10 w-10" style={{ color: "var(--ato-danger)" }} strokeWidth={1.5} />
        <div>
          <h2 className="font-display text-xl font-bold tracking-wide">
            RENDER FAULT <span className="font-jp text-sm text-dim">エラー</span>
          </h2>
          <p className="font-mono mt-2 max-w-lg text-[10px] leading-relaxed text-dim">
            {this.props.label ?? "SCREEN"} // {error.message.slice(0, 160)}
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="clip-slash-both font-display flex items-center gap-2 px-6 py-2.5 text-xs font-bold tracking-[0.25em]"
          style={{
            background: "var(--ato-accent)",
            color: "var(--ato-bg)",
            boxShadow: "0 0 24px color-mix(in srgb, var(--ato-accent) 35%, transparent)",
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" /> RELOAD APP
        </button>
      </div>
    );
  }
}
