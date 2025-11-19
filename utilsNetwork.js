"use strict";

export const insertRegexEscapes = (value) => value.replace(/[.*^$+?()[\]{}|\\]/g, "\\$&");

const convertMatchPatternToRegExp = (pattern) => {

  const patternParser = /^(?<scheme>\*|https?|file|ftp|chrome-extension):\/\/(?<host>\*|\*\.[^*/]+|[^*/]+)(?<path>\/.*)$/;

  const match = patternParser.exec(pattern);
  if (!match?.groups) return null;

  const { scheme, host, path } = match.groups;
  if (!scheme || !host || !path) return null;

  const schemeRegex = scheme === "*" ? "(http|https)" : insertRegexEscapes(scheme);

  const hostRegex = (() => {
    if (host === "*") {
      return "[^/]+";
    }
    if (host.startsWith("*.")) {
      return `(?:[^/]+\\.)?${insertRegexEscapes(host.slice(2))}`;
    }
    return insertRegexEscapes(host);
  })();

  const pathRegex = insertRegexEscapes(path).replace(/\\\*/g, ".*");

  return new RegExp(`^${schemeRegex}://${hostRegex}${pathRegex}$`);
};

export const doesUrlMatchPattern = (url, pattern) => {
  const regex = convertMatchPatternToRegExp(pattern);
  if (regex) {
    return regex.test(url);
  }
  return url.includes(pattern);
}
