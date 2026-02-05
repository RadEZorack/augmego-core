Augmego – Technical & Product Strategy Summary
This document summarizes the current architectural, infrastructure, branding, authentication, and
monetization decisions for Augmego. The goal is long-term clarity, low operational complexity, and a
system that scales without sacrificing understandability.
1. Core Technical Architecture
Augmego is built on a deliberately simple, explicit, and modern stack. The system favors clarity over
abstraction and avoids unnecessary framework or vendor lock-in.
• Runtime: Bun (fast startup, native TypeScript, minimal tooling overhead)
• Backend Framework: Elysia (lightweight, Bun-native HTTP and WebSocket handling)
• Database Access: Prisma ORM (schema-as-code, migrations, type safety)
• Primary Database: PostgreSQL (used consistently across environments)
• Caching Layer: Valkey (shared dev instance, strict key namespacing, TTL-first design)
• Realtime Communication: Native WebSockets (no Socket.IO abstraction layer)
2. Environment & Infrastructure Strategy
The infrastructure model prioritizes parity between development and production while minimizing local
developer setup requirements.
• Hosting: DigitalOcean (managed Postgres, managed Valkey, simple VM-based services)
• Containers: Docker intentionally avoided for simplicity and transparency
• Development Database: Shared PostgreSQL instance hosted on DigitalOcean
• Development Cache: Shared Valkey instance with enforced environment and user namespaces
• Staging Environment: Separate Postgres and Valkey instances added as the product matures
3. Authentication Model
Augmego uses a values-driven authentication model designed to promote professionalism, reduce abuse,
and outsource identity verification.
• Primary Auth Provider: LinkedIn OAuth (real-identity, professional context)
• Philosophy: If an action is not permitted on LinkedIn, it is not permitted on Augmego
• Benefits: Reduced moderation burden, fewer fake accounts, improved community behavior
• Architecture Note: Auth is internally abstracted to allow future providers if needed
4. Pricing & Monetization Philosophy
Augmego intentionally avoids subscription-based monetization. Pricing emphasizes ownership,
transparency, and long-term goodwill.
• Free Tier: Required; provides core access and supports network growth
• One-Time Rank Purchases: Basic, Premium, Ultra (permanent account upgrades)
• Ranks: Visible, identity-linked, and non-expiring
• Optional Spend: Cosmetic perks, boosts, storage extensions, or compute usage
• Donations: Supported for community signaling and recognition, not primary revenue
5. Branding & Domain Strategy
Brand clarity and trust are prioritized through a clean canonical domain and intentional redirects.
• Primary Brand: Augmego (spoken and written without hyphens)
• Canonical Domain: augmego.ca
• Redirect Domains: aug-me-go.ca and augmego.com redirect to canonical
• Rationale: Ease of recall, spoken clarity, Canadian trust signal
• Hyphenated Domain Use: Teaching and explanation, not identity
6. Guiding Principles
Across all decisions, Augmego prioritizes explicit systems, minimal magic, teachable architecture, and
long-term maintainability. Every component should be understandable by a junior developer and
defensible to a senior architect.