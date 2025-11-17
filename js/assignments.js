"use strict";

(() => {
  const escapeRegex = (value) => value.replace(/[.*^$+?()[\]{}|\\]/g, "\\$&");

  const convertMatchPatternToRegExp = (pattern) => {
    if (pattern === "<all_urls>") {
      return /^(https?|file|ftp|chrome-extension):\/\/.*/;
    }
    const matchPatternRegExp =
      /^(?<scheme>\*|https?|file|ftp|chrome-extension):\/\/(?<host>\*|\*\.[^*/]+|[^*/]+)(?<path>\/.*)$/;
    const match = matchPatternRegExp.exec(pattern);
    if (!match || !match.groups) return null;

    const { scheme, host, path } = match.groups;
    const schemeRegex = scheme === "*" ? "(http|https)" : escapeRegex(scheme);
    const hostRegex =
      host === "*"
        ? "[^/]+"
        : host.startsWith("*.")
        ? `(?:[^/]+\\.)?${escapeRegex(host.slice(2))}`
        : escapeRegex(host);
    const pathRegex = escapeRegex(path).replace(/\\\*/g, ".*");

    return new RegExp(`^${schemeRegex}://${hostRegex}${pathRegex}$`);
  };

  const doesUrlMatch = (currentUrl, storedUrl) => {
    const trimmed = storedUrl.trim();
    if (!trimmed) return false;
    if (trimmed.includes("*")) {
      const pattern = convertMatchPatternToRegExp(trimmed);
      return pattern
        ? pattern.test(currentUrl)
        : currentUrl.includes(trimmed.replace(/\*/g, ""));
    }
    return currentUrl.startsWith(trimmed);
  };

  const checkAssignmentsPage = () => {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage?.local ||
      typeof chrome.storage.local.get !== "function"
    ) {
      return;
    }

    chrome.storage.local.get([ASSIGNMENTS_PAGE_URL_KEY], (result) => {
      if (chrome?.runtime?.lastError) return;

      const rawValue = result?.[ASSIGNMENTS_PAGE_URL_KEY];
      const storedValue =
        typeof rawValue === "string" && rawValue.trim().length > 0
          ? rawValue.trim()
          : "";
      const assignmentsUrl =
        storedValue.length > 0
          ? storedValue
          : typeof ASSIGNMENTS_PAGE_URL_KEY === "string"
          ? ASSIGNMENTS_PAGE_URL_KEY
          : "";

      if (
        assignmentsUrl &&
        doesUrlMatch(window.location.href, assignmentsUrl)
      ) {
        console.log("Assignments Page");
        findData();
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkAssignmentsPage);
  } else {
    checkAssignmentsPage();
  }
})();

const BRIDGE_SCRIPT_ID = "worktimer-assignments-bridge-script";
const BRIDGE_MESSAGE_SOURCE = "workTimerAssignmentsBridge";
const BRIDGE_REQUEST_EVENT_NAME = "worktimer-assignments-request";

let hasAttachedAssignmentsBridgeListener = false;
let isBridgeScriptInjected = false;
let bridgeInjectionPromise = null;

const normalizeColumnLabel = (label) => {
  if (typeof label !== "string") {
    return "";
  }
  return label
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const columnMatchConfigs = [
  {
    key: "title",
    friendlyLabel: "Title",
    matchers: ["title"],
  },
  {
    key: "clients",
    friendlyLabel: "Clients",
    matchers: ["clients", "client"],
  },
  {
    key: "runtime",
    friendlyLabel: "Runtime",
    matchers: ["runtime", "run time"],
  },
  {
    key: "assignmentDueDate",
    friendlyLabel: "Assignment Due Date",
    matchers: ["assignment due date", "due date"],
  },
];

const collectColumnLabelCandidates = (column) => {
  const candidates = [];
  const rawValues = [
    column?.text,
    column?.caption,
    column?.title,
    column?.name,
    column?.id,
    column?.field,
  ];
  rawValues.forEach((value) => {
    if (typeof value === "string" && value.trim().length > 0) {
      const normalized = normalizeColumnLabel(value);
      if (normalized.length > 0) {
        candidates.push(normalized);
      }
    }
  });
  return candidates;
};

const resolveColumnField = (columns, config) => {
  if (!Array.isArray(columns) || columns.length === 0) {
    return null;
  }
  const normalizedMatchers = config.matchers
    .map((matcher) => normalizeColumnLabel(matcher))
    .filter((matcher) => matcher.length > 0);
  if (normalizedMatchers.length === 0) {
    return null;
  }
  const exactMatch = columns.find((column) => {
    const fieldName =
      typeof column?.field === "string" && column.field.trim().length > 0
        ? column.field
        : null;
    if (!fieldName) {
      return false;
    }
    const candidates = collectColumnLabelCandidates(column);
    return candidates.some((candidate) =>
      normalizedMatchers.includes(candidate)
    );
  });
  if (exactMatch?.field) {
    return exactMatch.field;
  }
  const partialMatch = columns.find((column) => {
    const fieldName =
      typeof column?.field === "string" && column.field.trim().length > 0
        ? column.field
        : null;
    if (!fieldName) {
      return false;
    }
    const candidates = collectColumnLabelCandidates(column);
    return candidates.some((candidate) =>
      normalizedMatchers.some(
        (matcher) =>
          candidate.includes(matcher) ||
          matcher.includes(candidate) ||
          candidate.replace(/\s+/g, "").includes(matcher.replace(/\s+/g, ""))
      )
    );
  });
  if (partialMatch?.field) {
    return partialMatch.field;
  }
  return null;
};

const describeAvailableColumns = (columns) => {
  if (!Array.isArray(columns)) {
    return "";
  }
  const unique = new Set();
  columns.forEach((column) => {
    ["text", "caption", "title", "name", "id", "field"].forEach((key) => {
      const value = column?.[key];
      if (typeof value === "string" && value.trim().length > 0) {
        unique.add(value.trim());
      }
    });
  });
  return Array.from(unique).join(", ");
};

const formatSecondsAsMinutesLabel = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes}mins`;
};

const deriveRuntimeFromSourceMaterials = (record) => {
  const materials = record?.alpha_source_materials;
  if (!Array.isArray(materials)) {
    return "";
  }
  for (const material of materials) {
    if (!material || typeof material !== "object") {
      continue;
    }
    const numericCandidate =
      material.program_runtime ??
      material.actual_runtime ??
      material.estimated_runtime ??
      material.runtime ??
      material.duration_seconds ??
      null;
    if (Number.isFinite(numericCandidate) && numericCandidate > 0) {
      const formatted = formatSecondsAsMinutesLabel(numericCandidate);
      if (formatted) {
        return formatted;
      }
    }
    const stringCandidate =
      material.runtime_display ??
      material.program_runtime_display ??
      material.display_runtime ??
      null;
    if (
      typeof stringCandidate === "string" &&
      stringCandidate.trim().length > 0
    ) {
      return stringCandidate.trim();
    }
  }
  return "";
};

const logAssignmentRecords = (snapshot) => {
  if (
    !snapshot ||
    !Array.isArray(snapshot.columns) ||
    !Array.isArray(snapshot.records)
  ) {
    console.warn("Assignments bridge did not return a usable snapshot.");
    return;
  }
  if (snapshot.records.length === 0) {
    console.info("No assignment records found.");
    return;
  }

  const columnFieldMap = {};
  columnMatchConfigs.forEach((config) => {
    columnFieldMap[config.key] = resolveColumnField(snapshot.columns, config);
    if (!columnFieldMap[config.key]) {
      console.warn(
        `Assignments bridge could not find the "${
          config.friendlyLabel
        }" column. Available columns: ${describeAvailableColumns(
          snapshot.columns
        )}`
      );
    }
  });

  snapshot.records.forEach((record, index) => {
    const titleValue = columnFieldMap.title
      ? record?.[columnFieldMap.title]
      : record?.title;
    const clientsValue = columnFieldMap.clients
      ? record?.[columnFieldMap.clients]
      : record?.clients;
    let runtimeValue = columnFieldMap.runtime
      ? record?.[columnFieldMap.runtime]
      : record?.runtime;
    if (
      (runtimeValue === undefined ||
        runtimeValue === null ||
        (typeof runtimeValue === "string" &&
          runtimeValue.trim().length === 0)) &&
      Array.isArray(record?.alpha_source_materials)
    ) {
      runtimeValue = deriveRuntimeFromSourceMaterials(record);
    }
    const dueDateValue = columnFieldMap.assignmentDueDate
      ? record?.[columnFieldMap.assignmentDueDate]
      : record?.assignmentDueDate;

    console.log(`Title: ${titleValue ?? ""}`);
    console.log(`Clients: ${clientsValue ?? ""}`);
    console.log(`Runtime: ${runtimeValue ?? ""}`);
    console.log(`Assignment Due Date: ${dueDateValue ?? ""}`);
    console.log("------");

    if (!runtimeValue && index === 0) {
      console.log("Assignments runtime debug record", {
        recordKeys: Object.keys(record),
        recordSample: record,
        runtimeField: columnFieldMap.runtime,
      });
    }
  });
};

const handleAssignmentsBridgeMessage = (event) => {
  if (event.source !== window) {
    return;
  }
  const data = event.data;
  if (!data || data.source !== BRIDGE_MESSAGE_SOURCE) {
    return;
  }
  if (data.type === "assignmentRecords") {
    logAssignmentRecords(data.payload?.snapshot);
    return;
  }
  if (data.type === "assignmentRecordsError") {
    const reason =
      typeof data.payload?.reason === "string" && data.payload.reason.length > 0
        ? data.payload.reason
        : "Unknown error from assignments bridge.";
    if (data.payload?.state) {
      console.warn(`Assignments bridge error: ${reason}`, data.payload.state);
    } else {
      console.warn(`Assignments bridge error: ${reason}`);
    }
  }
};

const attachAssignmentsBridgeListener = () => {
  if (hasAttachedAssignmentsBridgeListener) {
    return;
  }
  window.addEventListener("message", handleAssignmentsBridgeMessage);
  hasAttachedAssignmentsBridgeListener = true;
  window.addEventListener(
    "unload",
    () => {
      window.removeEventListener("message", handleAssignmentsBridgeMessage);
      hasAttachedAssignmentsBridgeListener = false;
    },
    { once: true }
  );
};

const getBridgeScriptUrl = () => {
  if (typeof chrome === "undefined" || !chrome.runtime?.getURL) {
    return null;
  }
  return chrome.runtime.getURL("js/assignmentsBridge.js");
};

const injectAssignmentsBridgeScript = () => {
  if (isBridgeScriptInjected) {
    return Promise.resolve();
  }
  if (bridgeInjectionPromise) {
    return bridgeInjectionPromise;
  }
  const parent =
    document.documentElement || document.head || document.body || null;
  if (!parent) {
    return Promise.reject(
      new Error("Unable to access document for bridge script injection.")
    );
  }
  const scriptUrl = getBridgeScriptUrl();
  if (!scriptUrl) {
    return Promise.reject(
      new Error("Unable to resolve assignments bridge script URL.")
    );
  }
  bridgeInjectionPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = BRIDGE_SCRIPT_ID;
    script.type = "text/javascript";
    script.src = scriptUrl;
    script.onload = () => {
      script.remove();
      isBridgeScriptInjected = true;
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Failed to load assignments bridge script."));
    };
    parent.appendChild(script);
  }).finally(() => {
    bridgeInjectionPromise = null;
  });
  return bridgeInjectionPromise;
};

const requestAssignmentsData = () => {
  const event = new CustomEvent(BRIDGE_REQUEST_EVENT_NAME);
  document.dispatchEvent(event);
};

const findData = () => {
  attachAssignmentsBridgeListener();
  injectAssignmentsBridgeScript()
    .then(() => {
      requestAssignmentsData();
    })
    .catch((error) => {
      console.error(error.message ?? error);
    });
};
