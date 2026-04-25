"use client";

import { Send, XCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";

import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintInput } from "@/components/blueprint/input";
import { cn } from "@/lib/utils";
import type { SerializedInvitation } from "@/lib/data";

type InvitationsAdminProps = {
  initialInvitations: SerializedInvitation[];
};

type ApiMessage = {
  message?: string;
};

type InvitationListResponse = ApiMessage & {
  invitations?: SerializedInvitation[];
};

type InvitationCreateResponse = ApiMessage & {
  invitation?: SerializedInvitation;
  previewInviteUrl?: string;
};

const statusLabels = {
  ACCEPTED: "Accepted",
  EXPIRED: "Expired",
  PENDING: "Pending",
  REVOKED: "Revoked",
} as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClassName(status: SerializedInvitation["status"]) {
  return cn(
    "inline-flex rounded-lg border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em]",
    status === "PENDING" && "border-ink-soft bg-white/75 text-ink dark:bg-paper-strong",
    status === "ACCEPTED" && "border-success/30 bg-success/10 text-success",
    status === "EXPIRED" && "border-accent/30 bg-accent-soft text-ink",
    status === "REVOKED" && "border-danger/30 bg-danger/10 text-danger",
  );
}

export function InvitationsAdmin({ initialInvitations }: InvitationsAdminProps) {
  const [email, setEmail] = useState("");
  const [invitations, setInvitations] = useState(initialInvitations);
  const [message, setMessage] = useState<string | null>(null);
  const [previewInviteUrl, setPreviewInviteUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshInvitations = async () => {
    const response = await fetch("/api/admin/invitations");
    const body = (await response.json()) as InvitationListResponse;

    if (!response.ok || !body.invitations) {
      setMessage(body.message ?? "Unable to refresh invitations.");
      return;
    }

    setInvitations(body.invitations);
  };

  const handleCreateInvitation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setPreviewInviteUrl(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/invitations", {
        body: JSON.stringify({ email }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const body = (await response.json()) as InvitationCreateResponse;

      if (!response.ok) {
        setMessage(body.message ?? "Unable to create invitation.");
        return;
      }

      setEmail("");
      setMessage(body.message ?? "Invitation created.");
      setPreviewInviteUrl(body.previewInviteUrl ?? null);

      await refreshInvitations();
    });
  };

  const handleRevokeInvitation = (invitationId: string) => {
    setMessage(null);
    setPreviewInviteUrl(null);

    startTransition(async () => {
      const response = await fetch(`/api/admin/invitations/${invitationId}/revoke`, {
        method: "POST",
      });
      const body = (await response.json()) as ApiMessage;

      if (!response.ok) {
        setMessage(body.message ?? "Unable to revoke invitation.");
        return;
      }

      setMessage("Invitation revoked.");
      await refreshInvitations();
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(18rem,24rem)_1fr]">
      <section className="blueprint-surface blueprint-surface-strong p-5 sm:p-6">
        <div className="space-y-5">
          <div className="space-y-2">
            <h2 className="blueprint-title text-3xl text-ink">Send Invite</h2>
            <p className="text-sm text-ink-muted">
              Invitations are valid for 7 days and can be accepted once.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleCreateInvitation}>
            <div className="space-y-2">
              <label
                className="block text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted"
                htmlFor="invite-email"
              >
                Email
              </label>
              <BlueprintInput
                autoComplete="email"
                id="invite-email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@company.com"
                type="email"
                value={email}
              />
            </div>

            <BlueprintButton className="w-full" disabled={isPending || !email.trim()} type="submit">
              <Send className="h-4 w-4" />
              {isPending ? "Sending..." : "Send Invite"}
            </BlueprintButton>
          </form>

          {message ? (
            <p className="rounded-lg border border-ink-soft bg-white/75 px-4 py-3 text-sm font-semibold text-ink dark:bg-paper-strong">
              {message}
            </p>
          ) : null}

          {previewInviteUrl ? (
            <div className="rounded-lg border border-accent/40 bg-accent-soft p-4 text-sm text-ink">
              <p className="font-semibold">Local preview link</p>
              <a
                className="mt-2 block break-all underline decoration-2 underline-offset-4"
                href={previewInviteUrl}
              >
                {previewInviteUrl}
              </a>
            </div>
          ) : null}
        </div>
      </section>

      <section className="blueprint-surface blueprint-surface-strong overflow-hidden">
        <div className="border-b border-ink/20 p-5 sm:p-6">
          <h2 className="blueprint-title text-3xl text-ink">Invitation Ledger</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
            <thead className="bg-white/55 text-xs uppercase tracking-[0.16em] text-ink-muted dark:bg-white/5">
              <tr>
                <th className="px-5 py-3 font-bold">Email</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3 font-bold">Invited</th>
                <th className="px-5 py-3 font-bold">Expires</th>
                <th className="px-5 py-3 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {invitations.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-ink-muted" colSpan={5}>
                    No invitations yet.
                  </td>
                </tr>
              ) : (
                invitations.map((invitation) => (
                  <tr className="border-t border-ink/10" key={invitation.id}>
                    <td className="px-5 py-4">
                      <div className="space-y-1">
                        <p className="font-semibold text-ink">{invitation.email}</p>
                        <p className="text-xs text-ink-muted">
                          By {invitation.invitedBy.name}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={statusClassName(invitation.status)}>
                        {statusLabels[invitation.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-ink-muted">{formatDate(invitation.createdAt)}</td>
                    <td className="px-5 py-4 text-ink-muted">{formatDate(invitation.expiresAt)}</td>
                    <td className="px-5 py-4 text-right">
                      {invitation.status === "PENDING" ? (
                        <BlueprintButton
                          disabled={isPending}
                          onClick={() => handleRevokeInvitation(invitation.id)}
                          variant="ghost"
                        >
                          <XCircle className="h-4 w-4" />
                          Revoke
                        </BlueprintButton>
                      ) : (
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
                          Closed
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
