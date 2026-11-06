'use client';

// レンダリング中の未捕捉例外でReactがツリー全体をアンマウントし、画面が真っ白なまま
// 操作不能になる事象への対策（dev-standards/docs/client-error-reporting-pattern.md）。
// dev-standards/shared/ui/ErrorBoundary.jsxはBootstrap 5.3前提のマークアップのため、
// Tailwind CSSを採用している本プロダクトではsymlinkせず、ロジックのみを流用してクラス名を
// Tailwind用に書き換えたローカルコピーとして持つ
// （dev-standards/docs/shared-ui-components.mdの`ShareButton.jsx`と同種の制約を参照）。
import { Component, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
  // 指定すると、捕捉した例外情報（message/stack/componentStack/発生ページのURL）を
  // fire-and-forgetでこのURLへPOSTする（送信失敗はフォールバック画面の表示を妨げない
  // よう握りつぶす）。未指定時はconsole.errorとフォールバック画面表示のみ行う
  reportUrl?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string | null }) {
    console.error('ErrorBoundaryが例外を捕捉しました:', error, errorInfo);

    if (this.props.reportUrl) {
      fetch(this.props.reportUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error?.message,
          stack: error?.stack,
          componentStack: errorInfo?.componentStack,
          url: window.location.href,
        }),
      }).catch(() => {
        // 送信自体が失敗しても、フォールバック画面の表示（recover手段の提供）を
        // 妨げてはならないため何もしない
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col justify-center items-center text-center min-h-screen p-4 bg-slate-950 text-white">
          <p className="font-bold mb-3">エラーが発生しました</p>
          <p className="text-slate-400 mb-4">
            画面を再読み込みしてください。繰り返し発生する場合はご報告ください。
          </p>
          <button
            type="button"
            className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 font-bold"
            onClick={() => window.location.reload()}
          >
            再読み込み
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
