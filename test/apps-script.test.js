import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const script = fs.readFileSync(
  new URL("../apps-script/Code.gs", import.meta.url),
  "utf8",
);
const headers = [
  "Project Title", "Season", "Episode", "Runtime", "Invoice Amount",
  "Hourly Rate", "Rate", "Work Time", "Contractor", "Client", "Genre",
  "Date Completed",
];

function createEndpoint(initialRows = []) {
  const cells = [headers.slice(), ...initialRows.map((row) => row.slice())];
  const range = (row, column, height, width) => {
    const result = {
      getValues: () => cells.slice(row - 1, row - 1 + height)
        .map((values) => values.slice(column - 1, column - 1 + width)),
      getDisplayValues: () => result.getValues()
        .map((values) => values.map((value) => String(value ?? ""))),
      setValues(values) {
        values.forEach((valuesRow, rowOffset) => {
          cells[row - 1 + rowOffset] ??= [];
          valuesRow.forEach((value, columnOffset) => {
            cells[row - 1 + rowOffset][column - 1 + columnOffset] = value;
          });
        });
        return result;
      },
    };
    for (const method of [
      "setFontWeight", "setFontColor", "setBackground", "setBackgrounds",
      "setVerticalAlignment", "setWrapStrategy", "setNumberFormat",
    ]) result[method] = () => result;
    return result;
  };
  const sheet = {
    getDataRange: () => range(1, 1, cells.length, cells[0].length),
    getRange: range,
    getMaxRows: () => 1000,
    getMaxColumns: () => 26,
    getLastColumn: () => cells[0].length,
    setFrozenRows() {},
    autoResizeColumns() {},
  };
  const context = vm.createContext({
    console,
    Date,
    LockService: {
      getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
    },
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: () => sheet }),
      WrapStrategy: { CLIP: "CLIP" },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => null,
        setProperty() {},
      }),
    },
    ContentService: { createTextOutput: (text) => text },
  });
  vm.runInContext(script, context);
  return {
    cells,
    export(projectData) {
      return context.doPost({
        postData: { contents: JSON.stringify({ projectData }) },
      });
    },
  };
}

const episode = {
  title: "Genre Export Example",
  season: "1",
  episode: "2",
  date_completed: "2026-09-17",
};
const existingRow = [
  episode.title, "1", "2", "", "", "", "", "", "", "", "Drama",
  episode.date_completed,
];

test("spreadsheet export writes genre into its existing column for a new episode", () => {
  const endpoint = createEndpoint();

  assert.equal(endpoint.export({ ...episode, genre: "  Comedy  " }), "OK");

  assert.deepEqual(endpoint.cells[0], headers);
  assert.equal(endpoint.cells.length, 2);
  assert.equal(endpoint.cells[1][0], episode.title);
  assert.equal(endpoint.cells[1][10], "Comedy");
});

test("spreadsheet export updates genre on an existing episode without duplicating it", () => {
  const endpoint = createEndpoint([existingRow]);

  assert.equal(endpoint.export({ ...episode, genre: "Comedy" }), "OK");

  assert.deepEqual(endpoint.cells[0], headers);
  assert.equal(endpoint.cells.length, 2);
  assert.equal(endpoint.cells[1][10], "Comedy");
});

test("spreadsheet export preserves an existing genre when the payload omits it", () => {
  const endpoint = createEndpoint([existingRow]);

  assert.equal(endpoint.export(episode), "OK");

  assert.deepEqual(endpoint.cells[0], headers);
  assert.equal(endpoint.cells.length, 2);
  assert.equal(endpoint.cells[1][10], "Drama");
});
