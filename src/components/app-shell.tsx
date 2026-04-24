"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Settings, X } from "lucide-react";
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
    <aside className="blueprint-surface blueprint-surface-strong flex h-full w-full max-w-none flex-col rounded-none border-y-0 border-l-0 px-5 py-5 sm:px-7 sm:py-6 lg:rounded-r-[2rem]">
      <button
        aria-label="Collapse navigation"
        className="mb-8 hidden h-12 w-12 items-center justify-center rounded-full border-2 border-ink text-ink transition hover:bg-white/60 lg:flex"
        onClick={() => setDesktopOpen(false)}
        type="button"
      >
        <Menu className="h-6 w-6" />
      </button>

      <button
        aria-label="Close navigation"
        className="mb-8 flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink text-ink transition hover:bg-white/60 lg:hidden"
        onClick={() => setMobileOpen(false)}
        type="button"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="space-y-5">
        <div>
          <p className="blueprint-title text-[clamp(2.15rem,11vw,2.45rem)] leading-[0.86] text-ink">
            Workflow
          </p>
          <p className="blueprint-title text-[clamp(2.15rem,11vw,2.45rem)] leading-[0.86] text-ink">
            Blueprint
          </p>
        </div>

        <nav className="space-y-2 pt-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-[1.35rem] px-4 py-3 text-base font-semibold transition sm:text-lg",
                  isActive
                    ? "blueprint-fill text-white"
                    : "hover:bg-white/70 dark:hover:bg-white/6",
                )}
                href={item.href}
                onClick={() => setMobileOpen(false)}
              >
                <BoardIcon className="h-6 w-6 shrink-0" iconKey={item.iconKey} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto space-y-6 border-t-2 border-ink/20 pt-8">
        <div className="space-y-3">
          <p className="blueprint-title text-lg text-ink">View Settings</p>
          <BlueprintPillToggle
            onChange={handleThemeChange}
            options={themeOptions}
            value={themePreference}
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-ink bg-white text-xl font-bold text-ink shadow-[0_10px_20px_rgba(31,80,242,0.1)] dark:bg-paper-strong sm:h-20 sm:w-20 sm:text-2xl">
            {user.avatarLabel ?? initialsFromName(user.name)}
          </div>
          <Link
            className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-ink bg-white text-ink transition hover:-translate-y-0.5 dark:bg-paper-strong sm:h-20 sm:w-20"
            href="/profile"
            onClick={() => setMobileOpen(false)}
          >
            <Settings className="h-8 w-8" />
          </Link>
        </div>

        <div className="rounded-[1.3rem] border-2 border-ink-soft bg-white/75 px-4 py-3 text-sm text-ink-muted dark:bg-paper-strong">
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
            "fixed inset-y-0 left-0 z-50 w-[min(20rem,calc(100vw-1rem))] -translate-x-full transition-transform duration-200 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-[19rem]",
            desktopOpen ? "lg:translate-x-0" : "lg:hidden",
            mobileOpen && "translate-x-0",
          )}
        >
          {Sidebar}
        </div>

        {mobileOpen ? (
          <button
            aria-label="Close navigation overlay"
            className="fixed inset-0 z-40 bg-[#0b1f43]/20 lg:hidden"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
        ) : null}

        <div className="relative flex-1">
          {!desktopOpen ? (
            <button
              aria-label="Open navigation"
              className="fixed left-8 top-8 z-30 hidden h-12 w-12 items-center justify-center rounded-full border-2 border-ink bg-white/92 text-ink shadow-[0_10px_20px_rgba(31,80,242,0.12)] transition hover:-translate-y-0.5 lg:flex"
              onClick={() => setDesktopOpen(true)}
              type="button"
            >
              <Menu className="h-6 w-6" />
            </button>
          ) : null}

          {!mobileOpen ? (
            <button
              aria-label="Open mobile navigation"
              className="fixed left-5 top-5 z-30 flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink bg-white/92 text-ink shadow-[0_10px_20px_rgba(31,80,242,0.12)] transition hover:-translate-y-0.5 lg:hidden"
              onClick={() => setMobileOpen(true)}
              type="button"
            >
              <Menu className="h-6 w-6" />
            </button>
          ) : null}

          <main className="min-h-screen px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">{children}</main>
        </div>
      </div>
    </>
  );
}
