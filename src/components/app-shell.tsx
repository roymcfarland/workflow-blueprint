"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useTheme } from "next-themes";

import { BoardIcon } from "@/components/board-icon";
import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintPillToggle } from "@/components/blueprint/pill-toggle";
import { ThemePreferenceSync } from "@/components/theme-preference-sync";
import type { BoardNavItem } from "@/lib/data";
import { initialsFromName } from "@/lib/utils";
import type { ThemePreference } from "@/lib/domain";
import { cn } from "@/lib/utils";

type ShellUser = {
  avatarLabel: string | null;
  email: string;
  name: string;
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

export function AppShell({ boards, children, user }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(user.themePreference);
  const [isPending, startTransition] = useTransition();
  const navItems = [
    { href: "/dashboard", label: "Dashboard", iconKey: "dashboard" },
    ...boards.map((board) => ({
      href: `/boards/${board.slug}`,
      label: board.name,
      iconKey: board.iconKey,
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
    <aside className="blueprint-surface blueprint-surface-strong flex h-full w-full max-w-none flex-col rounded-none border-y-0 border-l-0 px-5 py-5 sm:px-6 lg:rounded-r-xl">
      <button
        aria-label="Collapse navigation"
        className="mb-7 hidden h-10 w-10 items-center justify-center rounded-lg border border-ink text-ink transition hover:bg-white/60 lg:flex"
        onClick={() => setDesktopOpen(false)}
        type="button"
      >
        <PanelLeftClose className="h-5 w-5" />
      </button>

      <button
        aria-label="Close navigation"
        className="mb-7 flex h-10 w-10 items-center justify-center rounded-lg border border-ink text-ink transition hover:bg-white/60 lg:hidden"
        onClick={() => setMobileOpen(false)}
        type="button"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="space-y-4">
        <div>
          <p className="blueprint-title text-3xl leading-[0.88] text-ink">
            Workflow
          </p>
          <p className="blueprint-title text-3xl leading-[0.88] text-ink">
            Blueprint
          </p>
        </div>

        <nav className="space-y-1.5 pt-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition sm:text-base",
                  isActive
                    ? "blueprint-fill text-white"
                    : "hover:bg-white/70 dark:hover:bg-white/6",
                )}
                href={item.href}
                onClick={() => setMobileOpen(false)}
              >
                <BoardIcon className="h-5 w-5 shrink-0" iconKey={item.iconKey} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto space-y-5 border-t border-ink/20 pt-6">
        <div className="space-y-3">
          <p className="blueprint-title text-base text-ink">View Settings</p>
          <BlueprintPillToggle
            onChange={handleThemeChange}
            options={themeOptions}
            value={themePreference}
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-ink bg-white text-lg font-bold text-ink shadow-[0_10px_20px_rgba(31,79,207,0.1)] dark:bg-paper-strong">
            {user.avatarLabel ?? initialsFromName(user.name)}
          </div>
          <Link
            aria-label="Open profile settings"
            className="flex h-14 w-14 items-center justify-center rounded-lg border border-ink bg-white text-ink transition hover:-translate-y-0.5 dark:bg-paper-strong"
            href="/profile"
            onClick={() => setMobileOpen(false)}
          >
            <Settings className="h-6 w-6" />
          </Link>
        </div>

        <div className="rounded-lg border border-ink-soft bg-white/75 px-3 py-2.5 text-sm text-ink-muted dark:bg-paper-strong">
          <p className="break-words font-semibold text-ink">{user.name}</p>
          <p className="break-all">{user.email}</p>
        </div>

        <BlueprintButton
          className="w-full justify-start text-lg"
          disabled={isPending}
          onClick={handleLogout}
          variant="outline"
        >
          <LogOut className="h-5 w-5" />
          Logout
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
            "fixed inset-y-0 left-0 z-50 w-[min(19rem,calc(100vw-1rem))] -translate-x-full transition-transform duration-200 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-[17.5rem]",
            desktopOpen ? "lg:translate-x-0" : "lg:hidden",
            mobileOpen && "translate-x-0",
          )}
        >
          {Sidebar}
        </div>

        {mobileOpen ? (
          <button
            aria-label="Close navigation overlay"
            className="fixed inset-0 z-40 bg-[#0b1428]/35 lg:hidden"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
        ) : null}

        <div className="relative flex-1">
          {!desktopOpen ? (
            <button
              aria-label="Open navigation"
              className="fixed left-6 top-6 z-30 hidden h-10 w-10 items-center justify-center rounded-lg border border-ink bg-white/90 text-ink shadow-[0_10px_20px_rgba(31,79,207,0.12)] transition hover:-translate-y-0.5 lg:flex"
              onClick={() => setDesktopOpen(true)}
              type="button"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          ) : null}

          {!mobileOpen ? (
            <button
              aria-label="Open mobile navigation"
              className="fixed left-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-lg border border-ink bg-white/90 text-ink shadow-[0_10px_20px_rgba(31,79,207,0.12)] transition hover:-translate-y-0.5 lg:hidden"
              onClick={() => setMobileOpen(true)}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>
          ) : null}

          <main className="min-h-screen px-4 pb-10 pt-16 sm:px-6 lg:px-8 lg:pt-8">{children}</main>
        </div>
      </div>
    </>
  );
}
