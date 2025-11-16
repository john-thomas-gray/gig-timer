"use strict";

const escapeRegex = (value) => value.replace(/[.*^$+?()[\]{}|\\]/g, "\\$&");

const convertMatchPatternToRegExp = (pattern) => {
  if (pattern === "<all_urls>") {
    return /^(https?|file|ftp|chrome-extension):\/\/.*/;
  }
  const matchPatternRegExp =
    /^(?<scheme>\*|https?|file|ftp|chrome-extension):\/\/(?<host>\*|\*\.[^*/]+|[^*/]+)(?<path>\/.*)$/;
  const match = matchPatternRegExp.exec(pattern);
  if (!match || !match.groups) {
    return null;
  }
  const { scheme, host, path } = match.groups;
  if (!scheme || !host || !path) {
    return null;
  }
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

const doesUrlMatchPattern = (url, rawPattern) => {
  if (typeof url !== "string" || typeof rawPattern !== "string") {
    return false;
  }
  const pattern = rawPattern.trim();
  if (!pattern) {
    return false;
  }
  if (pattern.includes("*")) {
    const regex = convertMatchPatternToRegExp(pattern);
    if (regex) {
      return regex.test(url);
    }
    const fallback = pattern.replace(/\*/g, "");
    return fallback.length > 0 ? url.includes(fallback) : false;
  }
  if (/^[a-z]+:\/\//i.test(pattern)) {
    return url.startsWith(pattern);
  }
  return url.includes(pattern);
};

export { doesUrlMatchPattern, convertMatchPatternToRegExp };
