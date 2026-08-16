const NETFLIX_AUTHORING_HOSTS = new Set([
  "authoring.netflixstudios.com",
  "originatorstudio.netflixstudios.com",
]);

export function isNetflixAuthoringUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed || !NETFLIX_AUTHORING_HOSTS.has(parsed.hostname)) return false;

  return (
    parsed.pathname.startsWith("/editor") ||
    parsed.pathname.startsWith("/document/")
  );
}

export function isNetflixEditorUrl(url) {
  const parsed = parseUrl(url);
  return (
    parsed?.hostname === "authoring.netflixstudios.com" &&
    parsed.pathname.startsWith("/editor")
  );
}

export function getNetflixRequestRefFromUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) return undefined;

  const queryRequestRef = parsed.searchParams.get("requestRef")?.trim();
  if (queryRequestRef) return queryRequestRef;

  const documentMatch = parsed.pathname.match(/^\/document\/(.+)$/);
  if (!documentMatch) return undefined;

  try {
    return decodeURIComponent(documentMatch[1]).trim().replace(/\/+$/, "") || undefined;
  } catch {
    return documentMatch[1].trim().replace(/\/+$/, "") || undefined;
  }
}

function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}
