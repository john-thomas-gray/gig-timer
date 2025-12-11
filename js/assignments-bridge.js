"use strict";

(() => {
  // Prevent running the bridge multiple times.
  const BRIDGE_FLAG = "__workTimerAssignmentsBridgeInitialized";
  if (window[BRIDGE_FLAG]) {
    return;
  }
  window[BRIDGE_FLAG] = true;

  // Extracts only valid string-based identifiers from a w2ui column.
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

  // Removes functions from a record to ensure it's serializable.
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

  // Describes the current state of w2ui for error reporting.
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
  const sendSnapshotToContent = () => {
    const grid = window.w2ui?.translation_jobs_grid;
    if (!grid || !Array.isArray(grid.columns) || !Array.isArray(grid.records)) {
      return false;
    }
    const snapshot = {
      columns: grid.columns.map((column) => sanitizeColumnDescriptor(column)),
      records: grid.records.map((record) => sanitizeRecord(record)),
      gridSize: {
        columnCount: grid.columns.length,
        recordCount: grid.records.length,
      },
    };

    window.postMessage(
      {
        source: "work-timer-bridge",
        type: "RETURN_W2UI_DATA",
        payload: { snapshot },
      },
      "*"
    );

    return true;
  };

  const MAX_ATTEMPTS = 60;
  const ATTEMPT_DELAY_MS = 500;

  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      !event.data ||
      event.data.source !== "work-timer-content" ||
      event.data.type !== "REQUEST_W2UI_DATA"
    ) {
      return;
    }

    const attemptSendSnapshot = (attempt = 0) => {
      if (sendSnapshotToContent()) {
        return;
      }

      if (attempt >= MAX_ATTEMPTS) {
        window.postMessage(
          {
            source: "work-timer-bridge",
            type: "W2UI_DATA_ERROR",
            payload: {
              reason: "Grid not ready",
              state: describeCurrentState(),
            },
          },
          "*"
        );
        return;
      }

      setTimeout(() => attemptSendSnapshot(attempt + 1), ATTEMPT_DELAY_MS);
    };

    attemptSendSnapshot();
  });
})();
