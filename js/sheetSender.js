"use strict";

require("dotenv").config();

const GOOGLE_SHEETS_SENDER_ENDPOINT = process.env.GOOGLE_SHEETS_SENDER_ENDPOINT;

const DINGUS_PAYLOAD = {
  "Project Title": "dingus",
  Runtime: "45",
};

const ensureEndpoint = (endpoint) => {
  if (!endpoint || typeof endpoint !== "string") {
    throw new Error(
      "Google Sheets endpoint is not defined. Check GOOGLE_SHEETS_SENDER_ENDPOINT in your .env."
    );
  }
  return endpoint;
};

const sendDingusToSheet = async (options = {}) => {
  const endpoint = ensureEndpoint(
    options.endpoint ?? GOOGLE_SHEETS_SENDER_ENDPOINT
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(DINGUS_PAYLOAD),
    keepalive: options.keepalive ?? true,
  });

  const responseText = await response.text().catch(() => "");

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}${
        responseText.length > 0 ? `: ${responseText}` : ""
      }`
    );
  }

  const trimmedResponse = responseText.trim();
  return trimmedResponse.length > 0 ? trimmedResponse : "OK";
};

const ensureSheetSender = () => {
  const api = window.workTimer ?? {};
  api.sendDingusToSheet = sendDingusToSheet;
  window.workTimer = api;
};

ensureSheetSender();

module.exports = {
  sendDingusToSheet,
};
