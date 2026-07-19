import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { getShellSnapshot } from "@/lib/data";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/");
  }

  const shell = await getShellSnapshot(currentUser.id);

  if (!shell) {
    redirect("/");
  }

  return (
    <AppShell boards={shell.boards} user={shell.user}>
      {children}
    </AppShell>
  );
}
