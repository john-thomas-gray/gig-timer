import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateInvoiceAmount,
  normalizeDurationInput,
} from "../web-accessible-resources/normalization.js";

test("runtime popup timecode parses hours, minutes, seconds, and frames", () => {
  const runtimeSeconds = normalizeDurationInput("26:40:26:15", 23.976);

  assert.ok(Math.abs(runtimeSeconds - 96026.62562562562) < 1e-9);
});

test("three-part duration input parses as hours, minutes, and seconds", () => {
  assert.equal(normalizeDurationInput("02:03:04"), 7384);
});

test("four-part duration input without frame rate parses as work time centiseconds", () => {
  assert.equal(normalizeDurationInput("01:02:03:04"), 3723.04);
});

test("invoice calculation uses frame-aware runtime precision", () => {
  const runtimeSeconds = normalizeDurationInput("00:00:29:15", 25);

  assert.equal(calculateInvoiceAmount(6, runtimeSeconds), 0);
});
