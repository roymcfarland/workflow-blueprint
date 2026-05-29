"use client";

import Link from "next/link";
import type { UserRole } from "@prisma/client";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useState, useTransition, type CSSProperties } from "react";

import { BoardIcon } from "@/components/board-icon";
import { BoardManagement } from "@/components/board-management";
import { BlueprintPillToggle } from "@/components/blueprint/pill-toggle";
import { useBlueprintTheme } from "@/components/providers/theme-provider";
import { ThemePreferenceSync } from "@/components/theme-preference-sync";
import type { BoardNavItem } from "@/lib/data";
import { initialsFromName } from "@/lib/utils";
import { getBoardAccentColor, type ThemePreference } from "@/lib/domain";
import { cn } from "@/lib/utils";

type ShellUser = {
  avatarLabel: string | null;
  email: string;
  name: string;
  role: UserRole;
  themePreference: ThemePreference;
};

type AppShellProps = {
  boards: BoardNavItem[];
  children: React.ReactNode;
  user: ShellUser;
};

const themeOptions = [
  { label: "Day", value: "day" },
  { label: "Night", value: "night" },
  { label: "Device", value: "system" },
] as const;

const sidebarCollapsedStorageKey = "wb.sidebar.collapsed";

type SidebarNavItem =
  | {
      href: string;
      iconKey: string;
      kind: "dashboard";
      label: string;
    }
  | {
      accentColor: string;
      href: string;
      iconKey: string;
      kind: "board";
      label: string;
    };

type BoardAccentStyle = CSSProperties & {
  "--board-accent"?: string;
};

function readStoredSidebarCollapsed() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(sidebarCollapsedStorageKey) === "1";
  } catch {
    return false;
  }
}

function persistSidebarCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(sidebarCollapsedStorageKey, collapsed ? "1" : "0");
  } catch {
    // Sidebar persistence is a progressive enhancement.
  }
}

function normalizePathname(pathname: string) {
  return pathname === "/" ? pathname : pathname.replace(/\/$/, "");
}

function isActiveNavItem(pathname: string, item: SidebarNavItem) {
  const currentPath = normalizePathname(pathname);

  if (item.kind === "board") {
    return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
  }

  return currentPath === item.href;
}

function getNavItemStyle(item: SidebarNavItem, isActive: boolean): BoardAccentStyle | undefined {
  if (item.kind !== "board") {
    return undefined;
  }

  return {
    "--board-accent": item.accentColor,
    ...(isActive
      ? {
          backgroundColor: item.accentColor,
          borderColor: item.accentColor,
          boxShadow: `0 10px 22px ${item.accentColor}33`,
        }
      : {}),
  };
}

export function AppShell({ boards, children, user }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useBlueprintTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarTransitionsEnabled, setSidebarTransitionsEnabled] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(user.themePreference);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isAdmin = user.role === "ADMIN";
  const navItems: SidebarNavItem[] = [
    { href: "/dashboard", iconKey: "dashboard", kind: "dashboard", label: "Dashboard" },
    ...boards.map((board) => ({
      accentColor: getBoardAccentColor(board.slug),
      href: `/boards/${board.slug}`,
      iconKey: board.iconKey,
      kind: "board" as const,
      label: board.name,
    })),
  ];
  const sidebarExpanded = !collapsed;
  const showFullSidebarContent = sidebarExpanded || mobileOpen;
  const sidebarWidthClass = sidebarExpanded ? "lg:w-[15.5rem]" : "lg:w-14";
  const sidebarTransitionClass = sidebarTransitionsEnabled
    ? "lg:transition-[width] lg:duration-200 lg:ease-[cubic-bezier(0.4,0,0.2,1)]"
    : "lg:transition-none";
  const navLinkClassName = cn(
    "flex h-10 items-center gap-3 rounded-lg border px-2.5 py-2 text-sm font-semibold transition",
    sidebarExpanded ? "lg:justify-start" : "lg:justify-center lg:px-0",
  );

  useEffect(() => {
    let mounted = true;

    queueMicrotask(() => {
      if (!mounted) {
        return;
      }

      if (readStoredSidebarCollapsed()) {
        setCollapsed(true);
      }
    });

    const enableTransitions = () => {
      if (!mounted) {
        return;
      }

      setSidebarTransitionsEnabled(true);
    };

    if (typeof window.requestAnimationFrame === "function") {
      const animationFrame = window.requestAnimationFrame(enableTransitions);

      return () => {
        mounted = false;
        window.cancelAnimationFrame(animationFrame);
      };
    }

    const timer = setTimeout(enableTransitions, 0);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  const handleThemeChange = (nextTheme: ThemePreference) => {
    const previousTheme = themePreference;
    setThemePreference(nextTheme);
    setTheme(nextTheme);

    startTransition(async () => {
      const response = await fetch("/api/theme", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ themePreference: nextTheme }),
      });

      if (!response.ok) {
        setThemePreference(previousTheme);
        setTheme(previousTheme);
      }
    });
  };

  const handleLogout = () => {
    startTransition(async () => {
      await fetch("/api/auth/sign-out", {
        method: "POST",
      });
      router.push("/");
      router.refresh();
    });
  };

  const handleCollapseToggle = () => {
    setCollapsed((current) => {
      const next = !current;
      persistSidebarCollapsed(next);
      return next;
    });
  };

  const Sidebar = (
    <aside
      aria-label="Primary navigation"
      className={cn(
        "blueprint-surface blueprint-surface-strong flex h-full w-full max-w-none flex-col overflow-hidden rounded-none border-y-0 border-l-0 px-4 py-5 sm:px-5 lg:rounded-r-xl",
        sidebarWidthClass,
        sidebarTransitionClass,
        "lg:px-3",
      )}
    >
      <button
        aria-label="Close navigation"
        className="mb-7 flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong text-text-primary transition hover:bg-surface-control-hover lg:hidden"
        onClick={() => setMobileOpen(false)}
        type="button"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="space-y-4">
        <div className="flex h-14 items-center justify-between gap-2">
          {showFullSidebarContent ? (
            <Link
              aria-label="Workflow Blueprint home"
              className="flex min-w-0 items-center focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
              href="/dashboard"
              onClick={() => setMobileOpen(false)}
            >
              <h1 className="blueprint-display text-2xl leading-[1] text-text-primary">
                <span className="block">Workflow</span>
                <span className="block">Blueprint</span>
              </h1>
            </Link>
          ) : null}
          <button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={cn(
              "hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface-control text-text-primary transition hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 lg:flex",
              !showFullSidebarContent && "lg:mx-auto",
            )}
            onClick={handleCollapseToggle}
            type="button"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav aria-label="Workspace" className="space-y-1 pt-3">
          {navItems.map((item) => {
            const isActive = isActiveNavItem(pathname, item);
            const navItemStyle = getNavItemStyle(item, isActive);

            return (
              <Link
                aria-label={item.label}
                key={item.href}
                className={cn(
                  navLinkClassName,
                  isActive &&
                    item.kind === "dashboard" &&
                    "blueprint-fill-flat border-brand text-white",
                  isActive && item.kind === "board" && "text-white",
                  !isActive && "border-transparent text-text-primary hover:bg-surface-control-hover",
                )}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                style={navItemStyle}
              >
                <BoardIcon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    item.kind === "board" && !isActive && "text-[var(--board-accent)]",
                  )}
                  iconKey={item.iconKey}
                />
                {showFullSidebarContent ? <span className="truncate">{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>

        {showFullSidebarContent ? (
          <div className="pt-3">
            <BoardManagement />
          </div>
        ) : null}
      </div>

      <div className="relative mt-auto border-t border-line-soft pt-5">
        <button
          aria-label="Account menu"
          aria-expanded={accountMenuOpen}
          aria-haspopup="menu"
          className={cn(
            "flex w-full items-center gap-3 rounded-lg border border-transparent text-left transition hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
            showFullSidebarContent ? "blueprint-panel-muted px-3 py-2.5" : "justify-center py-1",
          )}
          onClick={() => setAccountMenuOpen((value) => !value)}
          type="button"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface-control text-sm font-bold text-text-primary">
            {user.avatarLabel ?? initialsFromName(user.name)}
          </span>
          {showFullSidebarContent ? (
            <>
              <span className="min-w-0 flex-1 text-sm">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-semibold text-text-primary">{user.name}</span>
                  {isAdmin ? (
                    <span className="rounded-md border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-text-primary">
                      Admin
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-text-muted">{user.email}</span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-text-muted transition",
                  accountMenuOpen && "rotate-180",
                )}
              />
            </>
          ) : null}
        </button>

        {accountMenuOpen ? (
          <>
            <button
              aria-hidden
              className="fixed inset-0 z-10"
              onClick={() => setAccountMenuOpen(false)}
              tabIndex={-1}
              type="button"
            />
            <div
              className="blueprint-surface absolute bottom-[calc(100%+0.5rem)] left-0 z-20 w-60 overflow-hidden p-1.5"
              role="menu"
            >
              <div className="space-y-2 px-2 pb-2 pt-1.5">
                <p className="blueprint-eyebrow">Theme</p>
                <BlueprintPillToggle
                  onChange={handleThemeChange}
                  options={themeOptions}
                  value={themePreference}
                />
              </div>
              <div className="my-1 border-t border-line-soft" />
              <Link
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                href="/profile"
                onClick={() => {
                  setAccountMenuOpen(false);
                  setMobileOpen(false);
                }}
                role="menuitem"
              >
                <Settings className="h-4 w-4 shrink-0" />
                <span className="truncate">Profile</span>
              </Link>
              {isAdmin ? (
                <Link
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                  href="/admin/invitations"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setMobileOpen(false);
                  }}
                  role="menuitem"
                >
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span className="truncate">Invitations</span>
                </Link>
              ) : null}
              <button
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-text-primary transition hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 disabled:opacity-60"
                disabled={isPending}
                onClick={() => {
                  setAccountMenuOpen(false);
                  handleLogout();
                }}
                role="menuitem"
                type="button"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="truncate">Sign out</span>
              </button>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );

  return (
    <>
      <ThemePreferenceSync preference={themePreference} />

      <div className="min-h-screen lg:flex">
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[min(17rem,calc(100vw-1rem))] -translate-x-full transition-transform duration-200 lg:static lg:block lg:h-screen lg:translate-x-0 lg:overflow-y-auto",
            sidebarWidthClass,
            sidebarTransitionClass,
            mobileOpen && "translate-x-0",
          )}
        >
          {Sidebar}
        </div>

        {mobileOpen ? (
          <button
            aria-label="Close navigation overlay"
            className="fixed inset-0 z-40 bg-foreground/35 lg:hidden"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
        ) : null}

        <div className="relative min-w-0 flex-1">
          {!mobileOpen ? (
            <button
              aria-label="Open mobile navigation"
              className="fixed left-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong bg-surface-control text-text-primary shadow-[0_10px_20px_rgba(31,79,207,0.12)] transition hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 lg:hidden"
              onClick={() => setMobileOpen(true)}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>
          ) : null}

          <main className="min-h-screen min-w-0 px-4 pb-10 pt-16 sm:px-6 lg:h-screen lg:overflow-y-auto lg:px-8 lg:pt-8">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
