import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

/**
 * Catches render-time exceptions so one broken component cannot take the whole app down.
 *
 * WHY THIS MATTERS: React unmounts the entire tree when a render throws and nothing catches
 * it. Without a boundary the user gets a genuinely blank page — no navigation, no message, no
 * way back — and the only escape is knowing to reload. That was the behaviour before this
 * component was actually mounted.
 *
 * TWO LEVELS ARE USED (see main.tsx and App.tsx):
 *   - one around the whole app, as the last line of defence;
 *   - one around the active view, so a failing view leaves the shell and navigation intact
 *     and the user can simply move somewhere else.
 *
 * Colours come from theme tokens rather than fixed hex values, so the fallback still looks
 * like the rest of the app under a member's custom theme.
 */

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
  /** Shown in the technical details line; helps support pinpoint where it broke. */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** Counts resets, so a boundary that keeps failing can offer a full reload instead. */
  resetCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    resetCount: 0
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `Code4Ever ErrorBoundary${this.props.label ? ` (${this.props.label})` : ''} caught an error:`,
      error,
      errorInfo
    );
  }

  private handleReset = () => {
    this.setState((prev) => ({ hasError: false, error: null, resetCount: prev.resetCount + 1 }));
    this.props.onReset?.();
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (!this.state.hasError) return this.props.children;

    // "Try again" only helps for a transient failure. Once it has failed again after a reset,
    // re-rendering the same broken tree is not going to work, so a reload is offered instead.
    const retryLooksHopeless = this.state.resetCount >= 1;

    return (
      <div
        className="flex-1 min-w-0 w-full min-h-[60vh] flex flex-col items-center justify-center p-6 text-center select-none"
        style={{ backgroundColor: 'var(--background)' }}
        role="alert"
      >
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 shadow-xl">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold mb-1" style={{ color: 'var(--foreground)' }}>
          {this.props.fallbackTitle || 'Bu Bölüm Yüklenemedi'}
        </h3>
        <p
          className="user-text text-xs max-w-sm mb-5 leading-relaxed"
          style={{ color: 'var(--muted-foreground)' }}
        >
          {this.props.fallbackMessage ||
            'Beklenmedik bir sorun oluştu. Diğer bölümler çalışmaya devam ediyor; buradan başka bir sayfaya geçebilir veya yeniden deneyebilirsiniz.'}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {!retryLooksHopeless && (
            <button
              type="button"
              onClick={this.handleReset}
              className="min-h-11 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Yeniden Dene</span>
            </button>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="min-h-11 px-4 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Sayfayı Yenile</span>
          </button>
        </div>

        {/* The message is what a member can actually quote when reporting the problem. */}
        {this.state.error?.message && (
          <p
            className="user-text mt-5 max-w-sm font-mono text-[12px] leading-relaxed opacity-70"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {this.state.error.message.slice(0, 200)}
          </p>
        )}
      </div>
    );
  }
}
