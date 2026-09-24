import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

interface Props {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  onResetDefaults?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class TerminologyErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Terminology Manager Error Boundary caught an error:', error, errorInfo);
  }

  public componentDidUpdate(prevProps: Props) {
    // If the modal state changes from open to closed, or if reset happens, reset state
    if (!this.props.isOpen && prevProps.isOpen) {
      this.setState({ hasError: false, error: null });
    }
  }

  private handleReset = () => {
    if (this.props.onResetDefaults) {
      this.props.onResetDefaults();
    }
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (!this.props.isOpen) return null;

      return (
        <div 
          id="terminology-error-backdrop"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={this.props.onClose}
        >
          <div 
            id="terminology-error-dialog"
            className="w-full max-w-lg bg-[#16181D] border border-rose-500/40 rounded-2xl p-6 shadow-2xl text-slate-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-white">Terminology Manager Error</h3>
                  <p className="text-xs text-white/50">An unexpected error occurred in this feature.</p>
                </div>
              </div>
              <button 
                onClick={this.props.onClose}
                className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-white/80 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-200 font-mono overflow-auto max-h-32">
              {this.state.error?.message || 'Unknown runtime exception'}
            </div>

            <p className="text-xs text-white/70 leading-relaxed">
              Your reading session and novel contents are completely safe. You can reset your terminology rules to default settings or close this dialog to resume reading.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={this.props.onClose}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 rounded-xl bg-[#FF79B0] hover:bg-[#FF79B0]/90 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Rules & Recover</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
