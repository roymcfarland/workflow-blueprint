"use client";

import { Send, XCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";

import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintInput } from "@/components/blueprint/input";
import { Field } from "@/components/blueprint/field";
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
    "inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold",
    status === "PENDING" && "border-line-soft bg-surface-control text-text-primary",
    status === "ACCEPTED" && "border-success/30 bg-success/10 text-success",
    status === "EXPIRED" && "border-accent/40 bg-accent-soft text-text-primary",
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
    <div className="auto-fit-grid gap-5 [--auto-fit-min:24rem]">
      <section className="blueprint-surface blueprint-surface-strong p-5 sm:p-6">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <h2 className="blueprint-display text-2xl text-text-primary sm:text-3xl">
              Send invite
            </h2>
            <p className="text-sm text-text-muted">
              Invitations are valid for 7 days and can be accepted once.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleCreateInvitation}>
            <Field htmlFor="invite-email" label="Email">
              <BlueprintInput
                autoComplete="email"
                id="invite-email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@company.com"
                type="email"
                value={email}
              />
            </Field>

            <BlueprintButton className="w-full" disabled={isPending || !email.trim()} type="submit" variant="hero">
              <Send className="h-4 w-4" />
              {isPending ? "Sending…" : "Send invite"}
            </BlueprintButton>
          </form>

          {message ? (
            <p className="blueprint-panel-muted rounded-lg px-4 py-3 text-sm font-semibold text-text-primary">
              {message}
            </p>
          ) : null}

          {previewInviteUrl ? (
            <div className="rounded-lg border border-accent/40 bg-accent-soft p-4 text-sm text-text-primary">
              <p className="font-semibold">Local preview link</p>
              <a
                className="mt-2 block break-all underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                href={previewInviteUrl}
              >
                {previewInviteUrl}
              </a>
            </div>
          ) : null}
        </div>
      </section>

      <section className="blueprint-surface blueprint-surface-strong overflow-hidden">
        <div className="border-b border-line-soft px-5 py-4 sm:px-6">
          <h2 className="blueprint-display text-2xl text-text-primary sm:text-3xl">
            Invitation ledger
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
            <thead className="bg-surface-control text-text-muted">
              <tr>
                <th className="blueprint-eyebrow px-5 py-3">Email</th>
                <th className="blueprint-eyebrow px-5 py-3">Status</th>
                <th className="blueprint-eyebrow px-5 py-3">Invited</th>
                <th className="blueprint-eyebrow px-5 py-3">Expires</th>
                <th className="blueprint-eyebrow px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {invitations.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-text-muted" colSpan={5}>
                    No invitations yet.
                  </td>
                </tr>
              ) : (
                invitations.map((invitation) => (
                  <tr className="border-t border-line-soft" key={invitation.id}>
                    <td className="px-5 py-3">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-text-primary">{invitation.email}</p>
                        <p className="text-xs text-text-muted">
                          By {invitation.invitedBy.name}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={statusClassName(invitation.status)}>
                        {statusLabels[invitation.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-text-muted">
                      {formatDate(invitation.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-text-muted">
                      {formatDate(invitation.expiresAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
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
                        <span className="text-xs font-semibold text-text-muted">Closed</span>
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
