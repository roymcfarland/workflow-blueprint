# Invite-Only Auth Handoff

> **Status: SHIPPED — archived 2026-07-07.** The invitation-gated sign-up this handoff designs is the live product: sign-up requires an admin-issued invitation token (see PROJECT.md's "Not open public self-service registration" non-goal), invitations are admin-managed with hashed tokens and atomic acceptance, and the ADMIN role exists. Kept for historical context; do not treat as open work.

Date: 2026-04-25

## Goal

Make Workflow Blueprint inaccessible to random self-service signups. New accounts should only be created after an existing admin approves/invites the person.

The app currently has custom email/password auth, signed HTTP-only session cookies, Prisma/Postgres persistence, and a public sign-up flow:

- `src/app/sign-up/page.tsx`
- `src/components/auth/sign-up-form.tsx`
- `src/app/api/auth/sign-up/route.ts`
- `src/lib/data.ts#createUserAccount`
- `src/lib/validators.ts#signUpSchema`
- `prisma/schema.prisma#User`

## Recommended Design

Implement invitation-gated signup and a simple admin role.

Do not rely on hiding the sign-up link alone. The server must reject `POST /api/auth/sign-up` unless the request includes a valid, unexpired, unaccepted invite token for the submitted email.

## Current Account Handling

Roy's existing account can and should be promoted to `ADMIN`. A new account is not required.

The migration should add a role with a safe default:

```prisma
enum UserRole {
  USER
  ADMIN
}

model User {
  // existing fields...
  role UserRole @default(USER)
}
```

Then bootstrap the first admin using one of these approaches:

1. Preferred: add an `ADMIN_EMAILS` env var and a script such as `npm run admin:promote -- roy@example.com` or `npm run admin:bootstrap`.
2. Acceptable one-time production fix: run a direct Prisma/SQL update against Roy's existing user row.

Example SQL:

```sql
UPDATE "User"
SET "role" = 'ADMIN'
WHERE "email" = 'roy@example.com';
```

Do not force Roy to re-create the account. Existing boards, tasks, password reset tokens, and session flow are already keyed to `User.id`; replacing the user would risk orphaning or losing continuity. After promotion, Roy may need to sign out and back in only if the implementation stores `role` in the session token. The cleaner approach is to read the current user from the database, including `role`, so role changes take effect without issuing a new JWT.

## Prisma Model Plan

Add `UserRole` and `Invitation`.

Suggested schema:

```prisma
enum UserRole {
  USER
  ADMIN
}

model User {
  id                  String       @id
  name                String
  email               String       @unique
  passwordHash        String
  avatarLabel         String?
  themePreference     ThemePreference @default(DAY)
  role                UserRole     @default(USER)
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt
  boards              Board[]
  resetTokens         PasswordResetToken[]
  sentInvitations     Invitation[] @relation("InvitationInviter")
  acceptedInvitations Invitation[] @relation("InvitationAcceptedUser")
}

model Invitation {
  id               String    @id
  email            String
  tokenHash        String    @unique
  invitedById      String
  acceptedByUserId String?   @unique
  expiresAt        DateTime
  acceptedAt       DateTime?
  revokedAt        DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  invitedBy        User      @relation("InvitationInviter", fields: [invitedById], references: [id], onDelete: Cascade)
  acceptedBy       User?     @relation("InvitationAcceptedUser", fields: [acceptedByUserId], references: [id], onDelete: SetNull)

  @@index([email])
  @@index([invitedById])
}
```

Normalize emails to lowercase before storing and comparing. Keep invite tokens random, opaque, and stored only as hashes. The existing password reset token pattern in `src/lib/data.ts` is a good local pattern to reuse or extract.

## API Plan

### Signup

Update `signUpSchema` to require an invite token:

```ts
inviteToken: z.string().trim().min(1, "Invite token is required.")
```

Update `POST /api/auth/sign-up`:

1. Parse and rate-limit as it does now.
2. Validate the invite token by hash.
3. Confirm `invitation.email === payload.data.email`.
4. Confirm `acceptedAt` and `revokedAt` are null and `expiresAt > now`.
5. Create the user and starter boards, then mark the invitation accepted in the same transaction.
6. Create the session cookie and send the welcome email as it does now.

The transaction should prevent double-use. Use an atomic update condition such as `updateMany` with `acceptedAt: null`, `revokedAt: null`, and `expiresAt > now`; fail if the count is zero.

### Admin Invite Creation

Add a protected admin API route:

- `POST /api/admin/invitations`
- Body: `{ email: string }`
- Requires authenticated admin.
- Creates a raw invite token, stores `tokenHash`, `expiresAt`, `invitedById`, and normalized email.
- Sends an invite email with `/sign-up?invite=<raw-token>`.
- Returns a neutral success body. In development, it may return `previewInviteUrl` like password reset does, but never in production.

Optional but useful:

- `GET /api/admin/invitations` for pending/accepted/revoked invites.
- `POST /api/admin/invitations/[id]/revoke`.
- `POST /api/admin/invitations/[id]/resend`.

## Auth Helpers

Extend `src/lib/auth.ts#getCurrentUser` to select `role`.

Add helpers:

```ts
export async function requireCurrentAdmin() {
  const user = await requireCurrentUser();

  if (user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return user;
}
```

For API routes, add a JSON-returning admin helper in `src/lib/api.ts`:

```ts
export async function requireApiAdmin() {
  const user = await requireApiUser();

  if (!user.ok) {
    return user;
  }

  if (user.data.role !== "ADMIN") {
    return {
      ok: false as const,
      response: apiError("Admin access is required.", 403),
    };
  }

  return user;
}
```

## UI Plan

Remove open-registration affordances:

- Remove or hide the `Create an account` link from `src/components/auth/login-form.tsx`.
- Keep `/sign-up`, but make it invitation-only.
- If `/sign-up` is visited without `?invite=...`, show a small message that accounts are invite-only and link back to sign in.

Update the sign-up form:

- Read `invite` from the page query string.
- Include the token in the POST body as `inviteToken`.
- Optionally prefetch invite details from `GET /api/auth/invitations/preview?token=...` to show the invited email. Keep preview responses minimal and avoid leaking whether arbitrary emails are invited.

Add an admin-only invite screen later:

- Route: `src/app/(app)/admin/invitations/page.tsx`
- Use `requireCurrentAdmin`.
- Start simple: email input, send button, list of pending/accepted/revoked invites.

## Email Plan

Add `sendInviteEmail` to `src/lib/email.ts`.

It should mirror the existing password reset and welcome patterns:

- Uses `buildAppUrl`.
- Sends an absolute invite URL.
- Has a clear expiration statement.
- Does not include sensitive database ids.

Suggested env behavior:

- Production: requires `RESEND_API_KEY` and `EMAIL_FROM`.
- Development: allow returning/logging a preview URL from the admin invitation endpoint so the flow can be tested locally without sending email.

## Telemetry-Ready Notes

This change should set up future commercial access controls cleanly:

- `User.role` gives a minimal authorization foundation.
- `Invitation.invitedById` creates an audit trail.
- `Invitation.acceptedByUserId` links approval to account creation.
- Consider adding `User.plan` or `Organization` later, but do not add that now unless the scope expands.
- Avoid encoding role/plan permanently into JWT claims unless there is a refresh strategy. Reading user authorization from the database is more predictable for admin changes and billing downgrades.

## Security Requirements

- Invite tokens must be high entropy and single-use.
- Store only token hashes, never raw invite tokens.
- Normalize emails before compare.
- Never allow open signup if invite validation fails.
- Keep rate limits on sign-up and add rate limits to admin invite creation.
- Admin APIs must return `403` for authenticated non-admins and `401` for unauthenticated users.
- Avoid user enumeration in public responses.
- Do not expose invite list or invite preview data to non-admins.
- Use transactions for user creation plus invite acceptance.

## Migration/Deployment Order

1. Add Prisma schema changes and migration.
2. Deploy migration.
3. Promote Roy's existing account to `ADMIN`.
4. Deploy code that enforces invite-only signup.
5. Verify Roy can sign in and access admin invite tooling.
6. Verify random signup is blocked at both page and API levels.

Important: do not deploy invite enforcement before confirming at least one existing production account is `ADMIN`, or the app may have no one who can invite future users.

## Suggested Tests

Add focused tests if the project has a test harness; otherwise verify manually and document results.

Minimum scenarios:

- `POST /api/auth/sign-up` without invite token returns `400` or `403`.
- Invalid invite token cannot create a user.
- Expired invite cannot create a user.
- Revoked invite cannot create a user.
- Invite for `a@example.com` cannot create `b@example.com`.
- Valid invite creates user, starter boards, session cookie, and marks invite accepted.
- Reusing the same invite fails.
- Non-admin cannot create invites.
- Admin can create invites.
- Existing promoted admin account keeps existing boards/tasks.

## Manual Verification Checklist

- Run `npm run lint`.
- Run `npm run build`.
- Run `npm run db:migrate` locally for the migration.
- Create/promote an admin user locally.
- Create an invite from the admin route/API.
- Complete signup using the invite link.
- Attempt direct POST to `/api/auth/sign-up` without invite and confirm it fails.
- Attempt signup through the UI without `?invite=` and confirm it does not expose open registration.

