(() => {
  const ASSIGNMENTS_PAGE_URL_KEY = "assignmentsPageUrl";

  const escapeRegex = (value: string): string =>
    value.replace(/[.*^$+?()[\]{}|\\]/g, "\\$&");

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

  const doesUrlMatch = (currentUrl: string, storedUrl: string): boolean => {
    const trimmed = storedUrl.trim();

    if (trimmed.length === 0) {
      return false;
    }

    if (trimmed.includes("*")) {
      const pattern = convertMatchPatternToRegExp(trimmed);
      return pattern
        ? pattern.test(currentUrl)
        : currentUrl.includes(trimmed.replace(/\*/g, ""));
    }

    return currentUrl.startsWith(trimmed);
  };

  const checkAssignmentsPage = (): void => {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage?.local ||
      typeof chrome.storage.local.get !== "function"
    ) {
      return;
    }

    chrome.storage.local.get([ASSIGNMENTS_PAGE_URL_KEY], (result) => {
      if (chrome?.runtime?.lastError) {
        return;
      }

      const rawValue = result?.[ASSIGNMENTS_PAGE_URL_KEY];
      const assignmentsUrl = typeof rawValue === "string" ? rawValue : "";

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

const findData = (): void => {
  const recordsTable = document.getElementById(
    "grid_translation_jobs_grid_records"
  );
  const columnsTable = document.getElementById(
    "grid_translation_jobs_grid_columns"
  );

  if (!recordsTable || !columnsTable) {
    console.warn("Records table or columns table not found");
    return;
  }

  // Find the header row in the columns table
  const headerRow = columnsTable.querySelector<HTMLTableRowElement>("tr");
  if (!headerRow) {
    console.warn("Header row not found");
    return;
  }

  // Columns we care about
  const columnsOfInterest = [
    "Title",
    "Clients",
    "Runtime",
    "Latest Video Version",
  ];
  const colIndexes: Record<string, number> = {};

  // Dynamically map heading names to column numbers
  headerRow.querySelectorAll<HTMLTableCellElement>("td").forEach((td) => {
    const headerText = td.textContent?.trim();
    if (headerText && columnsOfInterest.includes(headerText)) {
      colIndexes[headerText] = parseInt(td.getAttribute("col") || "-1", 10);
    }
  });

  // Verify all columns found
  for (const col of columnsOfInterest) {
    if (colIndexes[col] === undefined) {
      console.warn(`Column "${col}" not found`);
      return;
    }
  }

  // Iterate over data rows
  const rows = recordsTable.querySelectorAll<HTMLTableRowElement>("tr");
  for (const row of rows) {
    const lineAttr = row.getAttribute("line");
    if (!lineAttr || lineAttr === "0" || lineAttr === "top") continue; // skip placeholder rows

    // Grab cells using the dynamic column numbers
    const titleCell = row.querySelector<HTMLDivElement>(
      `td[col="${colIndexes["Title"]}"] div`
    );
    const clientsCell = row.querySelector<HTMLDivElement>(
      `td[col="${colIndexes["Clients"]}"] div`
    );
    const runtimeCell = row.querySelector<HTMLDivElement>(
      `td[col="${colIndexes["Runtime"]}"] div`
    );
    const versionLink = row.querySelector<HTMLAnchorElement>(
      `td[col="${colIndexes["Assignment Due Date"]}"] div`
    );

    // Stop crawling if any required data is missing
    if (!titleCell || !clientsCell || !runtimeCell || !versionLink) break;

    console.log(`Title: ${titleCell.textContent?.trim()}`);
    console.log(`Clients: ${clientsCell.textContent?.trim()}`);
    console.log(`Runtime: ${runtimeCell.textContent?.trim()}`);
    console.log(`Assignment Due Date: ${versionLink.textContent?.trim()}`);
    console.log("------");
  }
};
