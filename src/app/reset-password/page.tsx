import { notFound } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { BlueprintCard } from "@/components/blueprint/card";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    notFound();
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <BlueprintCard className="w-full p-8 sm:p-10">
          <div className="space-y-8">
            <div className="space-y-3 text-center">
              <p className="blueprint-title text-4xl text-text-primary sm:text-5xl">
                Choose a New Password
              </p>
              <p className="text-lg text-text-muted">
                Set a fresh password and we&apos;ll bring you straight back into the app.
              </p>
            </div>

            <ResetPasswordForm token={token} />
          </div>
        </BlueprintCard>
      </div>
    </main>
  );
}
