"use strict";
const manifest = typeof chrome !== "undefined" && chrome.runtime?.getManifest
    ? chrome.runtime.getManifest()
    : undefined;
const manifestMatches = manifest && manifest.content_scripts
    ? Array.isArray(manifest.content_scripts)
        ? manifest.content_scripts.flatMap((script) => script.matches ?? [])
        : manifest.content_scripts.matches ?? []
    : [];
const doesUrlMatchPattern = (url, pattern) => {
    const regex = convertMatchPatternToRegExp(pattern);
    if (regex) {
        return regex.test(url);
    }
    return url.includes(pattern);
};
const convertMatchPatternToRegExp = (pattern) => {
    if (pattern === "<all_urls>") {
        return /^(https?|file|ftp|chrome-extension):\/\/.*/;
    }
    const matchPatternRegExp = /^(?<scheme>\*|https?|file|ftp|chrome-extension):\/\/(?<host>\*|\*\.[^*/]+|[^*/]+)(?<path>\/.*)$/;
    const match = matchPatternRegExp.exec(pattern);
    if (!match || !match.groups) {
        return null;
    }
    const groups = match.groups;
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
const escapeRegex = (value) => value.replace(/[.*^$+?()[\]{}|\\]/g, "\\$&");
const getStoredMatches = () => new Promise((resolve) => {
    if (typeof chrome === "undefined" ||
        !chrome.storage?.local ||
        typeof chrome.storage.local.get !== "function") {
        resolve([]);
        return;
    }
    chrome.storage.local.get({ matchesUrl: "" }, (result) => {
        if (chrome?.runtime?.lastError) {
            console.warn("Failed to retrieve stored match pattern.", chrome.runtime.lastError);
            resolve([]);
            return;
        }
        const storedValue = result.matchesUrl;
        if (typeof storedValue === "string" && storedValue.trim().length > 0) {
            resolve([storedValue.trim()]);
            return;
        }
        if (Array.isArray(storedValue)) {
            resolve(storedValue
                .filter((value) => typeof value === "string" && value.trim().length > 0)
                .map((value) => value.trim()));
            return;
        }
        resolve([]);
    });
});
const currentUrl = window.location.href;
const evaluateMatches = (patterns) => {
    if (patterns.some((pattern) => doesUrlMatchPattern(currentUrl, pattern))) {
        window.workTimer?.startTimer?.();
    }
};
const initialize = async () => {
    const storedMatches = await getStoredMatches();
    if (storedMatches.length > 0) {
        evaluateMatches(storedMatches);
        return;
    }
    evaluateMatches(manifestMatches);
};
void initialize();
//# sourceMappingURL=content.js.map