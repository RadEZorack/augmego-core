import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LINKEDIN_AUTH_URL =
  process.env.LINKEDIN_AUTH_URL ??
  "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL =
  process.env.LINKEDIN_TOKEN_URL ??
  "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL =
  process.env.LINKEDIN_USERINFO_URL ??
  "https://api.linkedin.com/v2/userinfo";
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID ?? "";
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET ?? "";
const LINKEDIN_REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI ?? "";
const LINKEDIN_SCOPE =
  process.env.LINKEDIN_SCOPE ?? "r_liteprofile r_emailaddress";

const GOOGLE_AUTH_URL =
  process.env.GOOGLE_AUTH_URL ??
  "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL =
  process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL =
  process.env.GOOGLE_USERINFO_URL ??
  "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? "";
const GOOGLE_SCOPE = process.env.GOOGLE_SCOPE ?? "openid email profile";

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:5173";
const WEB_ORIGINS =
  process.env.WEB_ORIGINS?.split(",").map((origin) => origin.trim()) ?? [];
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "session_id";
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? "168");

const webOrigin = (() => {
  try {
    return new URL(WEB_BASE_URL).origin;
  } catch {
    return "http://localhost:5173";
  }
})();

const sessionSameSite =
  (process.env.COOKIE_SAMESITE as "Lax" | "Strict" | "None" | undefined) ??
  (webOrigin.startsWith("https://") ? "None" : "Lax");
const sessionSecure =
  process.env.COOKIE_SECURE === "true" || webOrigin.startsWith("https://");

function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    path?: string;
    maxAge?: number;
  } = {}
) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function parseCookies(header: string | null) {
  const out: Record<string, string> = {};
  if (!header) return out;
  const pairs = header.split(";");
  for (const pair of pairs) {
    const [rawKey, ...rest] = pair.trim().split("=");
    if (!rawKey) continue;
    out[rawKey] = decodeURIComponent(rest.join("=") ?? "");
  }
  return out;
}

function jsonResponse(
  body: unknown,
  options: { status?: number; headers?: Headers } = {}
) {
  const headers = options.headers ?? new Headers();
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers
  });
}

const api = new Elysia({ prefix: "/api/v1" })
  .get("/health", () => ({ ok: true }))
  .get("/examples", async () => {
    return prisma.example.findMany({
      orderBy: { id: "desc" },
      take: 20
    });
  })
  .get("/auth/linkedin", async ({ request }) => {
    if (!LINKEDIN_CLIENT_ID || !LINKEDIN_REDIRECT_URI) {
      return new Response("LinkedIn OAuth not configured", { status: 500 });
    }

    const state = crypto.randomUUID();
    const authUrl = new URL(LINKEDIN_AUTH_URL);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", LINKEDIN_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", LINKEDIN_REDIRECT_URI);
    authUrl.searchParams.set("scope", LINKEDIN_SCOPE);
    authUrl.searchParams.set("state", state);

    const headers = new Headers();
    headers.set("Location", authUrl.toString());
    headers.append(
      "Set-Cookie",
      serializeCookie("oauth_state_linkedin", state, {
        httpOnly: true,
        sameSite: "Lax",
        path: "/"
      })
    );

    return new Response(null, { status: 302, headers });
  })
  .get("/auth/linkedin/callback", async ({ request }) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return new Response("Missing code or state", { status: 400 });
    }

    const cookies = parseCookies(request.headers.get("cookie"));
    if (
      !cookies.oauth_state_linkedin ||
      cookies.oauth_state_linkedin !== state
    ) {
      return new Response("Invalid state", { status: 400 });
    }

    if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET || !LINKEDIN_REDIRECT_URI) {
      return new Response("LinkedIn OAuth not configured", { status: 500 });
    }

    const tokenRes = await fetch(LINKEDIN_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: LINKEDIN_REDIRECT_URI,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET
      })
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return new Response(`Token exchange failed: ${text}`, { status: 502 });
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
    };

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return new Response("Missing access token", { status: 502 });
    }

    const profileRes = await fetch(LINKEDIN_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!profileRes.ok) {
      const text = await profileRes.text();
      return new Response(`Userinfo failed: ${text}`, { status: 502 });
    }

    const profile = (await profileRes.json()) as Record<string, unknown>;
    const linkedinId = String(profile.sub ?? profile.id ?? "");

    if (!linkedinId) {
      return new Response("LinkedIn user id missing", { status: 502 });
    }

    const localizedFirstName = profile.localizedFirstName as string | undefined;
    const localizedLastName = profile.localizedLastName as string | undefined;
    const name =
      (profile.name as string | undefined) ??
      ([localizedFirstName, localizedLastName].filter(Boolean).join(" ") ||
      undefined);

    const email =
      (profile.email as string | undefined) ??
      (profile.emailAddress as string | undefined);

    const avatarUrl =
      (profile.picture as string | undefined) ??
      (profile.profilePicture as string | undefined);

    const existingByEmail = email
      ? await prisma.user.findFirst({ where: { email } })
      : null;

    if (
      existingByEmail?.linkedinId &&
      existingByEmail.linkedinId !== linkedinId
    ) {
      return new Response("Email already linked to another LinkedIn account", {
        status: 409
      });
    }

    const user = existingByEmail
      ? await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            linkedinId,
            email: email ?? null,
            name: name ?? null,
            avatarUrl: avatarUrl ?? null
          }
        })
      : await prisma.user.upsert({
          where: { linkedinId },
          create: {
            linkedinId,
            email: email ?? null,
            name: name ?? null,
            avatarUrl: avatarUrl ?? null
          },
          update: {
            email: email ?? null,
            name: name ?? null,
            avatarUrl: avatarUrl ?? null
          }
        });

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000
    );

    await prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        expiresAt
      }
    });

    const headers = new Headers();
    headers.set("Location", WEB_BASE_URL);
    headers.append(
      "Set-Cookie",
      serializeCookie(SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        sameSite: sessionSameSite,
        path: "/",
        maxAge: SESSION_TTL_HOURS * 60 * 60,
        secure: sessionSecure
      })
    );
    headers.append(
      "Set-Cookie",
      serializeCookie("oauth_state_linkedin", "", {
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 0
      })
    );

    return new Response(null, { status: 302, headers });
  })
  .get("/auth/google", async ({ request }) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
      return new Response("Google OAuth not configured", { status: 500 });
    }

    const state = crypto.randomUUID();
    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set("scope", GOOGLE_SCOPE);
    authUrl.searchParams.set("state", state);

    const headers = new Headers();
    headers.set("Location", authUrl.toString());
    headers.append(
      "Set-Cookie",
      serializeCookie("oauth_state_google", state, {
        httpOnly: true,
        sameSite: "Lax",
        path: "/"
      })
    );

    return new Response(null, { status: 302, headers });
  })
  .get("/auth/google/callback", async ({ request }) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return new Response("Missing code or state", { status: 400 });
    }

    const cookies = parseCookies(request.headers.get("cookie"));
    if (!cookies.oauth_state_google || cookies.oauth_state_google !== state) {
      return new Response("Invalid state", { status: 400 });
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      return new Response("Google OAuth not configured", { status: 500 });
    }

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: GOOGLE_REDIRECT_URI,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET
      })
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return new Response(`Token exchange failed: ${text}`, { status: 502 });
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
    };

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return new Response("Missing access token", { status: 502 });
    }

    const profileRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!profileRes.ok) {
      const text = await profileRes.text();
      return new Response(`Userinfo failed: ${text}`, { status: 502 });
    }

    const profile = (await profileRes.json()) as Record<string, unknown>;
    const googleId = String(profile.sub ?? "");

    if (!googleId) {
      return new Response("Google user id missing", { status: 502 });
    }

    const name = (profile.name as string | undefined) ?? undefined;
    const email = (profile.email as string | undefined) ?? undefined;
    const avatarUrl = (profile.picture as string | undefined) ?? undefined;

    const existingByEmail = email
      ? await prisma.user.findFirst({ where: { email } })
      : null;

    if (existingByEmail?.googleId && existingByEmail.googleId !== googleId) {
      return new Response("Email already linked to another Google account", {
        status: 409
      });
    }

    const user = existingByEmail
      ? await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            googleId,
            email: email ?? null,
            name: name ?? null,
            avatarUrl: avatarUrl ?? null
          }
        })
      : await prisma.user.upsert({
          where: { googleId },
          create: {
            googleId,
            email: email ?? null,
            name: name ?? null,
            avatarUrl: avatarUrl ?? null
          },
          update: {
            email: email ?? null,
            name: name ?? null,
            avatarUrl: avatarUrl ?? null
          }
        });

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000
    );

    await prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        expiresAt
      }
    });

    const headers = new Headers();
    headers.set("Location", WEB_BASE_URL);
    headers.append(
      "Set-Cookie",
      serializeCookie(SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        sameSite: sessionSameSite,
        path: "/",
        maxAge: SESSION_TTL_HOURS * 60 * 60,
        secure: sessionSecure
      })
    );
    headers.append(
      "Set-Cookie",
      serializeCookie("oauth_state_google", "", {
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 0
      })
    );

    return new Response(null, { status: 302, headers });
  })
  .get("/auth/me", async ({ request }) => {
    const cookies = parseCookies(request.headers.get("cookie"));
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (!sessionId) {
      return jsonResponse({ user: null });
    }

    const now = new Date();
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        revokedAt: null,
        expiresAt: { gt: now }
      },
      include: { user: true }
    });

    if (!session) {
      const headers = new Headers();
      headers.append(
        "Set-Cookie",
        serializeCookie(SESSION_COOKIE_NAME, "", {
          httpOnly: true,
          sameSite: sessionSameSite,
          path: "/",
          maxAge: 0,
          secure: sessionSecure
        })
      );
      return jsonResponse({ user: null }, { headers });
    }

    const { user } = session;
    return jsonResponse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl
      }
    });
  })
  .post("/auth/logout", async ({ request }) => {
    const cookies = parseCookies(request.headers.get("cookie"));
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (sessionId) {
      await prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }

    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      serializeCookie(SESSION_COOKIE_NAME, "", {
        httpOnly: true,
        sameSite: sessionSameSite,
        path: "/",
        maxAge: 0,
        secure: sessionSecure
      })
    );

    return jsonResponse({ ok: true }, { headers });
  });

const app = new Elysia()
  .use(
    cors({
      origin: WEB_ORIGINS.length ? WEB_ORIGINS : [webOrigin],
      credentials: true
    })
  )
  .get("/", () => "Augmego Core API")
  .use(api)
  .listen(3000);

console.log(
  `Elysia server running at http://${app.server?.hostname}:${app.server?.port}`
);
