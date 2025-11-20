"use strict";

export const insertRegexEscapes = (value) => value.replace(/[.*^$+?()[\]{}|\\]/g, "\\$&");

export const convertUrlToRegExp = (pattern) => {

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

export const validateAndReturnValues = (storedProjects, propertyKey) => {
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

export const getStoredValues = (storageKey, propertyKeyString) =>

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
      [storageKey, propertyKeyString],
      (result) => {
        if (chrome?.runtime?.lastError) {
          console.warn(
            "Failed to retrieve stored project.",
            chrome.runtime.lastError
          );
          resolve([]);
          return;
        }
        const returnedValues = validateAndReturnValues(
          result[storageKey],
          propertyKeyString
        );
        if (returnedValues.length > 0) {
          resolve(returnedValues);
          return;
        }

        const legacyValue = result[propertyKeyString];
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

  /* Does url match should probably just return true or false and I can put the
  callbacks in an if statement */
export const doesUrlMatch = (inputUrl, checkAgainstUrls, callbacks) => {
  const doesUrlMatchPattern = (url, pattern) => {
    const regex = convertUrlToRegExp(pattern);
    if (regex) return regex.test(url);
    return url.includes(pattern);
  };

  const urlsToCheck = Array.isArray(checkAgainstUrls)
    ? checkAgainstUrls
    : [checkAgainstUrls];

  if (urlsToCheck.some((url) => doesUrlMatchPattern(inputUrl, url))) {
    if (!callbacks) {
      console.log("inputUrl matches stored url(s).");
    } else if (typeof callbacks === "function") {
      callbacks();
    } else if (Array.isArray(callbacks)) {
      callbacks.forEach((fn) => {
        if (typeof fn === "function") fn();
      });
    }
  } else {
    console.log(`inputUrl does not match ${checkAgainstUrls}`);
  }
};



  export const findProjectByTitle = (storedProjects, title) => {
    if (!storedProjects || !Array.isArray(storedProjects)) {
      return undefined;
    }
    return storedProjects.find((project) => project.projectTitle === title);
  };
