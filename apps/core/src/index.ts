import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { PrismaClient, WorldAssetVisibility } from "@prisma/client";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import jwt from "jsonwebtoken";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { parseCookies, serializeCookie } from "./lib/cookies.js";
import { resolveSessionUser } from "./lib/session.js";
import { countOnlineUsersByIds, registerRealtimeWs } from "./realtime/ws.js";

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
  process.env.WEB_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];
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
const MESHY_API_BASE_URL = normalizeBaseUrl(
  process.env.MESHY_API_BASE_URL ?? "https://api.meshy.ai"
);
const MESHY_API_KEY = process.env.MESHY_API_KEY ?? "";
const MESHY_TEXT_TO_3D_MODEL = process.env.MESHY_TEXT_TO_3D_MODEL ?? "";
const MESHY_TEXT_TO_3D_ENABLE_REFINE =
  (process.env.MESHY_TEXT_TO_3D_ENABLE_REFINE ?? "true").toLowerCase() !==
  "false";
const MESHY_TEXT_TO_3D_REFINE_MODEL =
  process.env.MESHY_TEXT_TO_3D_REFINE_MODEL ?? "";
const MESHY_TEXT_TO_3D_ENABLE_PBR =
  (process.env.MESHY_TEXT_TO_3D_ENABLE_PBR ?? "false").toLowerCase() ===
  "true";
const MESHY_TEXT_TO_3D_TOPOLOGY = (
  process.env.MESHY_TEXT_TO_3D_TOPOLOGY ?? "triangle"
).toLowerCase();
type MeshyPoseMode = "t-pose" | "a-pose";
const MESHY_HUMANOID_POSE_MODE: MeshyPoseMode =
  (process.env.MESHY_HUMANOID_POSE_MODE ?? "a-pose").toLowerCase() ===
  "t-pose"
    ? "t-pose"
    : "a-pose";
const MESHY_TEXT_TO_3D_TARGET_POLYCOUNT = (() => {
  const value = Number(process.env.MESHY_TEXT_TO_3D_TARGET_POLYCOUNT ?? "");
  if (!Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  if (normalized < 100 || normalized > 300000) {
    console.warn(
      "[world-generation] MESHY_TEXT_TO_3D_TARGET_POLYCOUNT is out of range (100-300000); ignoring."
    );
    return null;
  }
  return normalized;
})();
const WORLD_ASSET_GENERATION_WORKER_INTERVAL_MS = toPositiveInteger(
  process.env.WORLD_ASSET_GENERATION_WORKER_INTERVAL_MS,
  5000
);
const WORLD_ASSET_GENERATION_POLL_INTERVAL_MS = toPositiveInteger(
  process.env.WORLD_ASSET_GENERATION_POLL_INTERVAL_MS,
  15000
);
const WORLD_ASSET_GENERATION_RECENT_LIMIT = toPositiveInteger(
  process.env.WORLD_ASSET_GENERATION_RECENT_LIMIT,
  20
);
const WORLD_ASSET_GENERATION_MAX_ATTEMPTS = toPositiveInteger(
  process.env.WORLD_ASSET_GENERATION_MAX_ATTEMPTS,
  5
);
const DEFAULT_WORLD_PORTAL_LAT = 43.090003;
const DEFAULT_WORLD_PORTAL_LNG = -79.068051;

type WorldHomeCity = {
  key: string;
  cityName: string;
  countryName: string;
  timezone: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
};

const WORLD_HOME_CITIES: readonly WorldHomeCity[] = [
  {
    key: "us-new-york",
    cityName: "New York",
    countryName: "United States",
    timezone: "America/New_York",
    centerLat: 40.7128,
    centerLng: -74.006,
    radiusKm: 18
  },
  {
    key: "us-chicago",
    cityName: "Chicago",
    countryName: "United States",
    timezone: "America/Chicago",
    centerLat: 41.8781,
    centerLng: -87.6298,
    radiusKm: 16
  },
  {
    key: "us-denver",
    cityName: "Denver",
    countryName: "United States",
    timezone: "America/Denver",
    centerLat: 39.7392,
    centerLng: -104.9903,
    radiusKm: 16
  },
  {
    key: "us-los-angeles",
    cityName: "Los Angeles",
    countryName: "United States",
    timezone: "America/Los_Angeles",
    centerLat: 34.0522,
    centerLng: -118.2437,
    radiusKm: 20
  },
  {
    key: "ca-toronto",
    cityName: "Toronto",
    countryName: "Canada",
    timezone: "America/Toronto",
    centerLat: 43.6532,
    centerLng: -79.3832,
    radiusKm: 14
  },
  {
    key: "ca-winnipeg",
    cityName: "Winnipeg",
    countryName: "Canada",
    timezone: "America/Winnipeg",
    centerLat: 49.8951,
    centerLng: -97.1384,
    radiusKm: 14
  },
  {
    key: "ca-vancouver",
    cityName: "Vancouver",
    countryName: "Canada",
    timezone: "America/Vancouver",
    centerLat: 49.2827,
    centerLng: -123.1207,
    radiusKm: 14
  },
  {
    key: "uk-london",
    cityName: "London",
    countryName: "United Kingdom",
    timezone: "Europe/London",
    centerLat: 51.5074,
    centerLng: -0.1278,
    radiusKm: 18
  },
  {
    key: "eu-amsterdam",
    cityName: "Amsterdam",
    countryName: "Netherlands",
    timezone: "Europe/Amsterdam",
    centerLat: 52.3676,
    centerLng: 4.9041,
    radiusKm: 12
  },
  {
    key: "mx-mexico-city",
    cityName: "Mexico City",
    countryName: "Mexico",
    timezone: "America/Mexico_City",
    centerLat: 19.4326,
    centerLng: -99.1332,
    radiusKm: 18
  }
];

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

type UserAvatarSelection = {
  stationaryModelUrl: string | null;
  moveModelUrl: string | null;
  specialModelUrl: string | null;
};

function isMissingAvatarSelectionColumnsError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("playerAvatarStationaryModelUrl")
  );
}

async function loadUserAvatarSelection(userId: string): Promise<UserAvatarSelection> {
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        stationaryModelUrl: string | null;
        moveModelUrl: string | null;
        specialModelUrl: string | null;
      }>
    >`SELECT "playerAvatarStationaryModelUrl" AS "stationaryModelUrl", "playerAvatarMoveModelUrl" AS "moveModelUrl", "playerAvatarSpecialModelUrl" AS "specialModelUrl" FROM "User" WHERE "id" = CAST(${userId} AS uuid) LIMIT 1`;
    const row = rows[0];
    return {
      stationaryModelUrl: row?.stationaryModelUrl ?? null,
      moveModelUrl: row?.moveModelUrl ?? null,
      specialModelUrl: row?.specialModelUrl ?? null
    };
  } catch (error) {
    if (isMissingAvatarSelectionColumnsError(error)) {
      return {
        stationaryModelUrl: null,
        moveModelUrl: null,
        specialModelUrl: null
      };
    }
    throw error;
  }
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

function resolveWorldPostImageFileUrl(postId: string, storageKey: string) {
  return (
    resolveWorldAssetPublicUrl(storageKey) ??
    `/api/v1/world/posts/${postId}/image`
  );
}

function resolveWorldPhotoWallImageFileUrl(photoWallId: string, storageKey: string) {
  return (
    resolveWorldAssetPublicUrl(storageKey) ??
    `/api/v1/world/photo-walls/${photoWallId}/image`
  );
}

function toNumberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function normalizeAssetName(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 80);
}

function parseWorldAssetVisibility(value: unknown) {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "private") return WorldAssetVisibility.PRIVATE;
  if (normalized === "public") return WorldAssetVisibility.PUBLIC;
  return null;
}

function normalizeWorldAssetVisibility(value: unknown) {
  return parseWorldAssetVisibility(value) ?? WorldAssetVisibility.PUBLIC;
}

function normalizeWorldPostMessage(value: unknown) {
  const message = typeof value === "string" ? value.trim() : "";
  return message.slice(0, 500);
}

function normalizeWorldPostCommentMessage(value: unknown) {
  const message = typeof value === "string" ? value.trim() : "";
  return message.slice(0, 500);
}

function normalizeWorldPostImageUrl(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

function isValidImageUpload(file: File) {
  return file.size > 0 && file.type.toLowerCase().startsWith("image/");
}

function deriveModelNameFromPrompt(prompt: string) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  if (!compact) return "Generated Model";
  return compact.slice(0, 80);
}

type MeshyCreateTaskResponse = {
  result?: string;
  id?: string;
};

type MeshyTextTo3dTaskResponse = {
  id?: string;
  type?: string;
  status?: string;
  task_status?: string;
  model_urls?: Record<string, unknown> | null;
  glb_url?: string;
  preview_glb_url?: string;
};

type MeshyImageTo3dTaskResponse = {
  id?: string;
  status?: string;
  task_status?: string;
  model_urls?: Record<string, unknown> | null;
  glb_url?: string;
  preview_glb_url?: string;
};

type MeshyRiggingTaskResponse = {
  id?: string;
  status?: string;
  task_status?: string;
  result?: Record<string, unknown> | null;
  model_urls?: Record<string, unknown> | null;
  glb_url?: string;
  rigged_glb_url?: string;
  rigged_model_url?: string;
};

type MeshyAnimationTaskResponse = {
  id?: string;
  status?: string;
  task_status?: string;
  result?: Record<string, unknown> | null;
  model_urls?: Record<string, unknown> | null;
  glb_url?: string;
  animation_glb_url?: string;
};

type WorldAssetGenerationKind = "OBJECT" | "HUMANOID";
type WorldAssetGenerationSource = "TEXT" | "IMAGE";

type HumanoidAnimationSpec = {
  libraryId: number;
  name: string;
};

const HUMANOID_MESHY_ANIMATIONS: HumanoidAnimationSpec[] = [
  { libraryId: 11, name: "Idle_02" },
  { libraryId: 14, name: "Run_02" },
  { libraryId: 22, name: "FunnyDancing_01" }
];

function normalizeWorldAssetGenerationType(value: unknown): WorldAssetGenerationKind {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "humanoid" ? "HUMANOID" : "OBJECT";
}

function normalizeWorldAssetGenerationSource(
  value: unknown
): WorldAssetGenerationSource {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "image" ? "IMAGE" : "TEXT";
}

function normalizeEnhancedGraphicsToggle(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) return true;
  if (normalized === "false" || normalized === "0" || normalized === "off") {
    return false;
  }
  return true;
}

function resolveWorldAssetGenerationKind(task: {
  generationType?: string | null;
  meshyStatus?: string | null;
}): WorldAssetGenerationKind {
  const explicit = String(task.generationType ?? "").trim().toUpperCase();
  if (explicit === "HUMANOID") return "HUMANOID";
  if (String(task.meshyStatus ?? "").toUpperCase().startsWith("HUMANOID_")) {
    return "HUMANOID";
  }
  return "OBJECT";
}

function resolveWorldAssetGenerationSource(task: {
  generationSource?: string | null;
  sourceImageUrl?: string | null;
  meshyStatus?: string | null;
}): WorldAssetGenerationSource {
  const explicit = String(task.generationSource ?? "").trim().toUpperCase();
  if (explicit === "IMAGE") return "IMAGE";
  if (String(task.sourceImageUrl ?? "").trim()) return "IMAGE";
  if (String(task.meshyStatus ?? "").toUpperCase().includes("_IMAGE_")) {
    return "IMAGE";
  }
  return "TEXT";
}

async function getDefaultWorldNameForUser(userId: string) {
  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true }
  });
  return `${owner?.name ?? "My"}'s World`;
}

async function resolveOwnedWorldParty(userId: string) {
  const existing = await prisma.party.findFirst({
    where: { leaderId: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, leaderId: true }
  });
  if (existing) return existing;

  const defaultWorldName = await getDefaultWorldNameForUser(userId);
  return prisma.party.create({
    data: {
      leaderId: userId,
      name: defaultWorldName,
      isPublic: true,
      portalLat: DEFAULT_WORLD_PORTAL_LAT,
      portalLng: DEFAULT_WORLD_PORTAL_LNG,
      portalIsPublic: true
    },
    select: { id: true, leaderId: true }
  });
}

function normalizePortalLatitude(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < -90 || parsed > 90) return null;
  return parsed;
}

function normalizePortalLongitude(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < -180 || parsed > 180) return null;
  return parsed;
}

function normalizeLongitude(value: number) {
  let lng = value;
  while (lng < -180) lng += 360;
  while (lng > 180) lng -= 360;
  return lng;
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function randomPointNearCity(city: WorldHomeCity) {
  const earthRadiusM = 6_371_000;
  const distanceM = Math.sqrt(Math.random()) * city.radiusKm * 1000;
  const bearing = Math.random() * Math.PI * 2;

  const lat1 = toRadians(city.centerLat);
  const lng1 = toRadians(city.centerLng);
  const angularDistance = distanceM / earthRadiusM;

  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinAngularDistance = Math.sin(angularDistance);
  const cosAngularDistance = Math.cos(angularDistance);

  const lat2 = Math.asin(
    sinLat1 * cosAngularDistance +
      cosLat1 * sinAngularDistance * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * sinAngularDistance * cosLat1,
      cosAngularDistance - sinLat1 * Math.sin(lat2)
    );

  return {
    lat: Number(toDegrees(lat2).toFixed(6)),
    lng: Number(normalizeLongitude(toDegrees(lng2)).toFixed(6))
  };
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateFictionalAddress(city: WorldHomeCity) {
  const adjectives = [
    "North",
    "South",
    "East",
    "West",
    "Grand",
    "Liberty",
    "Cedar",
    "Maple",
    "King",
    "Queen",
    "River",
    "Harbor"
  ];
  const nouns = [
    "Beacon",
    "Harbor",
    "Summit",
    "Garden",
    "Bridge",
    "Market",
    "Park",
    "Gate",
    "Heights",
    "Station",
    "Point",
    "Square"
  ];
  const suffixes = ["St", "Ave", "Blvd", "Rd", "Ln", "Way", "Dr", "Pl"];
  const number = randomInt(10, 9999);
  const adjective = adjectives[randomInt(0, adjectives.length - 1)]!;
  const noun = nouns[randomInt(0, nouns.length - 1)]!;
  const suffix = suffixes[randomInt(0, suffixes.length - 1)]!;
  const districtCode = `${city.cityName.slice(0, 2).toUpperCase()}-${randomInt(100, 999)}`;
  return `${number} ${adjective} ${noun} ${suffix} (${districtCode})`;
}

async function resolveActiveWorldOwnerId(userId: string) {
  await resolveOwnedWorldParty(userId);

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

async function resolveActiveWorldPartyId(userId: string) {
  const membership = await prisma.partyMember.findUnique({
    where: { userId },
    select: { partyId: true }
  });
  if (membership) return membership.partyId;

  const ownedWorld = await resolveOwnedWorldParty(userId);
  return ownedWorld.id;
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

async function saveWorldPostImageFile(
  file: File,
  worldOwnerId: string,
  postId: string
) {
  const extensionFromType = file.type.split("/")[1]?.trim().toLowerCase() || "bin";
  const baseName = sanitizeFilename(file.name || `post_image.${extensionFromType}`);
  const storageKey = path
    .join(
      WORLD_STORAGE_NAMESPACE,
      worldOwnerId,
      "post-images",
      postId,
      `${crypto.randomUUID()}_${baseName}`
    )
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
        ContentType: file.type || "application/octet-stream"
      })
    );

    return { storageKey };
  }

  const absolutePath = path.join(WORLD_STORAGE_ROOT, storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await Bun.write(absolutePath, file);
  return { storageKey };
}

async function saveWorldGenerationImageFile(
  file: File,
  worldOwnerId: string,
  taskId: string
) {
  const extensionFromType = file.type.split("/")[1]?.trim().toLowerCase() || "bin";
  const baseName = sanitizeFilename(
    file.name || `generation_source.${extensionFromType}`
  );
  const storageKey = path
    .join(
      WORLD_STORAGE_NAMESPACE,
      worldOwnerId,
      "generation-images",
      taskId,
      `${crypto.randomUUID()}_${baseName}`
    )
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
        ContentType: file.type || "application/octet-stream"
      })
    );
    return { storageKey };
  }

  const absolutePath = path.join(WORLD_STORAGE_ROOT, storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await Bun.write(absolutePath, file);
  return { storageKey };
}

async function saveWorldPhotoWallImageFile(
  file: File,
  worldOwnerId: string,
  photoWallId: string
) {
  const extensionFromType = file.type.split("/")[1]?.trim().toLowerCase() || "bin";
  const baseName = sanitizeFilename(file.name || `photo_wall.${extensionFromType}`);
  const storageKey = path
    .join(
      WORLD_STORAGE_NAMESPACE,
      worldOwnerId,
      "photo-walls",
      photoWallId,
      `${crypto.randomUUID()}_${baseName}`
    )
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
        ContentType: file.type || "application/octet-stream"
      })
    );
    return { storageKey };
  }

  const absolutePath = path.join(WORLD_STORAGE_ROOT, storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await Bun.write(absolutePath, file);
  return { storageKey };
}

async function createWorldAssetWithInitialVersion(options: {
  worldOwnerId: string;
  createdById: string;
  modelName: string;
  visibility: WorldAssetVisibility;
  file: File;
}) {
  const assetId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const saved = await saveWorldAssetFile(
    options.file,
    options.worldOwnerId,
    assetId,
    versionId
  );

  await prisma.$transaction(async (tx) => {
    await tx.worldAsset.create({
      data: {
        id: assetId,
        worldOwnerId: options.worldOwnerId,
        createdById: options.createdById,
        name: options.modelName,
        visibility: options.visibility
      }
    });

    await tx.worldAssetVersion.create({
      data: {
        id: versionId,
        assetId,
        createdById: options.createdById,
        version: 1,
        storageKey: saved.storageKey,
        originalName: options.file.name || "model.glb",
        contentType: options.file.type || "model/gltf-binary",
        sizeBytes: options.file.size
      }
    });

    await tx.worldAsset.update({
      where: { id: assetId },
      data: {
        currentVersionId: versionId
      }
    });
  });

  return { assetId, versionId };
}

function normalizeAnimatedGlbMaterialLook(input: ArrayBuffer) {
  const source = new Uint8Array(input);
  if (source.byteLength < 20) return input;

  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  if (magic !== 0x46546c67 || version !== 2) {
    return input;
  }

  let offset = 12;
  let jsonChunk: Uint8Array | null = null;
  const otherChunks: Array<{ type: number; bytes: Uint8Array }> = [];

  while (offset + 8 <= source.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > source.byteLength) return input;

    const chunkBytes = source.slice(chunkStart, chunkEnd);
    if (chunkType === 0x4e4f534a) {
      jsonChunk = chunkBytes;
    } else {
      otherChunks.push({ type: chunkType, bytes: chunkBytes });
    }
    offset = chunkEnd;
  }

  if (!jsonChunk) return input;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const jsonText = decoder.decode(jsonChunk).replace(/\u0000+$/g, "").trimEnd();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return input;
  }

  const materials = Array.isArray(json.materials)
    ? (json.materials as Array<Record<string, unknown>>)
    : [];
  for (const material of materials) {
    const pbr =
      material.pbrMetallicRoughness &&
      typeof material.pbrMetallicRoughness === "object"
        ? (material.pbrMetallicRoughness as Record<string, unknown>)
        : {};
    pbr.metallicFactor = 0;
    const priorRoughness =
      typeof pbr.roughnessFactor === "number" ? pbr.roughnessFactor : 1;
    pbr.roughnessFactor = Math.max(0.88, priorRoughness);
    material.pbrMetallicRoughness = pbr;

    material.emissiveFactor = [0, 0, 0];
    delete material.emissiveTexture;

    if (material.extensions && typeof material.extensions === "object") {
      const extensions = material.extensions as Record<string, unknown>;
      delete extensions.KHR_materials_specular;
      if (Object.keys(extensions).length === 0) {
        delete material.extensions;
      } else {
        material.extensions = extensions;
      }
    }
  }

  const extensionsUsed = Array.isArray(json.extensionsUsed)
    ? (json.extensionsUsed as unknown[]).filter(
        (ext) => ext !== "KHR_materials_specular"
      )
    : null;
  if (extensionsUsed) {
    json.extensionsUsed = extensionsUsed;
  }
  const extensionsRequired = Array.isArray(json.extensionsRequired)
    ? (json.extensionsRequired as unknown[]).filter(
        (ext) => ext !== "KHR_materials_specular"
      )
    : null;
  if (extensionsRequired) {
    json.extensionsRequired = extensionsRequired;
  }

  let jsonBytes = encoder.encode(JSON.stringify(json));
  const jsonPadding = (4 - (jsonBytes.byteLength % 4)) % 4;
  if (jsonPadding > 0) {
    const padded = new Uint8Array(jsonBytes.byteLength + jsonPadding);
    padded.set(jsonBytes, 0);
    padded.fill(0x20, jsonBytes.byteLength);
    jsonBytes = padded;
  }

  const rebuiltChunks: Array<{ type: number; bytes: Uint8Array }> = [
    { type: 0x4e4f534a, bytes: jsonBytes },
    ...otherChunks
  ];

  const totalLength =
    12 +
    rebuiltChunks.reduce((sum, chunk) => sum + 8 + chunk.bytes.byteLength, 0);
  const out = new Uint8Array(totalLength);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, 0x46546c67, true);
  outView.setUint32(4, 2, true);
  outView.setUint32(8, totalLength, true);

  let outOffset = 12;
  for (const chunk of rebuiltChunks) {
    outView.setUint32(outOffset, chunk.bytes.byteLength, true);
    outView.setUint32(outOffset + 4, chunk.type, true);
    out.set(chunk.bytes, outOffset + 8);
    outOffset += 8 + chunk.bytes.byteLength;
  }

  return out.buffer;
}

async function downloadMeshyGlbAsFile(
  glbUrl: string,
  fileNameBase: string,
  options?: { normalizeMaterials?: boolean }
) {
  const glbResponse = await fetch(glbUrl);
  if (!glbResponse.ok) {
    throw new Error(
      `Failed to download generated GLB (${glbResponse.status} ${glbResponse.statusText})`
    );
  }

  let glbBytes = await glbResponse.arrayBuffer();
  if (options?.normalizeMaterials) {
    try {
      glbBytes = normalizeAnimatedGlbMaterialLook(glbBytes);
    } catch (error) {
      console.warn("[world-generation] GLB material normalization failed", error);
    }
  }
  const safeName = sanitizeFilename(fileNameBase || "generated_model");
  const fileName = safeName.toLowerCase().endsWith(".glb")
    ? safeName
    : `${safeName}.glb`;
  return new File([glbBytes], fileName, {
    type: "model/gltf-binary"
  });
}

function isValidGlbUpload(file: File) {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith(".glb");
}

async function createMeshyTextTo3dPreviewTask(
  prompt: string,
  options?: { poseMode?: MeshyPoseMode }
) {
  if (!MESHY_API_KEY) {
    throw new Error("MESHY_API_KEY is not configured");
  }

  const requestBody: Record<string, unknown> = {
    mode: "preview",
    prompt
  };
  if (options?.poseMode) {
    requestBody.pose_mode = options.poseMode;
  }
  if (MESHY_TEXT_TO_3D_MODEL) {
    requestBody.ai_model = MESHY_TEXT_TO_3D_MODEL;
  }
  if (MESHY_TEXT_TO_3D_TARGET_POLYCOUNT !== null) {
    requestBody.should_remesh = true;
    requestBody.target_polycount = MESHY_TEXT_TO_3D_TARGET_POLYCOUNT;
    if (
      MESHY_TEXT_TO_3D_TOPOLOGY === "triangle" ||
      MESHY_TEXT_TO_3D_TOPOLOGY === "quad"
    ) {
      requestBody.topology = MESHY_TEXT_TO_3D_TOPOLOGY;
    }
  }

  const response = await fetch(`${MESHY_API_BASE_URL}/openapi/v2/text-to-3d`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MESHY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meshy create failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as MeshyCreateTaskResponse;
  const taskId = String(payload.result ?? payload.id ?? "").trim();
  if (!taskId) {
    throw new Error("Meshy create response missing task id");
  }
  return taskId;
}

async function createMeshyTextTo3dRefineTask(previewTaskId: string) {
  if (!MESHY_API_KEY) {
    throw new Error("MESHY_API_KEY is not configured");
  }

  const requestBody: Record<string, unknown> = {
    mode: "refine",
    preview_task_id: previewTaskId
  };
  if (MESHY_TEXT_TO_3D_REFINE_MODEL) {
    requestBody.ai_model = MESHY_TEXT_TO_3D_REFINE_MODEL;
  }
  if (MESHY_TEXT_TO_3D_ENABLE_PBR) {
    requestBody.enable_pbr = true;
  }

  const response = await fetch(`${MESHY_API_BASE_URL}/openapi/v2/text-to-3d`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MESHY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meshy refine create failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as MeshyCreateTaskResponse;
  const taskId = String(payload.result ?? payload.id ?? "").trim();
  if (!taskId) {
    throw new Error("Meshy refine response missing task id");
  }
  return taskId;
}

async function createMeshyImageTo3dTask(
  imageUrl: string,
  options?: { poseMode?: MeshyPoseMode }
) {
  if (!MESHY_API_KEY) {
    throw new Error("MESHY_API_KEY is not configured");
  }
  const normalizedImageUrl = imageUrl.trim();
  if (!normalizedImageUrl) {
    throw new Error("Meshy image-to-3d requires a source image URL");
  }

  const requestBody: Record<string, unknown> = {
    image_url: normalizedImageUrl
  };
  if (options?.poseMode) {
    requestBody.pose_mode = options.poseMode;
  }
  if (MESHY_TEXT_TO_3D_TARGET_POLYCOUNT !== null) {
    requestBody.should_remesh = true;
    requestBody.target_polycount = MESHY_TEXT_TO_3D_TARGET_POLYCOUNT;
    if (
      MESHY_TEXT_TO_3D_TOPOLOGY === "triangle" ||
      MESHY_TEXT_TO_3D_TOPOLOGY === "quad"
    ) {
      requestBody.topology = MESHY_TEXT_TO_3D_TOPOLOGY;
    }
  }

  const response = await fetch(`${MESHY_API_BASE_URL}/openapi/v1/image-to-3d`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MESHY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meshy image create failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as MeshyCreateTaskResponse;
  const taskId = String(payload.result ?? payload.id ?? "").trim();
  if (!taskId) {
    throw new Error("Meshy image create response missing task id");
  }
  return taskId;
}

async function fetchMeshyTextTo3dTask(taskId: string) {
  if (!MESHY_API_KEY) {
    throw new Error("MESHY_API_KEY is not configured");
  }

  const response = await fetch(
    `${MESHY_API_BASE_URL}/openapi/v2/text-to-3d/${encodeURIComponent(taskId)}`,
    {
      headers: {
        Authorization: `Bearer ${MESHY_API_KEY}`
      }
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meshy status failed (${response.status}): ${text}`);
  }

  return (await response.json()) as MeshyTextTo3dTaskResponse;
}

async function fetchMeshyImageTo3dTask(taskId: string) {
  if (!MESHY_API_KEY) {
    throw new Error("MESHY_API_KEY is not configured");
  }

  const response = await fetch(
    `${MESHY_API_BASE_URL}/openapi/v1/image-to-3d/${encodeURIComponent(taskId)}`,
    {
      headers: {
        Authorization: `Bearer ${MESHY_API_KEY}`
      }
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meshy image status failed (${response.status}): ${text}`);
  }

  return (await response.json()) as MeshyImageTo3dTaskResponse;
}

async function createMeshyRiggingTask(options: {
  inputTaskId?: string;
  modelUrl?: string;
}) {
  if (!MESHY_API_KEY) {
    throw new Error("MESHY_API_KEY is not configured");
  }

  const inputTaskId = String(options.inputTaskId ?? "").trim();
  const modelUrl = String(options.modelUrl ?? "").trim();
  if (!inputTaskId && !modelUrl) {
    throw new Error("Meshy rigging requires inputTaskId or modelUrl");
  }

  const response = await fetch(`${MESHY_API_BASE_URL}/openapi/v1/rigging`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MESHY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...(inputTaskId ? { input_task_id: inputTaskId } : { model_url: modelUrl }),
      skeleton_type: "humanoid"
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meshy rigging create failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as MeshyCreateTaskResponse;
  const taskId = String(payload.result ?? payload.id ?? "").trim();
  if (!taskId) {
    throw new Error("Meshy rigging create response missing task id");
  }
  return taskId;
}

async function fetchMeshyRiggingTask(taskId: string) {
  if (!MESHY_API_KEY) {
    throw new Error("MESHY_API_KEY is not configured");
  }

  const response = await fetch(
    `${MESHY_API_BASE_URL}/openapi/v1/rigging/${encodeURIComponent(taskId)}`,
    {
      headers: {
        Authorization: `Bearer ${MESHY_API_KEY}`
      }
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meshy rigging status failed (${response.status}): ${text}`);
  }

  return (await response.json()) as MeshyRiggingTaskResponse;
}

async function createMeshyAnimationLibraryTask(
  rigTaskId: string,
  actionId: number
) {
  if (!MESHY_API_KEY) {
    throw new Error("MESHY_API_KEY is not configured");
  }

  const response = await fetch(`${MESHY_API_BASE_URL}/openapi/v1/animations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MESHY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      rig_task_id: rigTaskId,
      action_id: actionId
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meshy animation create failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as MeshyCreateTaskResponse;
  const taskId = String(payload.result ?? payload.id ?? "").trim();
  if (!taskId) {
    throw new Error("Meshy animation create response missing task id");
  }
  return taskId;
}

async function fetchMeshyAnimationTask(taskId: string) {
  if (!MESHY_API_KEY) {
    throw new Error("MESHY_API_KEY is not configured");
  }

  const response = await fetch(
    `${MESHY_API_BASE_URL}/openapi/v1/animations/${encodeURIComponent(taskId)}`,
    {
      headers: {
        Authorization: `Bearer ${MESHY_API_KEY}`
      }
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meshy animation status failed (${response.status}): ${text}`);
  }

  return (await response.json()) as MeshyAnimationTaskResponse;
}

function resolveMeshyStatus(
  task: MeshyTextTo3dTaskResponse | MeshyImageTo3dTaskResponse
) {
  return String(task.status ?? task.task_status ?? "").toUpperCase();
}

function extractMeshyGlbUrl(
  task: MeshyTextTo3dTaskResponse | MeshyImageTo3dTaskResponse
) {
  const modelUrls =
    task.model_urls && typeof task.model_urls === "object"
      ? (task.model_urls as Record<string, unknown>)
      : {};

  const candidate = [
    modelUrls.glb,
    modelUrls.preview_glb,
    modelUrls.glb_url,
    task.glb_url,
    task.preview_glb_url
  ].find((value) => typeof value === "string" && value.length > 0);

  return typeof candidate === "string" ? candidate : "";
}

function extractMeshyRiggedGlbUrl(task: MeshyRiggingTaskResponse) {
  const result =
    task.result && typeof task.result === "object"
      ? (task.result as Record<string, unknown>)
      : {};
  const modelUrls =
    task.model_urls && typeof task.model_urls === "object"
      ? (task.model_urls as Record<string, unknown>)
      : {};
  const candidate = [
    result.rigged_character_glb_url,
    result.rigged_glb_url,
    result.glb_url,
    modelUrls.rigged_glb,
    modelUrls.rigged_glb_url,
    modelUrls.glb,
    task.rigged_glb_url,
    task.rigged_model_url,
    task.glb_url
  ].find((value) => typeof value === "string" && value.length > 0);
  return typeof candidate === "string" ? candidate : "";
}

function extractMeshyAnimationGlbUrl(task: MeshyAnimationTaskResponse) {
  const result =
    task.result && typeof task.result === "object"
      ? (task.result as Record<string, unknown>)
      : {};
  const modelUrls =
    task.model_urls && typeof task.model_urls === "object"
      ? (task.model_urls as Record<string, unknown>)
      : {};
  const candidate = [
    result.animation_glb_url,
    result.glb_url,
    modelUrls.animation_glb_url,
    modelUrls.glb,
    modelUrls.glb_url,
    task.animation_glb_url,
    task.glb_url
  ].find((value) => typeof value === "string" && value.length > 0);
  return typeof candidate === "string" ? candidate : "";
}

function isMeshyTerminalStatus(status: string) {
  return status === "SUCCEEDED" || status === "FAILED" || status === "CANCELED";
}

function isMeshySuccessStatus(status: string) {
  return status === "SUCCEEDED";
}

function resolveMeshyTaskStage(
  task: MeshyTextTo3dTaskResponse,
  persistedStatus: string | null
) {
  const type = String(task.type ?? "").toLowerCase();
  if (type.includes("refine")) return "REFINE";
  if (String(persistedStatus ?? "").toUpperCase().includes("REFINE")) {
    return "REFINE";
  }
  return "PREVIEW";
}

let worldAssetGenerationWorkerBusy = false;

async function claimNextWorldAssetGenerationTask() {
  const inProgress = await prisma.worldAssetGenerationTask.findFirst({
    where: { status: "IN_PROGRESS" },
    orderBy: { updatedAt: "asc" }
  });
  if (inProgress) return inProgress;

  const pending = await prisma.worldAssetGenerationTask.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" }
  });
  if (!pending) return null;

  const update = await prisma.worldAssetGenerationTask.updateMany({
    where: {
      id: pending.id,
      status: "PENDING"
    },
    data: {
      status: "IN_PROGRESS",
      startedAt: pending.startedAt ?? new Date(),
      attempts: pending.attempts + 1
    }
  });
  if (update.count === 0) return null;

  return prisma.worldAssetGenerationTask.findUnique({
    where: { id: pending.id }
  });
}

async function tryUpdateWorldAssetGenerationTaskFromSnapshot(
  task: { id: string; updatedAt: Date },
  data: Record<string, unknown>
) {
  const update = await prisma.worldAssetGenerationTask.updateMany({
    where: {
      id: task.id,
      status: "IN_PROGRESS",
      updatedAt: task.updatedAt
    },
    data: data as any
  });
  return update.count > 0;
}

async function processObjectWorldAssetGenerationTask(task: any) {
  if (resolveWorldAssetGenerationKind(task) === "HUMANOID") {
    throw new Error("Humanoid generation task was routed to object pipeline");
  }
  const generationSource = resolveWorldAssetGenerationSource(task);

  if (!task.meshyTaskId) {
    const sourceImageUrl = String(task.sourceImageUrl ?? "").trim();
    const meshyTaskId =
      generationSource === "IMAGE"
        ? await createMeshyImageTo3dTask(sourceImageUrl)
        : await createMeshyTextTo3dPreviewTask(task.prompt);
    if (
      !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
        meshyTaskId,
        meshyStatus:
          generationSource === "IMAGE" ? "IMAGE_SUBMITTED" : "PREVIEW_SUBMITTED"
      }))
    ) {
      return;
    }
    return;
  }

  const elapsedSinceLastUpdate = Date.now() - task.updatedAt.getTime();
  if (elapsedSinceLastUpdate < WORLD_ASSET_GENERATION_POLL_INTERVAL_MS) {
    return;
  }

  const meshyTask =
    generationSource === "IMAGE"
      ? await fetchMeshyImageTo3dTask(task.meshyTaskId)
      : await fetchMeshyTextTo3dTask(task.meshyTaskId);
  const meshyStatus = resolveMeshyStatus(meshyTask);
  const stage =
    generationSource === "IMAGE"
      ? "IMAGE"
      : resolveMeshyTaskStage(meshyTask as MeshyTextTo3dTaskResponse, task.meshyStatus);
  if (!meshyStatus) {
    throw new Error("Meshy task returned empty status");
  }

  if (!isMeshyTerminalStatus(meshyStatus)) {
    if (
      !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
        meshyStatus: `${stage}_${meshyStatus}`
      }))
    ) {
      return;
    }
    return;
  }

  if (!isMeshySuccessStatus(meshyStatus)) {
    if (
      !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
        status: "FAILED",
        meshyStatus: `${stage}_${meshyStatus}`,
        failureReason: `Meshy ${stage.toLowerCase()} ended with status ${meshyStatus}`,
        completedAt: new Date()
      }))
    ) {
      return;
    }
    return;
  }

  if (
    generationSource === "TEXT" &&
    stage === "PREVIEW" &&
    MESHY_TEXT_TO_3D_ENABLE_REFINE
  ) {
    const refineTaskId = await createMeshyTextTo3dRefineTask(task.meshyTaskId);
    if (
      !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
        meshyTaskId: refineTaskId,
        meshyStatus: "REFINE_SUBMITTED"
      }))
    ) {
      return;
    }
    return;
  }

  const glbUrl = extractMeshyGlbUrl(meshyTask);
  if (!glbUrl) {
    if (
      !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
        status: "FAILED",
        meshyStatus: `${stage}_SUCCEEDED`,
        failureReason: `Meshy ${stage.toLowerCase()} succeeded but no GLB URL was returned`,
        completedAt: new Date()
      }))
    ) {
      return;
    }
    return;
  }

  const file = await downloadMeshyGlbAsFile(glbUrl, task.modelName || "generated_model");
  const generated = await createWorldAssetWithInitialVersion({
    worldOwnerId: task.worldOwnerId,
    createdById: task.createdById,
    modelName: task.modelName,
    visibility: task.visibility,
    file
  });

  await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
      status: "COMPLETED",
      meshyStatus: `${stage}_SUCCEEDED`,
      generatedAssetId: generated.assetId,
      generatedVersionId: generated.versionId,
      completedAt: new Date()
  });
}

function getHumanoidAnimationSpec(index: number) {
  return HUMANOID_MESHY_ANIMATIONS[index] ?? null;
}

async function processHumanoidWorldAssetGenerationTask(task: any) {
  const generationSource = resolveWorldAssetGenerationSource(task);

  if (!task.meshyTaskId) {
    const sourceImageUrl = String(task.sourceImageUrl ?? "").trim();
    const meshyTaskId =
      generationSource === "IMAGE"
        ? await createMeshyImageTo3dTask(sourceImageUrl, {
            poseMode: MESHY_HUMANOID_POSE_MODE
          })
        : await createMeshyTextTo3dPreviewTask(task.prompt, {
            poseMode: MESHY_HUMANOID_POSE_MODE
          });
    if (
      !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
        meshyTaskId,
        meshyStatus:
          generationSource === "IMAGE"
            ? "HUMANOID_IMAGE_SUBMITTED"
            : "HUMANOID_PREVIEW_SUBMITTED",
        meshyRiggingTaskId: null,
        meshyRiggedModelUrl: null,
        meshyAnimationIndex: 0
      }))
    ) {
      return;
    }
    return;
  }

  const elapsedSinceLastUpdate = Date.now() - task.updatedAt.getTime();
  if (elapsedSinceLastUpdate < WORLD_ASSET_GENERATION_POLL_INTERVAL_MS) {
    return;
  }

  const riggedModelUrl = String(task.meshyRiggedModelUrl ?? "").trim();
  const riggingTaskId = String(task.meshyRiggingTaskId ?? "").trim();
  const animationIndex =
    typeof task.meshyAnimationIndex === "number" ? task.meshyAnimationIndex : 0;
  const meshyStatusText = String(task.meshyStatus ?? "").toUpperCase();

  if (!riggedModelUrl) {
    const isRiggingStage = meshyStatusText.includes("RIGGING");
    if (!isRiggingStage) {
      const meshyTask =
        generationSource === "IMAGE"
          ? await fetchMeshyImageTo3dTask(task.meshyTaskId)
          : await fetchMeshyTextTo3dTask(task.meshyTaskId);
      const meshyStatus = resolveMeshyStatus(meshyTask);
      const stage =
        generationSource === "IMAGE"
          ? "IMAGE"
          : resolveMeshyTaskStage(
              meshyTask as MeshyTextTo3dTaskResponse,
              task.meshyStatus
            );
      if (!meshyStatus) {
        throw new Error("Meshy model generation task returned empty status");
      }

      if (!isMeshyTerminalStatus(meshyStatus)) {
        if (
          !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
            meshyStatus: `HUMANOID_${stage}_${meshyStatus}`
          }))
        ) {
          return;
        }
        return;
      }

      if (!isMeshySuccessStatus(meshyStatus)) {
        if (
          !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
            status: "FAILED",
            meshyStatus: `HUMANOID_${stage}_${meshyStatus}`,
            failureReason: `Meshy humanoid ${stage.toLowerCase()} ended with status ${meshyStatus}`,
            completedAt: new Date()
          }))
        ) {
          return;
        }
        return;
      }

      if (
        generationSource === "TEXT" &&
        stage === "PREVIEW" &&
        MESHY_TEXT_TO_3D_ENABLE_REFINE
      ) {
        const refineTaskId = await createMeshyTextTo3dRefineTask(task.meshyTaskId);
        if (
          !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
            meshyTaskId: refineTaskId,
            meshyStatus: "HUMANOID_REFINE_SUBMITTED"
          }))
        ) {
          return;
        }
        return;
      }

      const glbUrl = extractMeshyGlbUrl(meshyTask);
      if (!glbUrl) {
        if (
          !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
            status: "FAILED",
            meshyStatus: `HUMANOID_${stage}_SUCCEEDED`,
            failureReason:
              "Meshy humanoid model generation succeeded but no GLB URL was returned",
            completedAt: new Date()
          }))
        ) {
          return;
        }
        return;
      }

      const riggingTaskId = await createMeshyRiggingTask({
        inputTaskId: task.meshyTaskId,
        modelUrl: glbUrl
      });
      if (
        !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
          meshyTaskId: riggingTaskId,
          meshyStatus: "HUMANOID_RIGGING_SUBMITTED"
        }))
      ) {
        return;
      }
      return;
    }

    const riggingTask = await fetchMeshyRiggingTask(task.meshyTaskId);
    const riggingStatus = resolveMeshyStatus(riggingTask);
    if (!riggingStatus) {
      throw new Error("Meshy rigging task returned empty status");
    }

    if (!isMeshyTerminalStatus(riggingStatus)) {
      if (
        !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
          meshyStatus: `HUMANOID_RIGGING_${riggingStatus}`
        }))
      ) {
        return;
      }
      return;
    }

    if (!isMeshySuccessStatus(riggingStatus)) {
      if (
        !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
          status: "FAILED",
          meshyStatus: `HUMANOID_RIGGING_${riggingStatus}`,
          failureReason: `Meshy humanoid rigging ended with status ${riggingStatus}`,
          completedAt: new Date()
        }))
      ) {
        return;
      }
      return;
    }

    const nextRiggedModelUrl = extractMeshyRiggedGlbUrl(riggingTask);
    if (!nextRiggedModelUrl) {
      if (
        !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
          status: "FAILED",
          meshyStatus: "HUMANOID_RIGGING_SUCCEEDED",
          failureReason: "Meshy rigging succeeded but no rigged GLB URL was returned",
          completedAt: new Date()
        }))
      ) {
        return;
      }
      return;
    }

    const firstAnimation = getHumanoidAnimationSpec(0);
    if (!firstAnimation) {
      throw new Error("Humanoid animation list is empty");
    }
    const animationTaskId = await createMeshyAnimationLibraryTask(
      task.meshyTaskId,
      firstAnimation.libraryId
    );
    if (
      !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
        meshyTaskId: animationTaskId,
        meshyStatus: `HUMANOID_ANIMATION_0_SUBMITTED`,
        meshyRiggingTaskId: task.meshyTaskId,
        meshyRiggedModelUrl: nextRiggedModelUrl,
        meshyAnimationIndex: 0
      }))
    ) {
      return;
    }
    return;
  }

  const animation = getHumanoidAnimationSpec(animationIndex);
  if (!animation) {
    await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
      status: "COMPLETED",
      meshyStatus: "HUMANOID_ANIMATIONS_SUCCEEDED_SPLIT_GLB",
      completedAt: new Date()
    });
    return;
  }

  if (!riggingTaskId) {
    if (
      !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
        status: "FAILED",
        meshyStatus: `HUMANOID_ANIMATION_${animationIndex}_SUBMITTED`,
        failureReason: "Humanoid animation step is missing Meshy rigging task id",
        completedAt: new Date()
      }))
    ) {
      return;
    }
    return;
  }

  const animationTask = await fetchMeshyAnimationTask(task.meshyTaskId);
  const animationStatus = resolveMeshyStatus(animationTask);
  if (!animationStatus) {
    throw new Error("Meshy animation task returned empty status");
  }

  if (!isMeshyTerminalStatus(animationStatus)) {
    if (
      !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
        meshyStatus: `HUMANOID_ANIMATION_${animationIndex}_${animationStatus}`
      }))
    ) {
      return;
    }
    return;
  }

  if (!isMeshySuccessStatus(animationStatus)) {
    if (
      !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
        status: "FAILED",
        meshyStatus: `HUMANOID_ANIMATION_${animationIndex}_${animationStatus}`,
        failureReason: `Meshy animation ${animation.libraryId} (${animation.name}) ended with status ${animationStatus}`,
        completedAt: new Date()
      }))
    ) {
      return;
    }
    return;
  }

  const animationGlbUrl = extractMeshyAnimationGlbUrl(animationTask);
  if (!animationGlbUrl) {
    if (
      !(await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
        status: "FAILED",
        meshyStatus: `HUMANOID_ANIMATION_${animationIndex}_SUCCEEDED`,
        failureReason: `Meshy animation ${animation.libraryId} (${animation.name}) succeeded but no animation GLB URL was returned`,
        completedAt: new Date()
      }))
    ) {
      return;
    }
    return;
  }

  const generatedFile = await downloadMeshyGlbAsFile(
    animationGlbUrl,
    `${task.modelName}_${animation.name}`,
    {
      normalizeMaterials:
        typeof task.enhancedGraphics === "boolean" ? task.enhancedGraphics : true
    }
  );
  const generated = await createWorldAssetWithInitialVersion({
    worldOwnerId: task.worldOwnerId,
    createdById: task.createdById,
    modelName: `${task.modelName} (${animation.name})`,
    visibility: task.visibility,
    file: generatedFile
  });

  const nextAnimationIndex = animationIndex + 1;
  const nextAnimation = getHumanoidAnimationSpec(nextAnimationIndex);
  if (!nextAnimation) {
    await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
      status: "COMPLETED",
      meshyStatus: "HUMANOID_ANIMATIONS_SUCCEEDED_SPLIT_GLB",
      generatedAssetId: task.generatedAssetId ?? generated.assetId,
      generatedVersionId: task.generatedVersionId ?? generated.versionId,
      completedAt: new Date()
    });
    return;
  }

  const nextAnimationTaskId = await createMeshyAnimationLibraryTask(
    riggingTaskId,
    nextAnimation.libraryId
  );
  await tryUpdateWorldAssetGenerationTaskFromSnapshot(task, {
    meshyTaskId: nextAnimationTaskId,
    meshyStatus: `HUMANOID_ANIMATION_${nextAnimationIndex}_SUBMITTED`,
    meshyAnimationIndex: nextAnimationIndex,
    generatedAssetId: task.generatedAssetId ?? generated.assetId,
    generatedVersionId: task.generatedVersionId ?? generated.versionId
  });
}

async function processWorldAssetGenerationTask(taskId: string) {
  const task = (await prisma.worldAssetGenerationTask.findUnique({
    where: { id: taskId }
  })) as any;
  if (!task || task.status !== "IN_PROGRESS") return;

  const generationKind = resolveWorldAssetGenerationKind(task);
  if (generationKind === "HUMANOID") {
    await processHumanoidWorldAssetGenerationTask(task);
    return;
  }
  await processObjectWorldAssetGenerationTask(task);
}

async function runWorldAssetGenerationWorkerTick() {
  if (worldAssetGenerationWorkerBusy || !MESHY_API_KEY) return;

  worldAssetGenerationWorkerBusy = true;
  let processingTaskId: string | null = null;
  try {
    const task = await claimNextWorldAssetGenerationTask();
    if (!task) return;
    processingTaskId = task.id;
    await processWorldAssetGenerationTask(task.id);
  } catch (error) {
    console.error("[world-generation] task processing failed", error);
    const message = error instanceof Error ? error.message : String(error);
    if (processingTaskId) {
      const task = await prisma.worldAssetGenerationTask.findUnique({
        where: { id: processingTaskId },
        select: { attempts: true, meshyStatus: true }
      });
      if (!task) return;
      const shouldRetry = task.attempts < WORLD_ASSET_GENERATION_MAX_ATTEMPTS;
      await prisma.worldAssetGenerationTask.update({
        where: { id: processingTaskId },
        data: {
          status: shouldRetry ? "PENDING" : "FAILED",
          meshyStatus: shouldRetry ? task.meshyStatus : "FAILED",
          failureReason: message.slice(0, 500),
          completedAt: shouldRetry ? null : new Date()
        }
      });
    }
  } finally {
    worldAssetGenerationWorkerBusy = false;
  }
}

async function startWorldAssetGenerationWorker() {
  if (!MESHY_API_KEY) {
    console.warn(
      "[world-generation] MESHY_API_KEY is not configured; text-to-3d is disabled."
    );
    return;
  }

  await prisma.worldAssetGenerationTask.updateMany({
    where: { status: "IN_PROGRESS" },
    data: { status: "PENDING" }
  });

  setInterval(() => {
    void runWorldAssetGenerationWorkerTick();
  }, WORLD_ASSET_GENERATION_WORKER_INTERVAL_MS);
  void runWorldAssetGenerationWorkerTick();
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
      ? await prisma.user.findFirst({
          where: { email },
          select: { id: true, linkedinId: true }
        })
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
          },
          select: { id: true }
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
          },
          select: { id: true }
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
      ? await prisma.user.findFirst({
          where: { email },
          select: { id: true, googleId: true }
        })
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
          },
          select: { id: true }
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
          },
          select: { id: true }
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
      ? await prisma.user.findFirst({
          where: { email },
          select: { id: true, appleId: true }
        })
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
          },
          select: { id: true }
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
          },
          select: { id: true }
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
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      }
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
    const avatarSelection = await loadUserAvatarSelection(user.id);
    return jsonResponse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        avatarSelection
      }
    });
  })
  .patch("/auth/profile", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      avatarUrl?: unknown;
    } | null;
    if (!body) {
      return jsonResponse({ error: "INVALID_PROFILE" }, { status: 400 });
    }

    const nextName =
      typeof body.name === "string" ? body.name.trim().slice(0, 80) : undefined;
    const rawAvatarUrl =
      typeof body.avatarUrl === "string"
        ? body.avatarUrl.trim().slice(0, 500)
        : undefined;

    if (rawAvatarUrl !== undefined && rawAvatarUrl.length > 0) {
      try {
        const parsed = new URL(rawAvatarUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return jsonResponse({ error: "INVALID_AVATAR_URL" }, { status: 400 });
        }
      } catch {
        return jsonResponse({ error: "INVALID_AVATAR_URL" }, { status: 400 });
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(nextName !== undefined ? { name: nextName || null } : {}),
        ...(rawAvatarUrl !== undefined
          ? { avatarUrl: rawAvatarUrl.length > 0 ? rawAvatarUrl : null }
          : {})
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true
      }
    });
    const avatarSelection = await loadUserAvatarSelection(updated.id);

    return jsonResponse({
      ok: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        avatarUrl: updated.avatarUrl,
        avatarSelection
      }
    });
  })
  .patch("/auth/player-avatar", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      stationaryModelUrl?: unknown;
      moveModelUrl?: unknown;
      specialModelUrl?: unknown;
    } | null;
    if (!body) {
      return jsonResponse({ error: "INVALID_AVATAR_SELECTION" }, { status: 400 });
    }

    const normalizeModelUrl = (value: unknown) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim().slice(0, 2000);
      return trimmed || null;
    };

    const currentSelection = await loadUserAvatarSelection(user.id);
    const nextSelection: UserAvatarSelection = {
      stationaryModelUrl:
        body.stationaryModelUrl !== undefined
          ? normalizeModelUrl(body.stationaryModelUrl)
          : currentSelection.stationaryModelUrl,
      moveModelUrl:
        body.moveModelUrl !== undefined
          ? normalizeModelUrl(body.moveModelUrl)
          : currentSelection.moveModelUrl,
      specialModelUrl:
        body.specialModelUrl !== undefined
          ? normalizeModelUrl(body.specialModelUrl)
          : currentSelection.specialModelUrl
    };

    try {
      await prisma.$executeRaw`UPDATE "User" SET "playerAvatarStationaryModelUrl" = ${nextSelection.stationaryModelUrl}, "playerAvatarMoveModelUrl" = ${nextSelection.moveModelUrl}, "playerAvatarSpecialModelUrl" = ${nextSelection.specialModelUrl} WHERE "id" = CAST(${user.id} AS uuid)`;
    } catch (error) {
      if (isMissingAvatarSelectionColumnsError(error)) {
        return jsonResponse(
          { error: "AVATAR_SELECTION_NOT_READY" },
          { status: 503 }
        );
      }
      throw error;
    }

    return jsonResponse({
      ok: true,
      avatarSelection: nextSelection
    });
  })
  .get("/worlds/search", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.trim() ?? "";
    const activeWorldId = await resolveActiveWorldPartyId(user.id);

    const matchingOwnerIds =
      query.length >= 2
        ? (
            await prisma.user.findMany({
              where: {
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  { email: { contains: query, mode: "insensitive" } }
                ]
              },
              select: { id: true },
              take: 40
            })
          ).map((item) => item.id)
        : [];

    const worlds = await prisma.party.findMany({
      where: {
        AND: [
          { OR: [{ isPublic: true }, { leaderId: user.id }, { id: activeWorldId }] },
          ...(query.length >= 2
            ? [
                {
                  OR: [
                    { leaderId: { in: matchingOwnerIds } },
                    { name: { contains: query, mode: "insensitive" as const } },
                    {
                      description: {
                        contains: query,
                        mode: "insensitive" as const
                      }
                    }
                  ]
                }
              ]
            : [])
        ]
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        leaderId: true,
        isPublic: true,
        name: true,
        description: true,
        updatedAt: true,
        leader: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        },
        _count: {
          select: { members: true }
        }
      }
    });

    const ownerIds = [...new Set(worlds.map((world) => world.leaderId))];
    const [assetCounts, placementCounts, memberUserIds] = await Promise.all([
      prisma.worldAsset.groupBy({
        by: ["worldOwnerId"],
        where: { worldOwnerId: { in: ownerIds } },
        _count: { _all: true }
      }),
      prisma.worldPlacement.groupBy({
        by: ["worldOwnerId"],
        where: { worldOwnerId: { in: ownerIds } },
        _count: { _all: true }
      }),
      prisma.partyMember.findMany({
        where: { partyId: { in: worlds.map((world) => world.id) } },
        select: { partyId: true, userId: true }
      })
    ]);

    const assetCountByOwnerId = new Map(
      assetCounts.map((item) => [item.worldOwnerId, item._count._all])
    );
    const placementCountByOwnerId = new Map(
      placementCounts.map((item) => [item.worldOwnerId, item._count._all])
    );
    const memberIdsByWorldId = new Map<string, string[]>();
    for (const item of memberUserIds) {
      const current = memberIdsByWorldId.get(item.partyId) ?? [];
      current.push(item.userId);
      memberIdsByWorldId.set(item.partyId, current);
    }

    return jsonResponse({
      results: worlds.map((world) => ({
        id: world.id,
        name: world.name,
        description: world.description,
        owner: {
          id: world.leader.id,
          name: world.leader.name ?? "User",
          avatarUrl: world.leader.avatarUrl
        },
        isPublic: world.isPublic,
        memberCount: world._count.members,
        onlineVisitorCount: countOnlineUsersByIds(memberIdsByWorldId.get(world.id) ?? []),
        modelCount: assetCountByOwnerId.get(world.leaderId) ?? 0,
        placementCount: placementCountByOwnerId.get(world.leaderId) ?? 0,
        updatedAt: world.updatedAt.toISOString(),
        isCurrentWorld: world.id === activeWorldId,
        canJoin: world.isPublic || world.id === activeWorldId || world.leaderId === user.id
      }))
    });
  })
  .get("/worlds/portals", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);

    const worlds = await prisma.party.findMany({
      where: {
        OR: [
          { portalIsPublic: true },
          ...(user ? [{ leaderId: user.id }] : [])
        ]
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: {
        id: true,
        leaderId: true,
        name: true,
        description: true,
        isPublic: true,
        portalIsPublic: true,
        portalLat: true,
        portalLng: true,
        portalCityName: true,
        portalCountryName: true,
        portalFictionalAddress: true,
        updatedAt: true,
        leader: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      }
    });

    const memberRows =
      worlds.length > 0
        ? await prisma.partyMember.findMany({
            where: { partyId: { in: worlds.map((world) => world.id) } },
            select: { partyId: true, userId: true }
          })
        : [];
    const memberIdsByWorldId = new Map<string, string[]>();
    for (const row of memberRows) {
      const list = memberIdsByWorldId.get(row.partyId) ?? [];
      list.push(row.userId);
      memberIdsByWorldId.set(row.partyId, list);
    }

    return jsonResponse({
      portals: worlds.map((world) => {
        const isOwnedWorld = Boolean(user && world.leaderId === user.id);
        const onlineVisitorCount = countOnlineUsersByIds(
          memberIdsByWorldId.get(world.id) ?? []
        );
        return {
          worldId: world.id,
          worldName: world.name,
          worldDescription: world.description,
          onlineVisitorCount,
          worldIsPublic: world.isPublic,
          portalIsPublic: world.portalIsPublic,
          homeCityName: world.portalCityName,
          homeCountryName: world.portalCountryName,
          fictionalAddress: world.portalFictionalAddress,
          portal: {
            lat: world.portalLat,
            lng: world.portalLng
          },
          owner: {
            id: world.leader.id,
            name: world.leader.name ?? "User",
            avatarUrl: world.leader.avatarUrl
          },
          isOwnedWorld,
          canJoin: world.isPublic || isOwnedWorld,
          updatedAt: world.updatedAt.toISOString()
        };
      })
    });
  })
  .get("/world/home-cities", async () => {
    return jsonResponse({
      cities: WORLD_HOME_CITIES.map((city) => ({
        key: city.key,
        cityName: city.cityName,
        countryName: city.countryName,
        timezone: city.timezone
      }))
    });
  })
  .get("/world/home-portal", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const ownedWorld = await resolveOwnedWorldParty(user.id);
    const world = await prisma.party.findUnique({
      where: { id: ownedWorld.id },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        portalIsPublic: true,
        portalLat: true,
        portalLng: true,
        portalCityKey: true,
        portalCityName: true,
        portalCountryName: true,
        portalTimezone: true,
        portalFictionalAddress: true
      }
    });
    if (!world) {
      return jsonResponse({ error: "WORLD_NOT_FOUND" }, { status: 404 });
    }

    return jsonResponse({
      worldId: world.id,
      worldName: world.name,
      worldDescription: world.description,
      worldIsPublic: world.isPublic,
      portalIsPublic: world.portalIsPublic,
      portal: {
        lat: world.portalLat,
        lng: world.portalLng
      },
      homeCityKey: world.portalCityKey,
      homeCityName: world.portalCityName,
      homeCountryName: world.portalCountryName,
      homeTimezone: world.portalTimezone,
      fictionalAddress: world.portalFictionalAddress
    });
  })
  .patch("/world/home-portal", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      lat?: unknown;
      lng?: unknown;
      cityKey?: unknown;
      portalIsPublic?: unknown;
    } | null;
    if (!body) {
      return jsonResponse({ error: "INVALID_PORTAL_PAYLOAD" }, { status: 400 });
    }

    const lat =
      body.lat === undefined ? undefined : normalizePortalLatitude(body.lat);
    const lng =
      body.lng === undefined ? undefined : normalizePortalLongitude(body.lng);
    const cityKey =
      typeof body.cityKey === "string" ? body.cityKey.trim() : undefined;
    if (body.lat !== undefined && lat === null) {
      return jsonResponse({ error: "INVALID_PORTAL_LATITUDE" }, { status: 400 });
    }
    if (body.lng !== undefined && lng === null) {
      return jsonResponse({ error: "INVALID_PORTAL_LONGITUDE" }, { status: 400 });
    }
    if (body.cityKey !== undefined && !cityKey) {
      return jsonResponse({ error: "INVALID_PORTAL_CITY_KEY" }, { status: 400 });
    }

    if (
      lat === undefined &&
      lng === undefined &&
      cityKey === undefined &&
      typeof body.portalIsPublic !== "boolean"
    ) {
      return jsonResponse({ error: "INVALID_PORTAL_PAYLOAD" }, { status: 400 });
    }

    const latValue = lat === null ? undefined : lat;
    const lngValue = lng === null ? undefined : lng;
    const selectedCity = cityKey
      ? WORLD_HOME_CITIES.find((city) => city.key === cityKey) ?? null
      : null;
    if (cityKey && !selectedCity) {
      return jsonResponse({ error: "UNKNOWN_PORTAL_CITY_KEY" }, { status: 400 });
    }
    const generatedPoint = selectedCity ? randomPointNearCity(selectedCity) : null;
    const generatedAddress = selectedCity
      ? generateFictionalAddress(selectedCity)
      : null;

    const ownedWorld = await resolveOwnedWorldParty(user.id);
    const updated = await prisma.party.update({
      where: { id: ownedWorld.id },
      data: {
        ...(generatedPoint
          ? { portalLat: generatedPoint.lat, portalLng: generatedPoint.lng }
          : {}),
        ...(latValue !== undefined ? { portalLat: latValue } : {}),
        ...(lngValue !== undefined ? { portalLng: lngValue } : {}),
        ...(selectedCity
          ? {
              portalCityKey: selectedCity.key,
              portalCityName: selectedCity.cityName,
              portalCountryName: selectedCity.countryName,
              portalTimezone: selectedCity.timezone,
              portalFictionalAddress: generatedAddress
            }
          : {}),
        ...(typeof body.portalIsPublic === "boolean"
          ? { portalIsPublic: body.portalIsPublic }
          : {})
      },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        portalIsPublic: true,
        portalLat: true,
        portalLng: true,
        portalCityKey: true,
        portalCityName: true,
        portalCountryName: true,
        portalTimezone: true,
        portalFictionalAddress: true
      }
    });

    return jsonResponse({
      ok: true,
      worldId: updated.id,
      worldName: updated.name,
      worldDescription: updated.description,
      worldIsPublic: updated.isPublic,
      portalIsPublic: updated.portalIsPublic,
      portal: {
        lat: updated.portalLat,
        lng: updated.portalLng
      },
      homeCityKey: updated.portalCityKey,
      homeCityName: updated.portalCityName,
      homeCountryName: updated.portalCountryName,
      homeTimezone: updated.portalTimezone,
      fictionalAddress: updated.portalFictionalAddress
    });
  })
  .get("/world", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const worldOwnerId = await resolveActiveWorldOwnerId(user.id);
    const activeWorldPartyId = await resolveActiveWorldPartyId(user.id);
    const canManage = await canManageWorldOwner(user.id, worldOwnerId);
    const activeWorld = await prisma.party.findUnique({
      where: { id: activeWorldPartyId },
      select: {
        id: true,
        isPublic: true,
        leaderId: true,
        name: true,
        description: true,
        portalIsPublic: true,
        portalLat: true,
        portalLng: true
      }
    });

    const [assets, placements, posts, photoWalls] = await Promise.all([
      prisma.worldAsset.findMany({
        where: {
          OR: [
            { visibility: WorldAssetVisibility.PUBLIC },
            { worldOwnerId }
          ]
        },
        include: {
          currentVersion: true,
          versions: {
            orderBy: { version: "desc" }
          },
          _count: {
            select: {
              placements: true
            }
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
      }),
      prisma.worldPost.findMany({
        where: { worldOwnerId },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true
            }
          },
          _count: {
            select: {
              comments: true
            }
          },
          comments: {
            include: {
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatarUrl: true
                }
              }
            },
            orderBy: { createdAt: "desc" },
            take: 5
          }
        },
        orderBy: { createdAt: "asc" }
      }),
      prisma.worldPhotoWall.findMany({
        where: { worldOwnerId },
        orderBy: { createdAt: "asc" }
      })
    ]);

    return jsonResponse({
      worldOwnerId,
      worldId: activeWorld?.id ?? activeWorldPartyId,
      worldName: activeWorld?.name ?? "Untitled World",
      worldDescription: activeWorld?.description ?? null,
      portalIsPublic: activeWorld?.portalIsPublic ?? true,
      portalLat: activeWorld?.portalLat ?? DEFAULT_WORLD_PORTAL_LAT,
      portalLng: activeWorld?.portalLng ?? DEFAULT_WORLD_PORTAL_LNG,
      canManage,
      isPublic: activeWorld?.isPublic ?? false,
      canManageVisibility: (activeWorld?.leaderId ?? "") === user.id,
      assets: assets.map((asset) => ({
        id: asset.id,
        ownerId: asset.worldOwnerId,
        name: asset.name,
        visibility: asset.visibility === WorldAssetVisibility.PRIVATE ? "private" : "public",
        canManageVisibility:
          asset.worldOwnerId === user.id ||
          (asset.worldOwnerId === worldOwnerId && canManage),
        canChangeVisibility: asset._count.placements === 0,
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
      })),
      posts: posts.map((post) => ({
        id: post.id,
        imageUrl: post.imageUrl,
        message: post.message,
        position: {
          x: post.positionX,
          y: post.positionY,
          z: post.positionZ
        },
        isMinimized: post.isMinimized,
        commentCount: post._count.comments,
        commentPreview: [...post.comments].reverse().map((comment) => ({
          id: comment.id,
          postId: comment.postId,
          message: comment.message,
          author: {
            id: comment.createdBy.id,
            name: comment.createdBy.name ?? "User",
            avatarUrl: comment.createdBy.avatarUrl
          },
          createdAt: comment.createdAt.toISOString(),
          updatedAt: comment.updatedAt.toISOString()
        })),
        author: {
          id: post.createdBy.id,
          name: post.createdBy.name ?? "User",
          avatarUrl: post.createdBy.avatarUrl
        },
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString()
      })),
      photoWalls: photoWalls.map((photoWall) => ({
        id: photoWall.id,
        imageUrl: photoWall.imageUrl,
        position: {
          x: photoWall.positionX,
          y: photoWall.positionY,
          z: photoWall.positionZ
        },
        rotation: {
          x: photoWall.rotationX,
          y: photoWall.rotationY,
          z: photoWall.rotationZ
        },
        scale: {
          x: photoWall.scaleX,
          y: photoWall.scaleY,
          z: photoWall.scaleZ
        },
        createdAt: photoWall.createdAt.toISOString(),
        updatedAt: photoWall.updatedAt.toISOString()
      }))
    });
  })
  .patch("/world/settings", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      description?: unknown;
      isPublic?: unknown;
    } | null;

    if (!body) {
      return jsonResponse({ error: "INVALID_SETTINGS" }, { status: 400 });
    }

    const activeWorldPartyId = await resolveActiveWorldPartyId(user.id);
    const activeWorld = await prisma.party.findUnique({
      where: { id: activeWorldPartyId },
      select: { id: true, leaderId: true }
    });
    if (!activeWorld || activeWorld.leaderId !== user.id) {
      return jsonResponse({ error: "WORLD_OWNER_REQUIRED" }, { status: 403 });
    }

    const name =
      typeof body.name === "string" ? body.name.trim().slice(0, 80) : undefined;
    const description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 240)
        : undefined;

    if (name !== undefined && name.length === 0) {
      return jsonResponse({ error: "INVALID_WORLD_NAME" }, { status: 400 });
    }

    const updated = await prisma.party.update({
      where: { id: activeWorld.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(typeof body.isPublic === "boolean" ? { isPublic: body.isPublic } : {})
      },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true
      }
    });

    return jsonResponse({
      ok: true,
      world: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        isPublic: updated.isPublic
      }
    });
  })
  .patch("/world/visibility", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      isPublic?: unknown;
    } | null;

    if (!body || typeof body.isPublic !== "boolean") {
      return jsonResponse({ error: "INVALID_VISIBILITY" }, { status: 400 });
    }

    const activeWorldPartyId = await resolveActiveWorldPartyId(user.id);
    const activeWorld = await prisma.party.findUnique({
      where: { id: activeWorldPartyId },
      select: { id: true, leaderId: true }
    });
    if (!activeWorld || activeWorld.leaderId !== user.id) {
      return jsonResponse({ error: "WORLD_OWNER_REQUIRED" }, { status: 403 });
    }

    await prisma.party.update({
      where: { id: activeWorld.id },
      data: { isPublic: body.isPublic }
    });

    return jsonResponse({ ok: true, isPublic: body.isPublic });
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
    const visibility = normalizeWorldAssetVisibility(formData.get("visibility"));
    const fallbackName = sanitizeFilename(
      fileValue.name.replace(/\.glb$/i, "")
    ).replace(/_/g, " ");
    const modelName = normalizeAssetName(rawName, fallbackName);
    const created = await createWorldAssetWithInitialVersion({
      worldOwnerId,
      createdById: user.id,
      modelName,
      visibility,
      file: fileValue
    });

    return jsonResponse({
      ok: true,
      assetId: created.assetId,
      versionId: created.versionId
    });
  })
  .post("/world/assets/generate", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }
    if (!MESHY_API_KEY) {
      return jsonResponse({ error: "MESHY_NOT_CONFIGURED" }, { status: 503 });
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
    const prompt =
      typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    if (!prompt || prompt.length > 600) {
      return jsonResponse({ error: "INVALID_PROMPT" }, { status: 400 });
    }

    const requestedName =
      typeof payload?.name === "string" ? payload.name.trim() : "";
    const generationType = normalizeWorldAssetGenerationType(payload?.generationType);
    const enhancedGraphics = normalizeEnhancedGraphicsToggle(
      payload?.enhancedGraphics
    );
    const visibility = normalizeWorldAssetVisibility(payload?.visibility);
    const modelName = normalizeAssetName(
      requestedName,
      deriveModelNameFromPrompt(prompt)
    );

    const task = await prisma.worldAssetGenerationTask.create({
      data: {
        worldOwnerId,
        createdById: user.id,
        prompt,
        modelName,
        generationType,
        generationSource: "TEXT",
        enhancedGraphics,
        meshyStatus: generationType === "HUMANOID" ? "HUMANOID_QUEUED" : null,
        visibility
      } as any,
      select: {
        id: true,
        status: true,
        createdAt: true
      }
    });

    void runWorldAssetGenerationWorkerTick();

    return jsonResponse({
      ok: true,
      task: {
        id: task.id,
        status: task.status,
        createdAt: task.createdAt.toISOString()
      }
    });
  })
  .post("/world/assets/generate/image", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }
    if (!MESHY_API_KEY) {
      return jsonResponse({ error: "MESHY_NOT_CONFIGURED" }, { status: 503 });
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
    if (!isValidImageUpload(fileValue)) {
      return jsonResponse({ error: "INVALID_IMAGE_FILE" }, { status: 400 });
    }

    const generationType = normalizeWorldAssetGenerationType(
      formData.get("generationType")
    );
    const enhancedGraphics = normalizeEnhancedGraphicsToggle(
      formData.get("enhancedGraphics")
    );
    const requestedName =
      typeof formData.get("name") === "string"
        ? String(formData.get("name")).trim()
        : "";
    const visibility = normalizeWorldAssetVisibility(formData.get("visibility"));
    const fallbackName = sanitizeFilename(
      fileValue.name.replace(/\.[^/.]+$/, "")
    ).replace(/_/g, " ");
    const modelName = normalizeAssetName(requestedName, fallbackName || "Generated Model");
    const prompt =
      typeof formData.get("prompt") === "string"
        ? String(formData.get("prompt")).trim().slice(0, 600)
        : "";

    const taskId = crypto.randomUUID();
    const saved = await saveWorldGenerationImageFile(fileValue, worldOwnerId, taskId);
    const sourceImageUrl = resolveWorldAssetPublicUrl(saved.storageKey);
    if (!sourceImageUrl) {
      return jsonResponse(
        {
          error: "PUBLIC_WORLD_STORAGE_REQUIRED",
          detail:
            "Image-to-3D requires publicly accessible storage. Configure Spaces/CDN for world storage."
        },
        { status: 503 }
      );
    }

    const task = await prisma.worldAssetGenerationTask.create({
      data: {
        id: taskId,
        worldOwnerId,
        createdById: user.id,
        prompt: prompt || `Image to 3D (${fileValue.name || "upload"})`,
        modelName,
        generationType,
        generationSource: "IMAGE",
        enhancedGraphics,
        sourceImageUrl,
        sourceImageStorageKey: saved.storageKey,
        sourceImageContentType: fileValue.type || "application/octet-stream",
        meshyStatus: generationType === "HUMANOID" ? "HUMANOID_QUEUED" : "IMAGE_QUEUED",
        visibility
      } as any,
      select: {
        id: true,
        status: true,
        createdAt: true
      }
    });

    void runWorldAssetGenerationWorkerTick();

    return jsonResponse({
      ok: true,
      task: {
        id: task.id,
        status: task.status,
        createdAt: task.createdAt.toISOString()
      }
    });
  })
  .get("/world/assets/generations", async ({ request }) => {
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

    const tasks = await prisma.worldAssetGenerationTask.findMany(({
      where: { worldOwnerId },
      orderBy: { createdAt: "desc" },
      take: WORLD_ASSET_GENERATION_RECENT_LIMIT,
      select: {
        id: true,
        status: true,
        generationType: true,
        generationSource: true,
        enhancedGraphics: true,
        prompt: true,
        modelName: true,
        meshyStatus: true,
        generatedAssetId: true,
        generatedVersionId: true,
        failureReason: true,
        createdAt: true,
        updatedAt: true,
        startedAt: true,
        completedAt: true
      }
    } as any));

    return jsonResponse({
      tasks: tasks.map((task) => ({
        id: task.id,
        status: task.status,
        generationType: (task as any).generationType ?? "OBJECT",
        generationSource: (task as any).generationSource ?? "TEXT",
        enhancedGraphics:
          typeof (task as any).enhancedGraphics === "boolean"
            ? (task as any).enhancedGraphics
            : true,
        prompt: task.prompt,
        modelName: task.modelName,
        meshyStatus: task.meshyStatus,
        generatedAssetId: task.generatedAssetId,
        generatedVersionId: task.generatedVersionId,
        failureReason: task.failureReason,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        startedAt: task.startedAt?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null
      }))
    });
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
  .patch("/world/assets/:assetId/visibility", async ({ request, params }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const assetId = String((params as Record<string, unknown>).assetId ?? "");
    if (!assetId) {
      return jsonResponse({ error: "ASSET_ID_REQUIRED" }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as {
      visibility?: unknown;
    } | null;
    const nextVisibility = parseWorldAssetVisibility(body?.visibility);
    if (!nextVisibility) {
      return jsonResponse({ error: "INVALID_VISIBILITY" }, { status: 400 });
    }

    const asset = await prisma.worldAsset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        visibility: true,
        worldOwnerId: true,
        _count: {
          select: {
            placements: true
          }
        }
      }
    });
    if (!asset) {
      return jsonResponse({ error: "ASSET_NOT_FOUND" }, { status: 404 });
    }

    const canManage = await canManageWorldOwner(user.id, asset.worldOwnerId);
    if (!canManage) {
      return jsonResponse(
        { error: "NOT_PARTY_MANAGER_OR_LEADER" },
        { status: 403 }
      );
    }

    if (asset._count.placements > 0 && asset.visibility !== nextVisibility) {
      return jsonResponse(
        { error: "ASSET_VISIBILITY_LOCKED_BY_INSTANCES" },
        { status: 409 }
      );
    }

    await prisma.worldAsset.update({
      where: { id: asset.id },
      data: { visibility: nextVisibility }
    });

    return jsonResponse({
      ok: true,
      assetId: asset.id,
      visibility: nextVisibility === WorldAssetVisibility.PRIVATE ? "private" : "public"
    });
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
        OR: [
          { visibility: WorldAssetVisibility.PUBLIC },
          { worldOwnerId }
        ]
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
  .post("/world/photo-walls", async ({ request }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });

    const worldOwnerId = await resolveActiveWorldOwnerId(user.id);
    const canManage = await canManageWorldOwner(user.id, worldOwnerId);
    if (!canManage) {
      return jsonResponse({ error: "NOT_PARTY_MANAGER_OR_LEADER" }, { status: 403 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const formData = await request.formData();
      const fileValue = formData.get("file");
      if (!(fileValue instanceof File)) {
        return jsonResponse({ error: "FILE_REQUIRED" }, { status: 400 });
      }
      if (!isValidImageUpload(fileValue)) {
        return jsonResponse({ error: "INVALID_IMAGE_FILE" }, { status: 400 });
      }
      const photoWallId = crypto.randomUUID();
      const saved = await saveWorldPhotoWallImageFile(fileValue, worldOwnerId, photoWallId);
      const imageUrl = resolveWorldPhotoWallImageFileUrl(photoWallId, saved.storageKey);
      await prisma.worldPhotoWall.create({
        data: {
          id: photoWallId,
          worldOwnerId,
          createdById: user.id,
          imageUrl,
          imageStorageKey: saved.storageKey,
          imageContentType: fileValue.type || "application/octet-stream",
          positionX: Number(formData.get("positionX") ?? 0) || 0,
          positionY: Number(formData.get("positionY") ?? 1.2) || 1.2,
          positionZ: Number(formData.get("positionZ") ?? 0) || 0,
          rotationX: Number(formData.get("rotationX") ?? 0) || 0,
          rotationY: Number(formData.get("rotationY") ?? 0) || 0,
          rotationZ: Number(formData.get("rotationZ") ?? 0) || 0,
          scaleX: Number(formData.get("scaleX") ?? 1) || 1,
          scaleY: Number(formData.get("scaleY") ?? 1) || 1,
          scaleZ: Number(formData.get("scaleZ") ?? 1) || 1
        }
      });
      return jsonResponse({ ok: true, photoWallId });
    }

    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const imageUrl = normalizeWorldPostImageUrl(payload?.imageUrl);
    if (!imageUrl) return jsonResponse({ error: "IMAGE_URL_REQUIRED" }, { status: 400 });
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

    const wall = await prisma.worldPhotoWall.create({
      data: {
        worldOwnerId,
        createdById: user.id,
        imageUrl,
        positionX: toNumberOrDefault(position.x, 0),
        positionY: toNumberOrDefault(position.y, 1.2),
        positionZ: toNumberOrDefault(position.z, 0),
        rotationX: toNumberOrDefault(rotation.x, 0),
        rotationY: toNumberOrDefault(rotation.y, 0),
        rotationZ: toNumberOrDefault(rotation.z, 0),
        scaleX: toNumberOrDefault(scale.x, 1),
        scaleY: toNumberOrDefault(scale.y, 1),
        scaleZ: toNumberOrDefault(scale.z, 1)
      }
    });
    return jsonResponse({ ok: true, photoWallId: wall.id });
  })
  .patch("/world/photo-walls/:photoWallId", async ({ request, params }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });

    const worldOwnerId = await resolveActiveWorldOwnerId(user.id);
    const canManage = await canManageWorldOwner(user.id, worldOwnerId);
    if (!canManage) {
      return jsonResponse({ error: "NOT_PARTY_MANAGER_OR_LEADER" }, { status: 403 });
    }

    const photoWallId = String((params as Record<string, unknown>).photoWallId ?? "");
    const wall = await prisma.worldPhotoWall.findUnique({
      where: { id: photoWallId },
      select: { id: true, worldOwnerId: true }
    });
    if (!wall || wall.worldOwnerId !== worldOwnerId) {
      return jsonResponse({ error: "PHOTO_WALL_NOT_FOUND" }, { status: 404 });
    }

    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
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
    const imageUrl =
      typeof payload?.imageUrl === "string"
        ? normalizeWorldPostImageUrl(payload.imageUrl)
        : null;

    await prisma.worldPhotoWall.update({
      where: { id: photoWallId },
      data: {
        ...(position
          ? {
              positionX: toNumberOrDefault(position.x, 0),
              positionY: toNumberOrDefault(position.y, 1.2),
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
              scaleX: Math.max(0.01, toNumberOrDefault(scale.x, 1)),
              scaleY: Math.max(0.01, toNumberOrDefault(scale.y, 1)),
              scaleZ: Math.max(0.01, toNumberOrDefault(scale.z, 1))
            }
          : {}),
        ...(imageUrl ? { imageUrl, imageStorageKey: null, imageContentType: null } : {})
      }
    });

    return jsonResponse({ ok: true });
  })
  .post("/world/photo-walls/:photoWallId/image", async ({ request, params }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });

    const worldOwnerId = await resolveActiveWorldOwnerId(user.id);
    const canManage = await canManageWorldOwner(user.id, worldOwnerId);
    if (!canManage) {
      return jsonResponse({ error: "NOT_PARTY_MANAGER_OR_LEADER" }, { status: 403 });
    }
    const photoWallId = String((params as Record<string, unknown>).photoWallId ?? "");
    const wall = await prisma.worldPhotoWall.findUnique({
      where: { id: photoWallId },
      select: { id: true, worldOwnerId: true }
    });
    if (!wall || wall.worldOwnerId !== worldOwnerId) {
      return jsonResponse({ error: "PHOTO_WALL_NOT_FOUND" }, { status: 404 });
    }

    const formData = await request.formData();
    const fileValue = formData.get("file");
    if (!(fileValue instanceof File)) {
      return jsonResponse({ error: "FILE_REQUIRED" }, { status: 400 });
    }
    if (!isValidImageUpload(fileValue)) {
      return jsonResponse({ error: "INVALID_IMAGE_FILE" }, { status: 400 });
    }
    const saved = await saveWorldPhotoWallImageFile(fileValue, worldOwnerId, photoWallId);
    const imageUrl = resolveWorldPhotoWallImageFileUrl(photoWallId, saved.storageKey);
    await prisma.worldPhotoWall.update({
      where: { id: photoWallId },
      data: {
        imageUrl,
        imageStorageKey: saved.storageKey,
        imageContentType: fileValue.type || "application/octet-stream"
      }
    });
    return jsonResponse({ ok: true, photoWallId, imageUrl });
  })
  .delete("/world/photo-walls/:photoWallId", async ({ request, params }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    const worldOwnerId = await resolveActiveWorldOwnerId(user.id);
    const canManage = await canManageWorldOwner(user.id, worldOwnerId);
    if (!canManage) {
      return jsonResponse({ error: "NOT_PARTY_MANAGER_OR_LEADER" }, { status: 403 });
    }
    const photoWallId = String((params as Record<string, unknown>).photoWallId ?? "");
    const wall = await prisma.worldPhotoWall.findUnique({
      where: { id: photoWallId },
      select: { id: true, worldOwnerId: true }
    });
    if (!wall || wall.worldOwnerId !== worldOwnerId) {
      return jsonResponse({ error: "PHOTO_WALL_NOT_FOUND" }, { status: 404 });
    }
    await prisma.worldPhotoWall.delete({ where: { id: photoWallId } });
    return jsonResponse({ ok: true });
  })
  .post("/world/posts", async ({ request }) => {
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

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const formData = await request.formData();
      const fileValue = formData.get("file");
      if (!(fileValue instanceof File)) {
        return jsonResponse({ error: "FILE_REQUIRED" }, { status: 400 });
      }
      if (!isValidImageUpload(fileValue)) {
        return jsonResponse({ error: "INVALID_IMAGE_FILE" }, { status: 400 });
      }

      const message = normalizeWorldPostMessage(formData.get("message"));
      if (!message) {
        return jsonResponse({ error: "MESSAGE_REQUIRED" }, { status: 400 });
      }

      const postId = crypto.randomUUID();
      const saved = await saveWorldPostImageFile(fileValue, worldOwnerId, postId);
      const imageUrl = resolveWorldPostImageFileUrl(postId, saved.storageKey);
      await prisma.worldPost.create({
        data: {
          id: postId,
          worldOwnerId,
          createdById: user.id,
          imageUrl,
          imageStorageKey: saved.storageKey,
          imageContentType: fileValue.type || "application/octet-stream",
          message,
          positionX: Number(formData.get("positionX") ?? 0) || 0,
          positionY: Number(formData.get("positionY") ?? 1.4) || 1.4,
          positionZ: Number(formData.get("positionZ") ?? 0) || 0,
          isMinimized: String(formData.get("isMinimized") ?? "").toLowerCase() === "true"
        }
      });
      return jsonResponse({ ok: true, postId });
    }

    const payload = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const imageUrl =
      payload && Object.prototype.hasOwnProperty.call(payload, "imageUrl")
        ? (typeof payload.imageUrl === "string"
            ? (normalizeWorldPostImageUrl(payload.imageUrl) ?? "")
            : "")
        : "";
    const message = normalizeWorldPostMessage(payload?.message);
    if (!message) {
      return jsonResponse({ error: "MESSAGE_REQUIRED" }, { status: 400 });
    }

    const position =
      payload?.position && typeof payload.position === "object"
        ? (payload.position as Record<string, unknown>)
        : {};

    const post = await prisma.worldPost.create({
      data: {
        worldOwnerId,
        createdById: user.id,
        imageUrl,
        imageStorageKey: null,
        imageContentType: null,
        message,
        positionX: toNumberOrDefault(position.x, 0),
        positionY: toNumberOrDefault(position.y, 1.4),
        positionZ: toNumberOrDefault(position.z, 0),
        isMinimized: payload?.isMinimized === true
      }
    });

    return jsonResponse({ ok: true, postId: post.id });
  })
  .patch("/world/posts/:postId", async ({ request, params }) => {
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

    const postId = String((params as Record<string, unknown>).postId ?? "");
    const post = await prisma.worldPost.findUnique({
      where: { id: postId },
      select: { id: true, worldOwnerId: true }
    });
    if (!post || post.worldOwnerId !== worldOwnerId) {
      return jsonResponse({ error: "POST_NOT_FOUND" }, { status: 404 });
    }

    const payload = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const position =
      payload?.position && typeof payload.position === "object"
        ? (payload.position as Record<string, unknown>)
        : null;
    const message =
      typeof payload?.message === "string"
        ? normalizeWorldPostMessage(payload.message)
        : null;
    const imageUrl =
      typeof payload?.imageUrl === "string"
        ? (normalizeWorldPostImageUrl(payload.imageUrl) ?? "")
        : null;

    await prisma.worldPost.update({
      where: { id: postId },
      data: {
        ...(position
          ? {
              positionX: toNumberOrDefault(position.x, 0),
              positionY: toNumberOrDefault(position.y, 1.4),
              positionZ: toNumberOrDefault(position.z, 0)
            }
          : {}),
        ...(typeof payload?.isMinimized === "boolean"
          ? { isMinimized: payload.isMinimized }
          : {}),
        ...(message ? { message } : {}),
        ...(imageUrl !== null
          ? { imageUrl, imageStorageKey: null, imageContentType: null }
          : {})
      }
    });

    return jsonResponse({ ok: true });
  })
  .post("/world/posts/:postId/image", async ({ request, params }) => {
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

    const postId = String((params as Record<string, unknown>).postId ?? "");
    const post = await prisma.worldPost.findUnique({
      where: { id: postId },
      select: { id: true, worldOwnerId: true }
    });
    if (!post || post.worldOwnerId !== worldOwnerId) {
      return jsonResponse({ error: "POST_NOT_FOUND" }, { status: 404 });
    }

    const formData = await request.formData();
    const fileValue = formData.get("file");
    if (!(fileValue instanceof File)) {
      return jsonResponse({ error: "FILE_REQUIRED" }, { status: 400 });
    }
    if (!isValidImageUpload(fileValue)) {
      return jsonResponse({ error: "INVALID_IMAGE_FILE" }, { status: 400 });
    }

    const saved = await saveWorldPostImageFile(fileValue, worldOwnerId, postId);
    const imageUrl = resolveWorldPostImageFileUrl(postId, saved.storageKey);
    await prisma.worldPost.update({
      where: { id: postId },
      data: {
        imageUrl,
        imageStorageKey: saved.storageKey,
        imageContentType: fileValue.type || "application/octet-stream"
      }
    });

    return jsonResponse({ ok: true, postId, imageUrl });
  })
  .delete("/world/posts/:postId", async ({ request, params }) => {
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

    const postId = String((params as Record<string, unknown>).postId ?? "");
    const post = await prisma.worldPost.findUnique({
      where: { id: postId },
      select: { id: true, worldOwnerId: true }
    });
    if (!post || post.worldOwnerId !== worldOwnerId) {
      return jsonResponse({ error: "POST_NOT_FOUND" }, { status: 404 });
    }

    await prisma.worldPost.delete({
      where: { id: postId }
    });

    return jsonResponse({ ok: true });
  })
  .get("/world/posts/:postId/comments", async ({ request, params }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const postId = String((params as Record<string, unknown>).postId ?? "");
    const post = await prisma.worldPost.findUnique({
      where: { id: postId },
      select: { id: true, worldOwnerId: true }
    });
    if (!post) {
      return jsonResponse({ error: "POST_NOT_FOUND" }, { status: 404 });
    }

    const activeWorldOwnerId = await resolveActiveWorldOwnerId(user.id);
    if (activeWorldOwnerId !== post.worldOwnerId) {
      return jsonResponse({ error: "FORBIDDEN" }, { status: 403 });
    }

    const comments = await prisma.worldPostComment.findMany({
      where: { postId: post.id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      },
      orderBy: { createdAt: "asc" },
      take: 200
    });

    return jsonResponse({
      comments: comments.map((comment) => ({
        id: comment.id,
        postId: comment.postId,
        message: comment.message,
        author: {
          id: comment.createdBy.id,
          name: comment.createdBy.name ?? "User",
          avatarUrl: comment.createdBy.avatarUrl
        },
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString()
      }))
    });
  })
  .post("/world/posts/:postId/comments", async ({ request, params }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const postId = String((params as Record<string, unknown>).postId ?? "");
    const post = await prisma.worldPost.findUnique({
      where: { id: postId },
      select: { id: true, worldOwnerId: true }
    });
    if (!post) {
      return jsonResponse({ error: "POST_NOT_FOUND" }, { status: 404 });
    }

    const activeWorldOwnerId = await resolveActiveWorldOwnerId(user.id);
    if (activeWorldOwnerId !== post.worldOwnerId) {
      return jsonResponse({ error: "FORBIDDEN" }, { status: 403 });
    }

    const payload = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const message = normalizeWorldPostCommentMessage(payload?.message);
    if (!message) {
      return jsonResponse({ error: "MESSAGE_REQUIRED" }, { status: 400 });
    }

    const comment = await prisma.worldPostComment.create({
      data: {
        postId: post.id,
        worldOwnerId: post.worldOwnerId,
        createdById: user.id,
        message
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      }
    });

    return jsonResponse({
      ok: true,
      comment: {
        id: comment.id,
        postId: comment.postId,
        message: comment.message,
        author: {
          id: comment.createdBy.id,
          name: comment.createdBy.name ?? "User",
          avatarUrl: comment.createdBy.avatarUrl
        },
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString()
      }
    });
  })
  .get("/world/posts/:postId/image", async ({ request, params }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return new Response("Auth required", { status: 401 });
    }

    const postId = String((params as Record<string, unknown>).postId ?? "");
    const post = await prisma.worldPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        worldOwnerId: true,
        imageUrl: true,
        imageStorageKey: true,
        imageContentType: true
      }
    });
    if (!post || !post.imageStorageKey) {
      return new Response("Not found", { status: 404 });
    }

    const activeWorldOwnerId = await resolveActiveWorldOwnerId(user.id);
    if (activeWorldOwnerId !== post.worldOwnerId) {
      return new Response("Forbidden", { status: 403 });
    }

    const publicUrl = resolveWorldAssetPublicUrl(post.imageStorageKey);
    if (publicUrl) {
      return Response.redirect(publicUrl, 302);
    }

    const filePath = path.join(WORLD_STORAGE_ROOT, post.imageStorageKey);
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(file, {
      headers: {
        "Content-Type": post.imageContentType || "application/octet-stream",
        "Cache-Control": "private, max-age=120"
      }
    });
  })
  .get("/world/photo-walls/:photoWallId/image", async ({ request, params }) => {
    const user = await resolveSessionUser(prisma, request, SESSION_COOKIE_NAME);
    if (!user) {
      return new Response("Auth required", { status: 401 });
    }

    const photoWallId = String((params as Record<string, unknown>).photoWallId ?? "");
    const wall = await prisma.worldPhotoWall.findUnique({
      where: { id: photoWallId },
      select: {
        id: true,
        worldOwnerId: true,
        imageStorageKey: true,
        imageContentType: true
      }
    });
    if (!wall || !wall.imageStorageKey) {
      return new Response("Not found", { status: 404 });
    }

    const activeWorldOwnerId = await resolveActiveWorldOwnerId(user.id);
    if (activeWorldOwnerId !== wall.worldOwnerId) {
      return new Response("Forbidden", { status: 403 });
    }

    const publicUrl = resolveWorldAssetPublicUrl(wall.imageStorageKey);
    if (publicUrl) {
      return Response.redirect(publicUrl, 302);
    }

    const filePath = path.join(WORLD_STORAGE_ROOT, wall.imageStorageKey);
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(file, {
      headers: {
        "Content-Type": wall.imageContentType || "application/octet-stream",
        "Cache-Control": "private, max-age=120"
      }
    });
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
            worldOwnerId: true,
            visibility: true
          }
        }
      }
    });

    if (!version) {
      return new Response("Not found", { status: 404 });
    }

    const activeWorldOwnerId = await resolveActiveWorldOwnerId(user.id);
    const canAccess =
      version.asset.visibility === WorldAssetVisibility.PUBLIC ||
      activeWorldOwnerId === version.asset.worldOwnerId;
    if (!canAccess) {
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

void startWorldAssetGenerationWorker();

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
