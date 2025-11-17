"use strict";

(() => {
  const BRIDGE_FLAG = "__workTimerAssignmentsBridgeInitialized";
  if (window[BRIDGE_FLAG]) {
    return;
  }
  window[BRIDGE_FLAG] = true;

  const MESSAGE_SOURCE = "workTimerAssignmentsBridge";
  const REQUEST_EVENT = "worktimer-assignments-request";
  const MAX_ATTEMPTS = 60;
  const ATTEMPT_DELAY_MS = 500;

  const postMessageToContent = (type, payload) => {
    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        type,
        payload,
      },
      "*"
    );
  };

  const sanitizeColumnDescriptor = (column) => {
    const descriptor = {};
    const addIfString = (key, value) => {
      if (typeof value === "string" && value.trim().length > 0) {
        descriptor[key] = value;
      }
    };
    addIfString("field", column?.field);
    addIfString("text", column?.text);
    addIfString("caption", column?.caption);
    addIfString("title", column?.title);
    addIfString("name", column?.name);
    addIfString("id", column?.id);
    return descriptor;
  };

  const sanitizeRecord = (record) => {
    const sanitized = {};
    Object.keys(record ?? {}).forEach((key) => {
      const value = record[key];
      if (typeof value !== "function") {
        sanitized[key] = value;
      }
    });
    return sanitized;
  };

  const collectSnapshot = () => {
    const grid = window.w2ui?.translation_jobs_grid;
    if (!grid || !Array.isArray(grid.columns) || !Array.isArray(grid.records)) {
      return null;
    }
    return {
      columns: grid.columns.map((column) => sanitizeColumnDescriptor(column)),
      records: grid.records.map((record) => sanitizeRecord(record)),
      gridSize: {
        columnCount: grid.columns.length,
        recordCount: grid.records.length,
      },
    };
  };

  const sendSnapshotToContent = () => {
    const snapshot = collectSnapshot();
    if (!snapshot) {
      return false;
    }
    postMessageToContent("assignmentRecords", { snapshot });
    return true;
  };

  const describeCurrentState = () => {
    const w2uiExists = typeof window.w2ui === "object" && window.w2ui !== null;
    const availableGridNames = w2uiExists ? Object.keys(window.w2ui) : [];
    const grid = w2uiExists ? window.w2ui.translation_jobs_grid : undefined;
    const hasGrid = typeof grid === "object" && grid !== null;
    const columnCount =
      hasGrid && Array.isArray(grid?.columns) ? grid.columns.length : 0;
    const recordCount =
      hasGrid && Array.isArray(grid?.records) ? grid.records.length : 0;
    return {
      w2uiExists,
      hasGrid,
      availableGridNames,
      columnCount,
      recordCount,
    };
  };

  const attemptSendSnapshot = (attempt = 0) => {
    if (sendSnapshotToContent()) {
      return;
    }
    if (attempt >= MAX_ATTEMPTS) {
      postMessageToContent("assignmentRecordsError", {
        reason: "Grid or records were not available.",
        state: describeCurrentState(),
      });
      return;
    }
    window.setTimeout(() => {
      attemptSendSnapshot(attempt + 1);
    }, ATTEMPT_DELAY_MS);
  };

  const handleRequest = () => {
    attemptSendSnapshot(0);
  };

  document.addEventListener(REQUEST_EVENT, handleRequest, false);
})();
