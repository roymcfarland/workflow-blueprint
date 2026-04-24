import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { BlueprintCard } from "@/components/blueprint/card";

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <BlueprintCard className="w-full p-8 sm:p-10">
          <div className="space-y-8">
            <div className="space-y-3 text-center">
              <p className="blueprint-title text-4xl text-ink sm:text-5xl">Reset Access</p>
              <p className="text-lg text-ink-muted">
                Enter your email and we&apos;ll prepare a reset link for the demo account flow.
              </p>
            </div>

            <ForgotPasswordForm />

            <div className="text-center text-sm text-ink-muted">
              <Link
                className="font-semibold text-ink underline decoration-2 underline-offset-4"
                href="/"
              >
                Return to the landing page
              </Link>
            </div>
          </div>
        </BlueprintCard>
      </div>
    </main>
  );
}
