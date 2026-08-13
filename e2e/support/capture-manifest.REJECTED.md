# Claims the exploration made that did NOT survive verification

This file is the other half of `capture-manifest.json`. The manifest holds what
reproduced; this holds what did not, and why. It exists because a model's report
is a **claim**, and the interesting engineering is in the gap between the claim
and the fact.

Exploration run: `opencode-go/qwen3.7-max` + `@playwright/mcp@0.0.79`, one
session, 55 browser tool calls, ~5.5 min, 2026-08-13.
Verifier: `scripts/ux-capture/verify-states.mjs`.

---

## Rejected on the first pass — 2 of 6

Both failed the same way, and the way is worth keeping.

| claim | proof it gave | what happened |
|---|---|---|
| `login_auth_error` | `text=Could not sign in. Check your credentials.` | never appeared |
| `otp_invalid_code_error` | `text=Invalid or expired code. Request a new one.` | never appeared |

**Cause: the exploration ran ONE long-lived browser.** Early in the session the
model clicked the language toggle on `/login`. The locale persisted for the rest
of its session, so every later screen it looked at was in **English** — and it
reported English proof strings for screens it had never toggled.

The verifier replays each state from a **fresh context**, where the default
locale is `pt-BR`. Both claims were false as written.

**The states themselves were real.** Reading `src/i18n/index.ts` confirmed the
strings exist as the `en` translations of `auth.error` and `auth.otp.error`, and
`src/pages/auth/AuthPage.tsx` and `src/pages/auth/OtpLoginPage.tsx` render them
under `[data-testid="login-error"]` and `[data-testid="otp-error"]`. Re-pointed
at those testids — which no translation can move — both reproduced, and they are
in the manifest.

⚠️ **The generalisable rule: never let the exploration's own browser verify the
exploration.** A verifier that reused that session would have blessed both
claims, and the manifest would have carried two states that only reproduce after
an unrelated click on another page.

## Dropped as a duplicate — 1 of 6

`otp_step2_locale_pt` had steps identical to `otp_step2_code_input` and proved
itself with the Portuguese string `text=Código de 6 dígitos`.
`otp_step2_code_input` proves the same state with
`[data-testid="otp-code-input"]`, which is locale-independent. The weaker of the
two was dropped rather than kept for completeness.

## Reported as NOT reachable, and correctly so

The exploration was asked to say what it looked for and could not reach without
a backend, instead of inventing it. It listed four, and all four are consistent
with the substrate:

- the reset-password **form** — needs a token the stub cannot validate, so
  `/auth/reset` shows only "Link inválido ou expirado"
- a **loading / spinner** state on any submit button
- the OTP **resend** cooldown or success feedback
- the DFL callback **success** state — needs a real OAuth round trip

These are the honest edge of `substrate: hermetic-stub`. Reaching them needs a
substrate that can answer, which is a different task from this one — and until
then, **coverage is reportable and completeness is not provable**, exactly as
criterion 9 of the plan says.
