import React from "react";
import { captureWidgetError } from "../sentry";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class WidgetErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { error, hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    captureWidgetError(error, {
      category: "ui",
      extra: { componentStack: errorInfo.componentStack },
      tags: { component: errorInfo.componentStack?.split("\n")[1]?.trim() ?? "unknown" },
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            alignItems: "center",
            backgroundColor: "hsl(var(--sk-bg, 140 6% 8%))",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            justifyContent: "center",
            padding: "48px",
          }}>
          <svg
            aria-label="SwapKit"
            fill="hsl(0 0% 100% / 0.8)"
            role="img"
            style={{ height: 48, width: 48 }}
            viewBox="0 0 74.33 86.52">
            <title>SwapKit</title>
            <path d="M24.68,0C11.07,0,0,11.07,0,24.68h12.39c0-6.78,5.51-12.29,12.29-12.29h49.65V0H24.68Z" />
            <path d="M12.39,37.07h49.56v12.39H12.39v-12.39H0v24.78h61.94c0,6.78-5.51,12.29-12.29,12.29H0v12.39h49.65c13.61,0,24.68-11.07,24.68-24.68h-12.39v-12.39h12.39v-24.78H12.39v12.39Z" />
          </svg>
          <p style={{ color: "hsl(var(--sk-text, 0 0% 100%))", margin: 0 }}>Something went wrong</p>
          <button
            onClick={() => this.setState({ error: undefined, hasError: false })}
            style={{
              backgroundColor: "hsl(var(--sk-primary-button, 140 50% 50%))",
              border: "none",
              borderRadius: "8px",
              color: "hsl(var(--sk-primary-button-foreground, 0 0% 100%))",
              cursor: "pointer",
              padding: "8px 16px",
            }}
            type="button">
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
