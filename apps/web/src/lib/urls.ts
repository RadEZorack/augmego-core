export function createApiUrlResolver(apiBase: string | undefined) {
  return (path: string) => {
    const base = apiBase && apiBase.length > 0 ? apiBase : window.location.origin;
    return new URL(path, base).toString();
  };
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
