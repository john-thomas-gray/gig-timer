import assert from "node:assert/strict";
import test from "node:test";

import {
  getNetflixRequestRefFromUrl,
  isNetflixAuthoringUrl,
  isNetflixEditorUrl,
} from "../utils/netflix.js";

test("Netflix authoring matcher keeps the existing editor URL", () => {
  const url =
    "https://authoring.netflixstudios.com/editor?requestRef=dubtext%3Adubtext_script_authoring%3A28fbbe84-bb57-4cf8-b97c-f9e666d6e63d";

  assert.equal(isNetflixAuthoringUrl(url), true);
  assert.equal(
    getNetflixRequestRefFromUrl(url),
    "dubtext:dubtext_script_authoring:28fbbe84-bb57-4cf8-b97c-f9e666d6e63d",
  );
});

test("Netflix authoring matcher supports Originator Studio document URLs", () => {
  const url =
    "https://originatorstudio.netflixstudios.com/document/dubtext:dubtext_script_authoring:c1742900-25d4-4052-b4a1-342dbe1fc496";

  assert.equal(isNetflixAuthoringUrl(url), true);
  assert.equal(
    getNetflixRequestRefFromUrl(url),
    "dubtext:dubtext_script_authoring:c1742900-25d4-4052-b4a1-342dbe1fc496",
  );
  assert.equal(isNetflixEditorUrl(url), false);
});

test("Netflix editor matcher excludes Originator Studio documents", () => {
  assert.equal(
    isNetflixEditorUrl(
      "https://authoring.netflixstudios.com/editor?requestRef=example",
    ),
    true,
  );
  assert.equal(
    isNetflixEditorUrl(
      "https://originatorstudio.netflixstudios.com/document/example",
    ),
    false,
  );
});

test("Netflix authoring matcher rejects unrelated Netflix Studio pages", () => {
  assert.equal(
    isNetflixAuthoringUrl("https://originatorstudio.netflixstudios.com/"),
    false,
  );
  assert.equal(
    isNetflixAuthoringUrl("https://example.netflixstudios.com/document/test"),
    false,
  );
});
