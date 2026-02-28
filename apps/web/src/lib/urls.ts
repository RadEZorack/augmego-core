export function createApiUrlResolver(apiBase: string | undefined) {
  return (path: string) => {
    const base = apiBase && apiBase.length > 0 ? apiBase : window.location.origin;
    return new URL(path, base).toString();
  };
}

export const PENDING_WORLD_JOIN_STORAGE_KEY = "augmego.pendingWorldJoin";

export function parseWorldIdFromUrl(url: URL) {
  const queryWorldId = url.searchParams.get("worldId")?.trim() ?? "";
  if (queryWorldId) return queryWorldId;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 2 && segments[0] === "world") {
    const worldId = decodeURIComponent(segments[1] ?? "").trim();
    return worldId || null;
  }

  if (segments.length !== 1) return null;
  const [segment] = segments;
  if (!segment) return null;

  // Avoid treating reserved paths or asset-like requests as world ids.
  if (segment === "api" || segment === "world" || segment.includes(".")) return null;

  const pathWorldId = decodeURIComponent(segment).trim();
  return pathWorldId || null;
}

export function buildWorldUrl(worldId: string) {
  return `${window.location.origin}/world/${encodeURIComponent(worldId)}`;
}

export function resolveWsUrl(apiBase: string | undefined, wsBase: string | undefined) {
  if (wsBase && wsBase.length > 0) return wsBase;

  if (apiBase && apiBase.length > 0) {
    const url = new URL(apiBase);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/api/v1/ws";
    url.search = "";
    return url.toString();
  }

  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/v1/ws";
  url.search = "";
  return url.toString();
}
