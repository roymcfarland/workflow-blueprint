import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { BlueprintCard } from "@/components/blueprint/card";

// Required so the nonce-based CSP set by src/proxy.ts is honored on every
// request. Static prerenders cannot have per-request nonces.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <BlueprintCard className="w-full p-7 sm:p-9">
          <div className="space-y-7">
            <div className="space-y-2 text-center">
              <h1 className="blueprint-display text-3xl text-text-primary sm:text-4xl">
                Reset access
              </h1>
              <p className="text-base text-text-muted">
                Enter your email and we&apos;ll send a secure reset link.
              </p>
            </div>

            <ForgotPasswordForm />

            <div className="text-center text-sm text-text-muted">
              <Link
                className="font-semibold text-brand underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
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
