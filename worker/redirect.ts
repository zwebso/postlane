/** Apex HTTP host only. MX / Email Routing is unrelated. */
export const APEX_HOST = "postlane.email";
export const CANONICAL_ORIGIN = "https://www.postlane.email";

function requestHost(request: Request): string {
  const url = new URL(request.url);
  const raw = request.headers.get("Host") ?? url.host;
  return raw.split(":")[0].trim().toLowerCase().replace(/\.$/, "");
}

/** 308 apex → www, preserving path and query. www, workers.dev, and other hosts are unchanged. */
export function redirectApexToWww(request: Request): Response | null {
  if (requestHost(request) !== APEX_HOST) return null;
  const url = new URL(request.url);
  return new Response(null, {
    status: 308,
    headers: { Location: `${CANONICAL_ORIGIN}${url.pathname}${url.search}` },
  });
}
