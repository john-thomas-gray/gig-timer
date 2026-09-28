import assert from "node:assert/strict";
import test from "node:test";
import { detectWorkplacePage } from "../utils/workplace.js";

const pixelogic = "https://phelix.pixelogicmedia.com";
const netflix = "https://authoring.netflixstudios.com";
const originator = "https://originatorstudio.netflixstudios.com";

for (const [url, site, metadata, timer] of [
  [`${pixelogic}/composition-editor/projects/188823?taskId=15591854`, "pixelogic", true, true],
  [`${pixelogic}/composition-editor/#/projects/188823?taskId=15591854`, "pixelogic", true, true],
  [`${pixelogic}/composition-editor`, "pixelogic", false, false],
  [`${pixelogic}/operations-manager/tasks/15591854`, "pixelogic", true, false],
  [`${pixelogic}/operations-manager/tasks`, "pixelogic", false, false],
  [`${netflix}/editor?requestRef=example`, "netflix", true, true],
  [`${originator}/document/example`, "netflix", true, true],
  [`${originator}/`, "netflix", false, false],
  ["https://unrelated.example/", undefined, false, false],
]) {
  test(`shared workplace detector classifies ${url}`, () => {
    // Stored settings must not turn a provider's list or home page into a timer.
    const result = detectWorkplacePage(url, {
      assignments: `${netflix}/editor`,
      workplace: `${pixelogic}/composition-editor/projects/105667`,
    });
    assert.equal(result.site, site);
    assert.equal(result.isProjectMetadataPage, metadata);
    assert.equal(result.isTimerPage, timer);
    if (site === "netflix") assert.equal(result.isAssignmentsPage, false);
  });
}
