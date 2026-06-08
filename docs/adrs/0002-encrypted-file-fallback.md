# ADR 0002 — Keychain fallback: AES-256-GCM keyed by argon2id(machine-id)

**Status:** Accepted
**Date:** 2026-06-08

## Context

`keytar` requires `libsecret` on Linux and a usable Keychain on macOS /
Credential Manager on Windows. CI runners, WSL, headless servers, and
locked-down enterprise images sometimes have none of these. The choice
was: refuse to run, store plaintext, or invent a machine-bound encrypted
file.

## Decision

When `keytar` throws, the keychain module transparently falls back to a
per-account file at `<dataDir>/secrets-fallback/<account>.enc`, encrypted
with AES-256-GCM under a key derived from the platform machine UUID via
argon2id. See
[`src/lib/server/services/secrets/keychain.ts`](../../src/lib/server/services/secrets/keychain.ts).

```ts
// keychain.ts (excerpt)
const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
// argon2id: memoryCost 65536, timeCost 3, parallelism 1
```

Machine-ID sources:

- macOS: `ioreg -rd1 -c IOPlatformExpertDevice` → `IOPlatformUUID`
- Linux: `/etc/machine-id`
- Windows: `wmic csproduct get UUID /value`

A constant string (`lectern-fallback-<platform>`) is used if detection
fails — encryption still works, but the key is not machine-bound on that
platform.

## Consequences

Pros:

- Lectern is always usable, even in environments without a working
  keychain. No "we couldn't set up your secrets" dead end.
- Tokens at rest are encrypted and bound to the host.

Cons:

- **Machine migration silently breaks decryption.** If the machine UUID
  changes (re-image, VM clone, motherboard swap), the file decrypts to
  garbage and `getKey()` returns `null` — the user sees "no token", not
  "token is unreadable here". Recovery: re-enter the token in Settings.
- `wmic` is deprecated on modern Windows; if it disappears, we fall
  through to the platform-default constant key, eliminating the
  machine-binding benefit on that host.
- The fallback files and the keychain are listed together by
  `listAccounts()`. There is no de-dup if both contain the same account
  — `deleteKey()` clears both, but a partial-write that succeeds in one
  store and fails in the other leaves them out of sync.
