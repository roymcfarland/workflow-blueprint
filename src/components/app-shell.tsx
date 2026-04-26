"use client";

import Link from "next/link";
import type { UserRole } from "@prisma/client";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, X } from "lucide-react";
import { useState, useTransition, type CSSProperties } from "react";

import { BoardIcon } from "@/components/board-icon";
import { BlueprintButton } from "@/components/blueprint/button";
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
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(user.themePreference);
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

  const Sidebar = (
    <aside className="blueprint-surface blueprint-surface-strong flex h-full w-full max-w-none flex-col rounded-none border-y-0 border-l-0 px-4 py-5 sm:px-5 lg:rounded-r-xl">
      <button
        aria-label="Collapse navigation"
        className="mb-7 hidden h-10 w-10 items-center justify-center rounded-lg border border-line-strong text-text-primary transition hover:bg-surface-control-hover lg:flex"
        onClick={() => setDesktopOpen(false)}
        type="button"
      >
        <PanelLeftClose className="h-5 w-5" />
      </button>

      <button
        aria-label="Close navigation"
        className="mb-7 flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong text-text-primary transition hover:bg-surface-control-hover lg:hidden"
        onClick={() => setMobileOpen(false)}
        type="button"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="space-y-4">
        <Link
          aria-label="Workflow Blueprint home"
          className="block focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          href="/dashboard"
          onClick={() => setMobileOpen(false)}
        >
          <h1 className="blueprint-display text-2xl leading-[1] text-text-primary">
            <span className="block">Workflow</span>
            <span className="block">Blueprint</span>
          </h1>
        </Link>

        {isAdmin ? (
          <nav aria-label="Admin panel" className="space-y-2 pt-4">
            <div className="flex items-center gap-2 text-text-primary">
              <ShieldCheck className="h-4 w-4" />
              <p className="blueprint-eyebrow leading-none">Admin Panel</p>
            </div>
            <Link
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm font-semibold transition",
                pathname.startsWith("/admin")
                  ? "blueprint-fill-flat border-brand text-white"
                  : "border-accent/50 bg-accent-soft text-text-primary hover:bg-accent-soft/80",
              )}
              href="/admin/invitations"
              onClick={() => setMobileOpen(false)}
            >
              <BoardIcon className="h-5 w-5 shrink-0" iconKey="invitations" />
              <span className="truncate">Invitations</span>
            </Link>
          </nav>
        ) : null}

        <nav aria-label="Workspace" className="space-y-1 pt-3">
          {navItems.map((item) => {
            const isActive = isActiveNavItem(pathname, item);
            const navItemStyle = getNavItemStyle(item, isActive);

            return (
              <Link
                key={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm font-semibold transition",
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
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto space-y-4 border-t border-line-soft pt-5">
        <div className="space-y-2">
          <p className="blueprint-eyebrow">Theme</p>
          <BlueprintPillToggle
            onChange={handleThemeChange}
            options={themeOptions}
            value={themePreference}
          />
        </div>

        <div className="blueprint-panel-muted flex items-center gap-3 rounded-lg px-3 py-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface-control text-sm font-bold text-text-primary">
            {user.avatarLabel ?? initialsFromName(user.name)}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate font-semibold text-text-primary">{user.name}</p>
              {isAdmin ? (
                <span className="rounded-md border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-text-primary">
                  Admin
                </span>
              ) : null}
            </div>
            <p className="truncate text-xs text-text-muted">{user.email}</p>
          </div>
          <Link
            aria-label="Open profile settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface-control text-text-primary transition hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
            href="/profile"
            onClick={() => setMobileOpen(false)}
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>

        <BlueprintButton
          className="w-full justify-center"
          disabled={isPending}
          onClick={handleLogout}
          variant="ghost"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </BlueprintButton>
      </div>
    </aside>
  );

  return (
    <>
      <ThemePreferenceSync preference={themePreference} />

      <div className="min-h-screen lg:flex">
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[min(17rem,calc(100vw-1rem))] -translate-x-full transition-transform duration-200 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-[15.5rem]",
            desktopOpen ? "lg:translate-x-0" : "lg:hidden",
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
          {!desktopOpen ? (
            <button
              aria-label="Open navigation"
              className="fixed left-6 top-6 z-30 hidden h-10 w-10 items-center justify-center rounded-lg border border-line-strong bg-surface-control text-text-primary shadow-[0_10px_20px_rgba(31,79,207,0.12)] transition hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 lg:flex"
              onClick={() => setDesktopOpen(true)}
              type="button"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          ) : null}

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

          <main className="min-h-screen min-w-0 px-4 pb-10 pt-16 sm:px-6 lg:px-8 lg:pt-8">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
