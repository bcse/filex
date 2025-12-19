import React from "react";

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage?: string;
};

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Keep console logging minimal but useful for diagnostics.
    console.error("Unhandled render error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-background text-foreground">
          <div className="max-w-md w-full px-6">
            <div className="rounded-lg border bg-card p-6 shadow-sm">
              <h1 className="text-lg font-semibold">Something went wrong</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                An unexpected error occurred while rendering the app. Reload to
                try again.
              </p>
              {this.state.errorMessage ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {this.state.errorMessage}
                </p>
              ) : null}
              <button
                type="button"
                onClick={this.handleReload}
                className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
