import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Home,
  Moon,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "./SearchBar";
import { Toolbar } from "./Toolbar";
import { IndexerStatus } from "./IndexerStatus";
import { Breadcrumb } from "./Breadcrumb";
import { UserMenu } from "@/components/auth/UserMenu";
import { useNavigationStore } from "@/stores/navigation";
import { useAuthStore } from "@/stores/auth";
import { getEffectiveTheme, useThemeStore } from "@/stores/theme";

export function TopBar() {
  const {
    currentPath,
    setCurrentPath,
    isSearching,
    searchQuery,
    history,
    historyIndex,
    goBack,
    goForward,
  } = useNavigationStore();
  const { authRequired, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();

  const effectiveTheme = getEffectiveTheme(theme);
  const isSearchActive = isSearching && searchQuery.length >= 2;
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;
  const ThemeIcon = effectiveTheme === "dark" ? Moon : Sun;

  // Parse breadcrumb segments
  const segments = currentPath.split("/").filter(Boolean);

  const toggleTheme = () => {
    const next = effectiveTheme === "dark" ? "light" : "dark";
    setTheme(next);
  };

  const ThemeToggleButton = (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={toggleTheme}
      title={`Theme: ${effectiveTheme}${theme === "system" ? " (system)" : ""}`}
    >
      <ThemeIcon className="w-4 h-4" />
    </Button>
  );

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
      {/* Breadcrumbs / Search label */}
      <div className="flex items-center gap-1 text-sm min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goBack}
            disabled={!canGoBack}
            title="Previous"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goForward}
            disabled={!canGoForward}
            title="Next"
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setCurrentPath("/", { exitSearch: true })}
        >
          <Home className="w-4 h-4" />
        </Button>

        {isSearchActive ? (
          <>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">Search results</span>
            {searchQuery && (
              <span className="text-muted-foreground">for "{searchQuery}"</span>
            )}
          </>
        ) : (
          segments.length > 0 && (
            <Breadcrumb
              segments={segments}
              onNavigate={(path) => setCurrentPath(path)}
            />
          )
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {!isSearchActive ? (
          <>
            <Toolbar />
            <div className="w-px h-6 bg-border" />
            <IndexerStatus />
            {ThemeToggleButton}
            {authRequired && logout && (
              <>
                <div className="w-px h-6 bg-border" />
                <UserMenu onLogout={logout} />
              </>
            )}
          </>
        ) : null}
        <SearchBar />
      </div>
    </div>
  );
}
