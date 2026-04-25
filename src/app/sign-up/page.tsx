import Link from "next/link";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/auth/sign-up-form";
import { BlueprintCard } from "@/components/blueprint/card";
import { getCurrentUser } from "@/lib/auth";
import { getInvitationPreviewByToken } from "@/lib/data";

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
  title = "Invite Only",
}: {
  copy: string;
  title?: string;
}) {
  return (
    <BlueprintCard className="w-full p-8 text-center sm:p-10">
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="blueprint-title text-4xl text-ink sm:text-5xl">{title}</p>
          <p className="text-lg text-ink-muted">{copy}</p>
        </div>

        <Link
          className="inline-flex rounded-lg border border-ink px-4 py-2.5 font-semibold text-ink transition hover:bg-white/70"
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
            title="Invitation Unavailable"
          />
        ) : (
        <BlueprintCard className="w-full p-8 sm:p-10">
          <div className="space-y-8">
            <div className="space-y-3 text-center">
              <p className="blueprint-title text-4xl text-ink sm:text-5xl">Accept Invitation</p>
              <p className="text-lg text-ink-muted">
                Create your account to open your Workflow Blueprint workspace.
              </p>
            </div>

            <SignUpForm
              expiresAt={invitation.expiresAt}
              inviteToken={inviteToken}
              invitedEmail={invitation.email}
            />

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
        )}
      </div>
    </main>
  );
}
