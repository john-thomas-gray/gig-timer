type ContentScriptDefinition = {
  matches?: string[];
};

type ManifestWithOptionalMatches = {
  content_scripts?: ContentScriptDefinition | ContentScriptDefinition[];
};

const manifest =
  typeof chrome !== "undefined" && chrome.runtime?.getManifest
    ? (chrome.runtime.getManifest() as ManifestWithOptionalMatches | undefined)
    : undefined;

const manifestMatches =
  manifest && manifest.content_scripts
    ? Array.isArray(manifest.content_scripts)
      ? manifest.content_scripts.flatMap((script) => script.matches ?? [])
      : manifest.content_scripts.matches ?? []
    : [];

const doesUrlMatchPattern = (url: string, pattern: string): boolean => {
  const regex = convertMatchPatternToRegExp(pattern);

  if (regex) {
    return regex.test(url);
  }

  return url.includes(pattern);
};

const convertMatchPatternToRegExp = (pattern: string): RegExp | null => {
  if (pattern === "<all_urls>") {
    return /^(https?|file|ftp|chrome-extension):\/\/.*/;
  }

  const matchPatternRegExp =
    /^(?<scheme>\*|https?|file|ftp|chrome-extension):\/\/(?<host>\*|\*\.[^*/]+|[^*/]+)(?<path>\/.*)$/;
  const match = matchPatternRegExp.exec(pattern);

  if (!match || !match.groups) {
    return null;
  }

  const groups = match.groups as {
    scheme?: string;
    host?: string;
    path?: string;
  };

  if (!groups.scheme || !groups.host || !groups.path) {
    return null;
  }

  const { scheme, host, path } = groups;

  const schemeRegex = scheme === "*" ? "(http|https)" : escapeRegex(scheme);
  const hostRegex = (() => {
    if (host === "*") {
      return "[^/]+";
    }

    if (host.startsWith("*.")) {
      return `(?:[^/]+\\.)?${escapeRegex(host.slice(2))}`;
    }

    return escapeRegex(host);
  })();

  const pathRegex = escapeRegex(path).replace(/\\\*/g, ".*");

  return new RegExp(`^${schemeRegex}://${hostRegex}${pathRegex}$`);
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*^$+?()[\]{}|\\]/g, "\\$&");

const getStoredMatches = (): Promise<string[]> =>
  new Promise((resolve) => {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage?.local ||
      typeof chrome.storage.local.get !== "function"
    ) {
      resolve([]);
      return;
    }

    chrome.storage.local.get(
      { matchesUrl: "" },
      (result: { matchesUrl?: unknown }) => {
        if (chrome?.runtime?.lastError) {
          console.warn(
            "Failed to retrieve stored match pattern.",
            chrome.runtime.lastError
          );
          resolve([]);
          return;
        }

        const storedValue = result.matchesUrl;

        if (typeof storedValue === "string" && storedValue.trim().length > 0) {
          resolve([storedValue.trim()]);
          return;
        }

        if (Array.isArray(storedValue)) {
          resolve(
            storedValue
              .filter(
                (value): value is string =>
                  typeof value === "string" && value.trim().length > 0
              )
              .map((value) => value.trim())
          );
          return;
        }

        resolve([]);
      }
    );
  });

const currentUrl = window.location.href;

const evaluateMatches = (patterns: string[]): void => {
  if (patterns.some((pattern) => doesUrlMatchPattern(currentUrl, pattern))) {
    window.workTimer?.startTimer?.();
  }
};

const initialize = async (): Promise<void> => {
  const storedMatches = await getStoredMatches();

  if (storedMatches.length > 0) {
    evaluateMatches(storedMatches);
    return;
  }

  evaluateMatches(manifestMatches);
};

void initialize();
