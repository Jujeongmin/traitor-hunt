import { Component, type ErrorInfo, type ReactNode } from "react";
import { GAME_TITLE } from "./brand";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// When a render throws, React unmounts the whole tree and the page goes blank, which in the
// Verse8 editor preview looks the same as the bundle never loading. Say what happened instead.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[traitor-hunt] render failed", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash">
        <h1>{GAME_TITLE}</h1>
        <p>게임을 시작하지 못했습니다.</p>
        <pre>{error.message}</pre>
        <button type="button" onClick={() => location.reload()}>다시 불러오기</button>
      </div>
    );
  }
}
