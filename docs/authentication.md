# Authentication Philosophy

## Purpose

Authentication exists to answer one question only:

> **Is this the same person as before?**

Everything else—passwords, emails, passkeys, recovery flows—is an implementation detail. Our goal is to provide **secure, low-friction, low-confusion access** across devices and time, without fragmenting user identity.

---

## Core Principles

### 1. The App Owns Identity

* We maintain a **single canonical `user_id`** per person.
* External providers (Apple, Google, LinkedIn, etc.) are **credentials**, not identities.
* A user may authenticate through multiple providers, all mapping to the same internal account.

> One user. Many ways to prove it’s them.

---

### 2. Simplicity Beats Novelty

* Fewer authentication paths reduce confusion and support burden.
* We prefer **widely understood, battle-tested SSO providers** over experimental or niche methods.
* New auth mechanisms are added only when they solve a real, observed problem.

Auth should feel boring. Boring means reliable.

---

### 3. Verified Providers First

At launch, we rely on providers that guarantee:

* Verified email ownership
* Strong account recovery
* Cross-device usability

This allows us to avoid passwords, magic links, and complex recovery flows without sacrificing security.

---

### 4. Account Linking Is Explicit and Safe

* Users may link multiple providers to one account.
* Linking occurs only when:

  * Emails are verified and match, **or**
  * The user explicitly initiates linking while authenticated.
* We never silently merge accounts without clear verification.

Account integrity > convenience.

---

### 5. Trust Is a Layer, Not a Login Type

Some providers convey additional trust or context.

Example:

* LinkedIn → professional verification

These are modeled as **attributes or badges**, not separate account types.

A user’s trust level may change. Their identity does not.

---

### 6. Auth Must Survive Device Changes

We assume users will:

* Switch phones
* Switch laptops
* Use multiple ecosystems

Our auth model must allow seamless re-entry using *any* previously linked provider, without panic or lockout.

Redundancy through multiple providers replaces traditional recovery flows.

---

### 7. Progressive Enhancement

Some auth technologies are powerful but immature.

Our rule:

* Do not lead with complexity
* Introduce advanced options **after** trust is established

Examples:

* Passkeys → optional, post-signup convenience
* Email-based access → fallback only when needed

---

## What We Deliberately Avoid (At Launch)

* Password-based authentication
* Mandatory email magic links
* Passkeys as a primary login method
* Provider-specific account silos

These add cognitive overhead without clear user benefit early on.

---

## Success Criteria

Our authentication system is successful if:

* Users never ask “Which login did I use?”
* Switching devices feels effortless
* Support tickets about access are rare
* Identity feels stable, even as features evolve

If authentication becomes invisible, we’ve done it right.

---

## Guiding Question for Future Changes

Before adding or changing authentication behavior, ask:

> **Does this reduce confusion while preserving identity continuity?**

If the answer is not clearly yes, we don’t ship it.
