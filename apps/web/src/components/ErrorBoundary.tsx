import { Component, type ReactNode } from 'react';

interface State { error: Error | null }

/** Keeps a failure in one panel from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; label: string; onError?: (e: Error) => void }, State> {
  override state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  override componentDidCatch(error: Error) { console.error(`[Greenfield] ${this.props.label} failed`, error); this.props.onError?.(error); }
  override render() {
    if (this.state.error) {
      return (
        <div className="section" style={{ padding: 16 }}>
          <div className="faint">{this.props.label} could not render.</div>
          <div className="faint" style={{ fontFamily: 'var(--mono)', fontSize: 11, marginTop: 6 }}>{this.state.error.message}</div>
          <button className="linkbtn" style={{ marginTop: 8 }} onClick={() => this.setState({ error: null })}>retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
