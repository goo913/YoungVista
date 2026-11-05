import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** Shown instead of the children after they throw; `retry` renders them again. */
  fallback: (retry: () => void) => ReactNode;
  children: ReactNode;
}

/** Catches render errors in its children (a failed lazy chunk, a model that will not load...). */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (this.state.failed) return this.props.fallback(() => this.setState({ failed: false }));
    return this.props.children;
  }
}
