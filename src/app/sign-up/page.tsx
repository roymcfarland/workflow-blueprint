import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/auth/sign-up-form";
import { BlueprintCard } from "@/components/blueprint/card";
import { getCurrentUser } from "@/lib/auth";
import { getInvitationPreviewByToken } from "@/lib/data";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

type SignUpPageProps = {
  searchParams: Promise<{
    invite?: string | string[];
  }>;
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function InviteOnlyMessage({
  copy,
  title = "Invite only",
}: {
  copy: string;
  title?: string;
}) {
  return (
    <BlueprintCard className="w-full p-7 text-center sm:p-9">
      <div className="space-y-5">
        <div className="space-y-2">
          <h1 className="blueprint-display text-3xl text-text-primary sm:text-4xl">{title}</h1>
          <p className="text-base text-text-muted">{copy}</p>
        </div>

        <Link
          className="inline-flex rounded-lg border border-line-strong px-4 py-2.5 font-semibold text-text-primary transition hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          href="/"
        >
          Sign in
        </Link>
      </div>
    </BlueprintCard>
  );
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  const inviteToken = firstSearchValue((await searchParams).invite)?.trim();
  const invitation = inviteToken ? await getInvitationPreviewByToken(inviteToken) : null;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        {!inviteToken ? (
          <InviteOnlyMessage copy="New Workflow Blueprint accounts require an invitation from an admin." />
        ) : !invitation ? (
          <InviteOnlyMessage
            copy="This invitation link is invalid, expired, revoked, or already accepted."
            title="Invitation unavailable"
          />
        ) : (
          <BlueprintCard className="w-full p-7 sm:p-9">
            <div className="space-y-7">
              <div className="space-y-2 text-center">
                <h1 className="blueprint-display text-3xl text-text-primary sm:text-4xl">
                  Accept invitation
                </h1>
                <p className="text-base text-text-muted">
                  Create your account to open your Workflow Blueprint workspace.
                </p>
              </div>

              <SignUpForm
                expiresAt={invitation.expiresAt}
                inviteToken={inviteToken}
                invitedEmail={invitation.email}
              />

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
        )}
      </div>
    </main>
  );
}
