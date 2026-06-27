'use client';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught exception:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-6 bg-surface border border-border/80 rounded-2xl shadow-xl flex flex-col items-center justify-center text-center max-w-lg mx-auto my-8 space-y-4 animate-in fade-in duration-300">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-500 shadow-sm animate-pulse">
            <AlertTriangle size={24} />
          </div>
          
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-primary">
              Failed to load {this.props.moduleName || 'module'}
            </h3>
            <p className="text-xs text-secondary max-w-sm">
              An unexpected rendering error occurred. The application is isolated and safe.
            </p>
          </div>

          {this.state.error && (
            <div className="w-full text-left p-3.5 bg-base border border-border/40 rounded-xl max-h-36 overflow-y-auto font-mono text-[10px] text-secondary leading-relaxed scrollbar-thin">
              <span className="font-bold text-red-500">Error:</span> {this.state.error.message}
            </div>
          )}

          <button
            onClick={this.handleRetry}
            className="btn-enterprise-secondary flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-wider font-semibold active:scale-95 transition-all shadow-sm"
          >
            <RefreshCw size={12} /> Retry Loading
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
