"use strict";

(() => {
  // Prevent running the bridge multiple times
  const BRIDGE_FLAG = "__workTimerBridgeInitialized";
  if (window[BRIDGE_FLAG]) return;
  window[BRIDGE_FLAG] = true;

  // Store a reference to the message listener for cleanup
  let messageListener = null;

  // Extracts only valid string-based identifiers from a w2ui column
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

  // Removes functions from a record to ensure it's serializable
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

  const MAX_ATTEMPTS = 1;
  const ATTEMPT_DELAY_MS = 500;

  // Define the listener once
  messageListener = (event) => {
    if (
      event.data.source !== "assignments.js" ||
      event.data.type !== "REQUEST_W2UI_DATA"
    ) {
      // ignore other messages
      return;
    }

    const attemptSendSnapshot = (attempt = 0) => {
      const grid = window.w2ui?.translation_jobs_grid;
      if (
        !grid ||
        !Array.isArray(grid.columns) ||
        !Array.isArray(grid.records)
      ) {
        if (attempt >= MAX_ATTEMPTS) {
          window.postMessage(
            {
              source: "bridge.js",
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
        return;
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
          source: "bridge.js",
          type: "RETURN_W2UI_DATA",
          payload: { snapshot },
        },
        "*"
      );
    };

    attemptSendSnapshot();
  };

  window.addEventListener("message", messageListener);

  window.addEventListener("beforeunload", () => {
    if (messageListener) {
      window.removeEventListener("message", messageListener);
      messageListener = null;
    }
  });

  let lastUrl = location.href;
  const checkUrlChange = () => {
    if (location.href !== lastUrl) {
      if (messageListener) {
        window.removeEventListener("message", messageListener);
        messageListener = null;
      }
      lastUrl = location.href;
    }
  };
  setInterval(checkUrlChange, 500);
})();
