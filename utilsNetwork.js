"use strict";
const PROJECT_STORAGE_KEY = "savedProjects"; // Move to general area
export const insertRegexEscapes = (value) => value.replace(/[.*^$+?()[\]{}|\\]/g, "\\$&");

const convertUrlToRegExp = (pattern) => {

  const urlParser = /^(?<scheme>\*|https?|file|ftp|chrome-extension):\/\/(?<host>\*|\*\.[^*/]+|[^*/]+)(?<path>\/.*)$/;

  const urlRegex = urlParser.exec(pattern);
  if (!urlRegex?.groups) return null;

  const { scheme, host, path } = urlRegex.groups;
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
  const regex = convertUrlToRegExp(pattern);
  if (regex) {
    return regex.test(url);
  }
  return url.includes(pattern);
}

const retrieveValuesFromStoredProjects = (storedProjects, propertyKey) => {
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

const getStoredWorkspaceUrls = () =>

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
      [PROJECT_STORAGE_KEY, "workspaceUrl"],
      (result) => {
        if (chrome?.runtime?.lastError) {
          console.warn(
            "Failed to retrieve stored project.",
            chrome.runtime.lastError
          );
          resolve([]);
          return;
        }
        const retrievedWorkspaceUrls = retrieveValuesFromStoredProjects(
          result[PROJECT_STORAGE_KEY],
          "workspaceUrl"
        );
        if (retrievedWorkspaceUrls.length > 0) {
          resolve(retrievedWorkspaceUrls);
          return;
        }

        const legacyValue = result.workspaceUrl;
        if (typeof legacyValue === "string" && legacyValue.trim().length > 0) {
          resolve([legacyValue.trim()]);
          return;
        }
        if (Array.isArray(legacyValue)) {
          resolve(
            legacyValue
              .filter(
                (value) => typeof value === "string" && value.trim().length > 0
              )
              .map((value) => value.trim())
          );
          return;
        }
        resolve([]);
      }
    );
  });


  export const findProjectByTitle = (storedProjects, title) => {
    if (!storedProjects || !Array.isArray(storedProjects)) {
      return undefined;
    }
    return storedProjects.find((project) => project.projectTitle === title);
  };
