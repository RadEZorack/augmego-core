import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { PrismaClient } from "@prisma/client";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import jwt from "jsonwebtoken";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { parseCookies, serializeCookie } from "./lib/cookies.js";
import { resolveSessionUser } from "./lib/session.js";
import { registerRealtimeWs } from "./realtime/ws.js";

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

const APPLE_AUTH_URL =
  process.env.APPLE_AUTH_URL ?? "https://appleid.apple.com/auth/authorize";
const APPLE_TOKEN_URL =
  process.env.APPLE_TOKEN_URL ?? "https://appleid.apple.com/auth/token";
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID ?? "";
const APPLE_CLIENT_SECRET = process.env.APPLE_CLIENT_SECRET ?? "";
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID ?? "";
const APPLE_KEY_ID = process.env.APPLE_KEY_ID ?? "";
const APPLE_PRIVATE_KEY = process.env.APPLE_PRIVATE_KEY ?? "";
const APPLE_REDIRECT_URI = process.env.APPLE_REDIRECT_URI ?? "";
const APPLE_SCOPE = process.env.APPLE_SCOPE ?? "name email";

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:3001";
const WEB_ORIGINS =
  process.env.WEB_ORIGINS?.split(",").map((origin) => origin.trim()) ?? [];
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "session_id";
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? "168");
const MAX_CHAT_HISTORY = Number(process.env.MAX_CHAT_HISTORY ?? "100");
const MAX_CHAT_MESSAGE_LENGTH = Number(
  process.env.MAX_CHAT_MESSAGE_LENGTH ?? "500"
);
const WORLD_STORAGE_ROOT = process.env.WORLD_STORAGE_ROOT
  ? path.resolve(process.env.WORLD_STORAGE_ROOT)
  : path.resolve(process.cwd(), "storage", "world-assets");
const WORLD_STORAGE_NAMESPACE =
  process.env.WORLD_STORAGE_NAMESPACE ??
  (process.env.NODE_ENV === "production" ? "prod" : "dev");
const WORLD_STORAGE_PROVIDER = (process.env.WORLD_STORAGE_PROVIDER ??
  (process.env.DO_SPACES_KEY &&
  process.env.DO_SPACES_SECRET &&
  process.env.DO_SPACES_BUCKET
    ? "spaces"
    : "local")) as "local" | "spaces";
const DO_SPACES_KEY = process.env.DO_SPACES_KEY ?? "";
const DO_SPACES_SECRET = process.env.DO_SPACES_SECRET ?? "";
const DO_SPACES_BUCKET = process.env.DO_SPACES_BUCKET ?? "";
const DO_SPACES_REGION = process.env.DO_SPACES_REGION ?? "";
const DO_SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT ?? "";
const DO_SPACES_CUSTOM_DOMAIN = process.env.DO_SPACES_CUSTOM_DOMAIN ?? "";

const webOrigin = (() => {
  try {
    return new URL(WEB_BASE_URL).origin;
  } catch {
    return "http://localhost:3001";
  }
})();

const sessionSameSite =
  (process.env.COOKIE_SAMESITE as "Lax" | "Strict" | "None" | undefined) ??
  (webOrigin.startsWith("https://") ? "None" : "Lax");
const sessionSecure =
  process.env.COOKIE_SECURE === "true" || webOrigin.startsWith("https://");
const doSpacesConfigured = Boolean(
  DO_SPACES_KEY &&
    DO_SPACES_SECRET &&
    DO_SPACES_BUCKET &&
    DO_SPACES_REGION &&
    DO_SPACES_ENDPOINT
);
const effectiveWorldStorageProvider =
  WORLD_STORAGE_PROVIDER === "spaces" && doSpacesConfigured ? "spaces" : "local";

if (WORLD_STORAGE_PROVIDER === "spaces" && !doSpacesConfigured) {
  console.warn(
    "[world-storage] WORLD_STORAGE_PROVIDER=spaces but DigitalOcean Spaces env vars are incomplete; falling back to local storage."
  );
}

const spacesClient =
  effectiveWorldStorageProvider === "spaces"
    ? new S3Client({
        region: DO_SPACES_REGION,
        endpoint: DO_SPACES_ENDPOINT,
        credentials: {
          accessKeyId: DO_SPACES_KEY,
          secretAccessKey: DO_SPACES_SECRET
        }
      })
    : null;

function decodeJwtPayload(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload.padEnd(
    payload.length + ((4 - (payload.length % 4)) % 4),
    "="
  );
  try {
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function createAppleClientSecret() {
  if (!APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY || !APPLE_CLIENT_ID) {
    return "";
  }
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: APPLE_TEAM_ID,
      iat: now,
      exp: now + 60 * 60 * 24 * 180,
      aud: "https://appleid.apple.com",
      sub: APPLE_CLIENT_ID
    },
    APPLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    {
      algorithm: "ES256",
      keyid: APPLE_KEY_ID
    }
  );
}

function resolveAppleClientSecret() {
  if (APPLE_CLIENT_SECRET) return APPLE_CLIENT_SECRET;
  return createAppleClientSecret();
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

function sanitizeFilename(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "model.glb";
  return trimmed
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function toUrlSafeStorageKey(storageKey: string) {
  return storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveSpacesPublicBaseUrl() {
  if (DO_SPACES_CUSTOM_DOMAIN) {
    return normalizeBaseUrl(DO_SPACES_CUSTOM_DOMAIN);
  }

  try {
    const endpointUrl = new URL(DO_SPACES_ENDPOINT);
    return `${endpointUrl.protocol}//${DO_SPACES_BUCKET}.${endpointUrl.host}`;
  } catch {
    return "";
  }
}

function resolveWorldAssetPublicUrl(storageKey: string) {
  if (effectiveWorldStorageProvider !== "spaces") return null;
  const baseUrl = resolveSpacesPublicBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}/${toUrlSafeStorageKey(storageKey)}`;
}

function resolveWorldAssetFileUrl(versionId: string, storageKey: string) {
  return (
    resolveWorldAssetPublicUrl(storageKey) ??
    `/api/v1/world/assets/version/${versionId}/file`
  );
}

function toNumberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function resolveActiveWorldOwnerId(userId: string) {
  const membership = await prisma.partyMember.findUnique({
    where: { userId },
    include: {
      party: {
        select: {
          leaderId: true
        }
      }
    }
  });

  if (!membership) {
    return userId;
  }

  return membership.party.leaderId;
}

async function canManageWorldOwner(userId: string, worldOwnerId: string) {
  if (userId === worldOwnerId) return true;

  const membership = await prisma.partyMember.findUnique({
    where: { userId },
    include: {
      party: {
        select: {
          leaderId: true
        }
      }
    }
  });

  if (!membership) return false;
  if (membership.party.leaderId !== worldOwnerId) return false;
  return membership.role === "MANAGER" || membership.party.leaderId === userId;
}

async function saveWorldAssetFile(
  file: File,
  worldOwnerId: string,
  assetId: string,
  versionId: string
) {
  const sanitized = sanitizeFilename(file.name || "model.glb");
  const storageKey = path
    .join(WORLD_STORAGE_NAMESPACE, worldOwnerId, assetId, versionId, sanitized)
    .replace(/\\/g, "/");

  if (effectiveWorldStorageProvider === "spaces") {
    if (!spacesClient) {
      throw new Error("DigitalOcean Spaces client not configured");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    await spacesClient.send(
      new PutObjectCommand({
        Bucket: DO_SPACES_BUCKET,
        Key: storageKey,
        Body: bytes,
        ACL: "public-read",
        ContentType: file.type || "model/gltf-binary"
      })
    );

    return { storageKey };
  }

  const absolutePath = path.join(WORLD_STORAGE_ROOT, storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await Bun.write(absolutePath, file);
  return { storageKey };
}

function isValidGlbUpload(file: File) {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith(".glb");
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
    authUrl.searchParams.set("response_mode", "form_post");
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
        sameSite: "None",
        path: "/",
        secure: sessionSecure
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
        sameSite: "None",
        path: "/",
        maxAge: 0,
        secure: sessionSecure
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
        sameSite: "None",
        path: "/",
        secure: sessionSecure
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
        sameSite: "None",
        path: "/",
        maxAge: 0,
        secure: sessionSecure
      })
    );

    return new Response(null, { status: 302, headers });
  })
  .get("/auth/apple", async ({ request }) => {
    if (!APPLE_CLIENT_ID || !APPLE_REDIRECT_URI) {
      return new Response("Apple OAuth not configured", { status: 500 });
    }

    const state = crypto.randomUUID();
    const authUrl = new URL(APPLE_AUTH_URL);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("response_mode", "form_post");
    authUrl.searchParams.set("client_id", APPLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", APPLE_REDIRECT_URI);
    authUrl.searchParams.set("scope", APPLE_SCOPE);
    authUrl.searchParams.set("state", state);

    const headers = new Headers();
    headers.set("Location", authUrl.toString());
    headers.append(
      "Set-Cookie",
      serializeCookie("oauth_state_apple", state, {
        httpOnly: true,
        sameSite: "None",
        path: "/",
        secure: sessionSecure
      })
    );

    return new Response(null, { status: 302, headers });
  })
  .post("/auth/apple/callback", async ({ request }) => {
    const form = await request.formData();
    const code = form.get("code");
    const state = form.get("state");
    const userPayload = form.get("user");

    if (typeof code !== "string" || typeof state !== "string") {
      return new Response("Missing code or state", { status: 400 });
    }

    const cookies = parseCookies(request.headers.get("cookie"));
    if (!cookies.oauth_state_apple || cookies.oauth_state_apple !== state) {
      return new Response("Invalid state", { status: 400 });
    }

    const appleClientSecret = resolveAppleClientSecret();
    if (!APPLE_CLIENT_ID || !appleClientSecret || !APPLE_REDIRECT_URI) {
      return new Response("Apple OAuth not configured", { status: 500 });
    }

    const tokenRes = await fetch(APPLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: APPLE_REDIRECT_URI,
        client_id: APPLE_CLIENT_ID,
        client_secret: appleClientSecret
      })
    });

    console.log("Apple token response status:", tokenRes);
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return new Response(`Token exchange failed: ${text}`, { status: 502 });
    }

    const tokenData = (await tokenRes.json()) as {
      id_token?: string;
    };

    const idToken = tokenData.id_token;
    if (!idToken) {
      return new Response("Missing id token", { status: 502 });
    }

    const profile = decodeJwtPayload(idToken);
    if (!profile) {
      return new Response("Invalid id token", { status: 502 });
    }

    const appleId = String(profile.sub ?? "");
    if (!appleId) {
      return new Response("Apple user id missing", { status: 502 });
    }

    const email = (profile.email as string | undefined) ?? undefined;
    let name = (profile.name as string | undefined) ?? undefined;

    if (!name && typeof userPayload === "string") {
      try {
        const parsed = JSON.parse(userPayload) as {
          name?: { firstName?: string; lastName?: string };
        };
        const first = parsed.name?.firstName ?? "";
        const last = parsed.name?.lastName ?? "";
        const combined = `${first} ${last}`.trim();
        if (combined) {
          name = combined;
        }
      } catch {
        // ignore malformed user payload
      }
    }

    const existingByEmail = email
      ? await prisma.user.findFirst({ where: { email } })
      : null;

    if (existingByEmail?.appleId && existingByEmail.appleId !== appleId) {
      return new Response("Email already linked to another Apple account", {
        status: 409
      });
    }

    const user = existingByEmail
      ? await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            appleId,
            email: email ?? null,
            name: name ?? null
          }
        })
      : await prisma.user.upsert({
          where: { appleId },
          create: {
            appleId,
            email: email ?? null,
            name: name ?? null
          },
          update: {
            email: email ?? null,
            name: name ?? null
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
      serializeCookie("oauth_state_apple", "", {
        httpOnly: true,
        sameSite: "None",
        path: "/",
        maxAge: 0,
        secure: sessionSecure
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
  .get("/party/search", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.trim() ?? "";
    if (query.length < 2) {
      return jsonResponse({ results: [] });
    }

    const results = await prisma.user.findMany({
      where: {
        id: { not: user.id },
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true
      }
    });

    return jsonResponse({ results });
  })
  .get("/world", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const worldOwnerId = await resolveActiveWorldOwnerId(user.id);
    const canManage = await canManageWorldOwner(user.id, worldOwnerId);

    const [assets, placements] = await Promise.all([
      prisma.worldAsset.findMany({
        where: { worldOwnerId },
        include: {
          currentVersion: true,
          versions: {
            orderBy: { version: "desc" }
          }
        },
        orderBy: { updatedAt: "desc" }
      }),
      prisma.worldPlacement.findMany({
        where: { worldOwnerId },
        include: {
          asset: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: "asc" }
      })
    ]);

    return jsonResponse({
      worldOwnerId,
      canManage,
      assets: assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        createdAt: asset.createdAt.toISOString(),
        updatedAt: asset.updatedAt.toISOString(),
        currentVersion: asset.currentVersion
          ? {
              id: asset.currentVersion.id,
              version: asset.currentVersion.version,
              originalName: asset.currentVersion.originalName,
              contentType: asset.currentVersion.contentType,
              sizeBytes: asset.currentVersion.sizeBytes,
              createdAt: asset.currentVersion.createdAt.toISOString(),
              fileUrl: resolveWorldAssetFileUrl(
                asset.currentVersion.id,
                asset.currentVersion.storageKey
              )
            }
          : null,
        versions: asset.versions.map((version) => ({
          id: version.id,
          version: version.version,
          originalName: version.originalName,
          contentType: version.contentType,
          sizeBytes: version.sizeBytes,
          createdAt: version.createdAt.toISOString(),
          fileUrl: resolveWorldAssetFileUrl(version.id, version.storageKey)
        }))
      })),
      placements: placements.map((placement) => ({
        id: placement.id,
        assetId: placement.assetId,
        assetName: placement.asset.name,
        position: {
          x: placement.positionX,
          y: placement.positionY,
          z: placement.positionZ
        },
        rotation: {
          x: placement.rotationX,
          y: placement.rotationY,
          z: placement.rotationZ
        },
        scale: {
          x: placement.scaleX,
          y: placement.scaleY,
          z: placement.scaleZ
        },
        createdAt: placement.createdAt.toISOString(),
        updatedAt: placement.updatedAt.toISOString()
      }))
    });
  })
  .post("/world/assets", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const worldOwnerId = await resolveActiveWorldOwnerId(user.id);
    const canManage = await canManageWorldOwner(user.id, worldOwnerId);
    if (!canManage) {
      return jsonResponse(
        { error: "NOT_PARTY_MANAGER_OR_LEADER" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const fileValue = formData.get("file");
    if (!(fileValue instanceof File)) {
      return jsonResponse({ error: "FILE_REQUIRED" }, { status: 400 });
    }
    if (!isValidGlbUpload(fileValue)) {
      return jsonResponse({ error: "INVALID_GLB_FILE" }, { status: 400 });
    }

    const rawName = String(formData.get("name") ?? "").trim();
    const modelName =
      rawName ||
      sanitizeFilename(fileValue.name.replace(/\.glb$/i, "")).replace(/_/g, " ");
    const assetId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const saved = await saveWorldAssetFile(fileValue, worldOwnerId, assetId, versionId);

    await prisma.$transaction(async (tx) => {
      await tx.worldAsset.create({
        data: {
          id: assetId,
          worldOwnerId,
          createdById: user.id,
          name: modelName
        }
      });

      await tx.worldAssetVersion.create({
        data: {
          id: versionId,
          assetId,
          createdById: user.id,
          version: 1,
          storageKey: saved.storageKey,
          originalName: fileValue.name,
          contentType: fileValue.type || "model/gltf-binary",
          sizeBytes: fileValue.size
        }
      });

      await tx.worldAsset.update({
        where: { id: assetId },
        data: {
          currentVersionId: versionId
        }
      });
    });

    return jsonResponse({ ok: true, assetId, versionId });
  })
  .post("/world/assets/:assetId/versions", async ({ request, params }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const assetId = String((params as Record<string, unknown>).assetId ?? "");
    if (!assetId) {
      return jsonResponse({ error: "ASSET_ID_REQUIRED" }, { status: 400 });
    }

    const asset = await prisma.worldAsset.findUnique({
      where: { id: assetId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1
        }
      }
    });

    if (!asset) {
      return jsonResponse({ error: "ASSET_NOT_FOUND" }, { status: 404 });
    }

    const worldOwnerId = await resolveActiveWorldOwnerId(user.id);
    if (worldOwnerId !== asset.worldOwnerId) {
      return jsonResponse({ error: "WORLD_ACCESS_DENIED" }, { status: 403 });
    }

    const canManage = await canManageWorldOwner(user.id, asset.worldOwnerId);
    if (!canManage) {
      return jsonResponse(
        { error: "NOT_PARTY_MANAGER_OR_LEADER" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const fileValue = formData.get("file");
    if (!(fileValue instanceof File)) {
      return jsonResponse({ error: "FILE_REQUIRED" }, { status: 400 });
    }
    if (!isValidGlbUpload(fileValue)) {
      return jsonResponse({ error: "INVALID_GLB_FILE" }, { status: 400 });
    }

    const versionId = crypto.randomUUID();
    const nextVersion = (asset.versions[0]?.version ?? 0) + 1;
    const saved = await saveWorldAssetFile(
      fileValue,
      asset.worldOwnerId,
      asset.id,
      versionId
    );
    const maybeNewName = String(formData.get("name") ?? "").trim();

    await prisma.$transaction(async (tx) => {
      await tx.worldAssetVersion.create({
        data: {
          id: versionId,
          assetId: asset.id,
          createdById: user.id,
          version: nextVersion,
          storageKey: saved.storageKey,
          originalName: fileValue.name,
          contentType: fileValue.type || "model/gltf-binary",
          sizeBytes: fileValue.size
        }
      });

      await tx.worldAsset.update({
        where: { id: asset.id },
        data: {
          currentVersionId: versionId,
          ...(maybeNewName ? { name: maybeNewName } : {})
        }
      });
    });

    return jsonResponse({ ok: true, assetId: asset.id, versionId, nextVersion });
  })
  .post("/world/placements", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const worldOwnerId = await resolveActiveWorldOwnerId(user.id);
    const canManage = await canManageWorldOwner(user.id, worldOwnerId);
    if (!canManage) {
      return jsonResponse(
        { error: "NOT_PARTY_MANAGER_OR_LEADER" },
        { status: 403 }
      );
    }

    const payload = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const assetId = typeof payload?.assetId === "string" ? payload.assetId : "";
    if (!assetId) {
      return jsonResponse({ error: "ASSET_ID_REQUIRED" }, { status: 400 });
    }

    const asset = await prisma.worldAsset.findFirst({
      where: {
        id: assetId,
        worldOwnerId
      },
      select: { id: true }
    });

    if (!asset) {
      return jsonResponse({ error: "ASSET_NOT_FOUND" }, { status: 404 });
    }

    const position =
      payload?.position && typeof payload.position === "object"
        ? (payload.position as Record<string, unknown>)
        : {};
    const rotation =
      payload?.rotation && typeof payload.rotation === "object"
        ? (payload.rotation as Record<string, unknown>)
        : {};
    const scale =
      payload?.scale && typeof payload.scale === "object"
        ? (payload.scale as Record<string, unknown>)
        : {};

    const placement = await prisma.worldPlacement.create({
      data: {
        worldOwnerId,
        assetId,
        createdById: user.id,
        positionX: toNumberOrDefault(position.x, 0),
        positionY: toNumberOrDefault(position.y, 0),
        positionZ: toNumberOrDefault(position.z, 0),
        rotationX: toNumberOrDefault(rotation.x, 0),
        rotationY: toNumberOrDefault(rotation.y, 0),
        rotationZ: toNumberOrDefault(rotation.z, 0),
        scaleX: toNumberOrDefault(scale.x, 1),
        scaleY: toNumberOrDefault(scale.y, 1),
        scaleZ: toNumberOrDefault(scale.z, 1)
      }
    });

    return jsonResponse({
      ok: true,
      placementId: placement.id
    });
  })
  .patch("/world/placements/:placementId", async ({ request, params }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const worldOwnerId = await resolveActiveWorldOwnerId(user.id);
    const canManage = await canManageWorldOwner(user.id, worldOwnerId);
    if (!canManage) {
      return jsonResponse(
        { error: "NOT_PARTY_MANAGER_OR_LEADER" },
        { status: 403 }
      );
    }

    const placementId = String(
      (params as Record<string, unknown>).placementId ?? ""
    );
    const placement = await prisma.worldPlacement.findUnique({
      where: { id: placementId },
      select: { id: true, worldOwnerId: true }
    });
    if (!placement || placement.worldOwnerId !== worldOwnerId) {
      return jsonResponse({ error: "PLACEMENT_NOT_FOUND" }, { status: 404 });
    }

    const payload = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const position =
      payload?.position && typeof payload.position === "object"
        ? (payload.position as Record<string, unknown>)
        : null;
    const rotation =
      payload?.rotation && typeof payload.rotation === "object"
        ? (payload.rotation as Record<string, unknown>)
        : null;
    const scale =
      payload?.scale && typeof payload.scale === "object"
        ? (payload.scale as Record<string, unknown>)
        : null;

    await prisma.worldPlacement.update({
      where: { id: placementId },
      data: {
        ...(position
          ? {
              positionX: toNumberOrDefault(position.x, 0),
              positionY: toNumberOrDefault(position.y, 0),
              positionZ: toNumberOrDefault(position.z, 0)
            }
          : {}),
        ...(rotation
          ? {
              rotationX: toNumberOrDefault(rotation.x, 0),
              rotationY: toNumberOrDefault(rotation.y, 0),
              rotationZ: toNumberOrDefault(rotation.z, 0)
            }
          : {}),
        ...(scale
          ? {
              scaleX: toNumberOrDefault(scale.x, 1),
              scaleY: toNumberOrDefault(scale.y, 1),
              scaleZ: toNumberOrDefault(scale.z, 1)
            }
          : {})
      }
    });

    return jsonResponse({ ok: true });
  })
  .delete("/world/placements/:placementId", async ({ request, params }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const worldOwnerId = await resolveActiveWorldOwnerId(user.id);
    const canManage = await canManageWorldOwner(user.id, worldOwnerId);
    if (!canManage) {
      return jsonResponse(
        { error: "NOT_PARTY_MANAGER_OR_LEADER" },
        { status: 403 }
      );
    }

    const placementId = String(
      (params as Record<string, unknown>).placementId ?? ""
    );
    const placement = await prisma.worldPlacement.findUnique({
      where: { id: placementId },
      select: { id: true, worldOwnerId: true }
    });
    if (!placement || placement.worldOwnerId !== worldOwnerId) {
      return jsonResponse({ error: "PLACEMENT_NOT_FOUND" }, { status: 404 });
    }

    await prisma.worldPlacement.delete({
      where: { id: placementId }
    });

    return jsonResponse({ ok: true });
  })
  .get("/world/assets/version/:versionId/file", async ({ request, params }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return new Response("Auth required", { status: 401 });
    }

    const versionId = String((params as Record<string, unknown>).versionId ?? "");
    const version = await prisma.worldAssetVersion.findUnique({
      where: { id: versionId },
      include: {
        asset: {
          select: {
            worldOwnerId: true
          }
        }
      }
    });

    if (!version) {
      return new Response("Not found", { status: 404 });
    }

    const activeWorldOwnerId = await resolveActiveWorldOwnerId(user.id);
    if (activeWorldOwnerId !== version.asset.worldOwnerId) {
      return new Response("Forbidden", { status: 403 });
    }

    const publicUrl = resolveWorldAssetPublicUrl(version.storageKey);
    if (publicUrl) {
      return Response.redirect(publicUrl, 302);
    }

    const filePath = path.join(WORLD_STORAGE_ROOT, version.storageKey);
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(file, {
      headers: {
        "Content-Type": version.contentType || "model/gltf-binary",
        "Cache-Control": "private, max-age=120"
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

const port = Number(process.env.PORT) || 3000;

const app = registerRealtimeWs(
  new Elysia()
    .use(
      cors({
        origin: WEB_ORIGINS.length ? WEB_ORIGINS : [webOrigin],
        credentials: true
      })
    )
    .get("/", () => "Augmego Core API"),
  {
    prisma,
    sessionCookieName: SESSION_COOKIE_NAME,
    maxChatHistory: MAX_CHAT_HISTORY,
    maxChatMessageLength: MAX_CHAT_MESSAGE_LENGTH
  }
)
  .use(api)
  .listen(port);

console.log(`Elysia server running on port ${port}`);
console.log(
  `[world-storage] provider=${effectiveWorldStorageProvider} namespace=${WORLD_STORAGE_NAMESPACE}`
);
