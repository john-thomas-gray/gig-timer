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

const extractValuesFromStoredProjects = (storedProjects, propertyKey) => {
  if (!Array.isArray(storedProjects)) {
    return [];
  }
  if (typeof propertyKey !== "string" || propertyKey.trim().length === 0) {
    throw new Error("propertyKey must be a non-empty string");
  }

  const values = new Set();

  storedProjects.forEach((project) => {
    if (!project || typeof project !== "object") {
      return;
    }
    const value = project[propertyKey];
    if (typeof value === "string" && value.trim().length > 0) {
      values.add(value.trim());
    }
  });

  return Array.from(values);
};
