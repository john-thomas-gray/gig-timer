import { detectPixelogicPage, isAssignmentsUrl, isWorkplaceUrl } from "./pixelogic.js";
import { detectNetflixPage } from "./netflix.js";

// Every caller uses the same page roles; providers own their route rules.
export function detectWorkplacePage(url, configuredUrls = {}) {
  return (
    detectNetflixPage(url) ??
    detectPixelogicPage(url, configuredUrls) ??
    detectLegacyPage(url, configuredUrls) ?? {
      site: undefined,
      isAssignmentsPage: false,
      isProjectMetadataPage: false,
      isTimerPage: false,
    }
  );
}

function detectLegacyPage(url, configuredUrls) {
  const isAssignmentsPage =
    Boolean(configuredUrls.assignments) &&
    isAssignmentsUrl(url, configuredUrls.assignments.trim());
  const isProjectMetadataPage =
    Boolean(configuredUrls.workplace) &&
    isWorkplaceUrl(url, configuredUrls.workplace.trim());
  if (!isAssignmentsPage && !isProjectMetadataPage) return undefined;
  return {
    site: "legacy",
    isAssignmentsPage,
    isProjectMetadataPage,
    isTimerPage: isProjectMetadataPage,
    metadataSource: "workplace",
  };
}
