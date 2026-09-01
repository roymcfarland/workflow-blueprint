# Case Study: How PR #13 Made the Verifier Smarter

This document walks one merged PR end-to-end so a reader can evaluate the multi-agent workflow used in this repository without reverse-engineering it from commit messages. It is intentionally concrete: actual prompt, actual diff, actual rule that the PR triggered, and the durable change to `PROJECT.md` that resulted.

If you only read one artifact in this repo to judge the workflow, read this one.

---

## Context: the actors

| Role | Tool | Responsibility |
|---|---|---|
| **Owner / final approver** | Human (repo owner) | Writes the Builder prompt, approves merges, edits `PROJECT.md`. |
| **Builder** | OpenAI Codex (cloud agent) | Reads `PROJECT.md` + `AGENTS.md`, writes the diff, opens the PR. |
| **Verifier** | Cursor (in-IDE) | Audits the PR against the resolved questions in `PROJECT.md` before the owner approves. |

The contract between them is `PROJECT.md`. When agents and humans disagree, that document wins.

---

## The PR in question

**PR `#13` — `feat(api): expose X-RateLimit-* headers and thread resolved user through wrapper`**
Merged into `main` as commit `ea4d908`. Diff size: **+870 / -124** across the external API observability layer.

The intent of the PR was narrow:

1. Surface `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers on every `/api/external/v1/*` response so consumers can self-throttle, plus standard `Retry-After` on 429s.
2. Thread the resolved external user (`EXTERNAL_USER_ID` lookup result) through the observability wrapper so structured log lines could attribute requests correctly.

This was straightforward Builder work. It conformed to the stable-API rule (Q5), it did not touch response *bodies* (only headers), and it shipped with tests as Q1 requires.

---

## The Builder prompt (paraphrased)

The prompt given to Codex was roughly:

> Add `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` (Unix epoch seconds) headers to every response from `/api/external/v1/*`. On 429 responses also include `Retry-After`. Update `tests/api/external/v1-routes.test.ts` to assert these headers on at least one success path and the 429 path. Resolve the external user once inside the wrapper and pass the resolved user object into route handlers so structured log lines can include it. Update README to document the new headers.

Two things the prompt did *not* authorize: changing the rate-limit algorithm, and rewriting the bucket-update SQL.

---

## The unauthorized change Codex made anyway

The diff Codex produced did everything in the prompt — and one thing more: it rewrote `bumpBucket` and `maybeCleanupExpiredBuckets` inside `src/lib/rate-limit.ts` to compute `resetAt` timestamps entirely in Postgres (`LOCALTIMESTAMP`) instead of passing a JS-computed `Date` as a query parameter — removing a clock-skew risk if the app server's and database's clocks ever drifted. (The `INSERT … ON CONFLICT DO UPDATE` statement was already atomic before this PR; that part was untouched.)

On inspection, the rewrite closed a real, if narrow, exposure, not a regression. The owner verified it manually, the existing rate-limit tests still passed, and one of the new tests in the same PR happened to exercise the corrected path. The change was correct.

But correctness is not the question. The question the workflow is supposed to answer is: *can the Verifier trust the diff to match the prompt?*

The answer for `#13` was no. Codex shipped a useful change adjacent to its stated scope. The next time it does that, the change might not be a bug fix — it might be a regression smuggled inside an otherwise legitimate PR. Catching it would depend entirely on the Verifier reading every line of every diff, which is exactly the failure mode `PROJECT.md` exists to prevent.

---

## How the Verifier handled it

The Verifier (Cursor + the human reviewer) had three options:

1. **Reject the PR** outright, ask the Builder to redo it without the SQL rewrite, and open a separate PR for the rate-limit fix.
2. **Merge the PR as-is** and treat the unauthorized change as acceptable because it was a fix.
3. **Merge the PR, then write a new rule** that prevents the next out-of-scope change from being merged silently.

Option 1 is the strictest reading of `PROJECT.md` as it stood before `#13`. Option 2 is the path of least resistance and would have set a precedent that erodes the entire Builder/Verifier contract. The owner chose option 3.

`#13` merged. Then a follow-up PR (`#14`) appended **Q6** to `PROJECT.md`:

> **Q6. How should Builder agents handle changes outside their prompt's stated scope?**
> **Answer:** Out-of-scope changes must be either declared in the PR body or split into a separate PR.
>
> **Verifier behavior:**
> - **Hard-fail** any PR whose diff includes file changes outside the Builder prompt's stated scope AND that are not enumerated in an "Out-of-scope changes (justified)" section in the PR body.
> - **Warn** if the section is present but the justification is missing, perfunctory ("cleanup," "refactor"), or contradicted by the diff.
> - The Builder prompt MAY explicitly authorize broader latitude (e.g., "you may refactor adjacent helpers if needed for the new API"); changes that fall under such an authorization are in-scope by definition.
> - This rule applies to all PRs from the date of merge forward; existing merged PRs are not retroactively in violation.

This is the most important sentence in `PROJECT.md`: **"applies to all PRs from the date of merge forward; existing merged PRs are not retroactively in violation."** It establishes that the rulebook can grow without penalizing the work that exposed the gap.

---

## What the next PR looked like under the new rule

PR `#14` — the Sentry observability PR that introduced Q6 itself — is the first PR to operate under the new rule. Its PR body includes an explicit `Out-of-scope changes (justified)` section that enumerates every file in the diff that fell outside the Builder prompt's stated scope, with one-line justifications:

```
- package-lock.json — required to install @sentry/nextjs for goal #1
- README.md — required to document the new optional env vars and Sentry behavior
- sentry.edge.config.ts — required by @sentry/nextjs to silence Edge runtime warnings;
  not used by any current route but mandated by the SDK structure
```

The Verifier can now audit a PR by checking that every file in the diff is either (a) named in the prompt or (b) listed in this section. That check is mechanical, fast, and reliable — which is the whole point of moving rules into `PROJECT.md`.

---

## What this case study is meant to demonstrate

Three things, in priority order:

1. **Multi-agent workflows fail in interesting ways, not obvious ways.** The failure mode in `#13` was not bad code, hallucinated APIs, or broken tests. The failure was a *correct* change that violated the contract between Builder and Verifier. If the only thing you check is "does the code work," you will miss this class of failure entirely.
2. **Rules should be written in response to specific, traceable events.** Q6 is not a hypothetical guardrail copied from a blog post. It exists because PR `#13` exposed a real gap, and it is enforced because PR `#14` was the first PR forced to comply. Every rule in `PROJECT.md` can be traced this way.
3. **The agents work for the contract, not the other way around.** When Codex and `PROJECT.md` disagreed, the document was updated and the next prompt got tighter — the agent's behavior did not become the new baseline. This is the only way a multi-agent workflow stays auditable as agents get smarter.

---

## Suggested reading order for evaluators

1. This document.
2. [`PROJECT.md`](./PROJECT.md) — Q5 and Q6 specifically.
3. PR `#13` on GitHub — the diff and the merge commit message.
4. PR `#14` on GitHub — the first PR written under Q6.
5. [`docs/openapi.yaml`](./docs/openapi.yaml) and [`tests/api/external/openapi.test.ts`](./tests/api/external/openapi.test.ts) — the CI drift guard that enforces the API contract from `PROJECT.md` Q5.
