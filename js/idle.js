"use strict";

/* Add an overlay that visualizes the idle state and the status of each timer */
const FOCUS_LOSS_IDLE_THRESHOLD_MS = 3 * 1_000;
const INACTIVITY_THRESHOLD_MS = 3 * 1_000;
let focusLossIdleTimeoutId = null;
let inactivityIdleTimeoutId = null;
let isIdleDueToFocusLoss = false;
let isIdleDueToInactivity = false;
let hasInitializedIdleHandlers = false;
const interactionEvents = ["mousemove", "keydown", "scroll", "click"];
const getTimerApi = () => window.workTimer;
const logTimerPaused = () => {
  console.log(`Timer Paused at ${new Date().toISOString()}`);
};
const clearTimeoutById = (timeoutId) => {
  if (timeoutId !== null) {
    window.clearTimeout(timeoutId);
  }
};
const clearFocusLossIdleTimeout = () => {
  clearTimeoutById(focusLossIdleTimeoutId);
  focusLossIdleTimeoutId = null;
};
const clearInactivityIdleTimeout = () => {
  clearTimeoutById(inactivityIdleTimeoutId);
  inactivityIdleTimeoutId = null;
};
const tryResumeTimer = () => {
  const timerApi = getTimerApi();
  if (!timerApi) {
    return;
  }
  if (isIdleDueToFocusLoss || isIdleDueToInactivity) {
    return;
  }
  if (!timerApi.isTimerPaused()) {
    return;
  }
  void timerApi.resumeTimer();
};
const onIdleTriggered = (reason) => {
  const timerApi = getTimerApi();
  if (!timerApi) {
    return;
  }
  if (!timerApi.isTimerRunning() && !timerApi.isTimerPaused()) {
    return;
  }
  if (reason === "focus-loss") {
    isIdleDueToFocusLoss = true;
    if (timerApi.isTimerRunning()) {
      timerApi.pauseTimer();
    }
    timerApi.adjustDurationByMs(-FOCUS_LOSS_IDLE_THRESHOLD_MS);
    logTimerPaused();
    return;
  }
  if (isIdleDueToFocusLoss || isIdleDueToInactivity) {
    return;
  }
  if (timerApi.isTimerRunning()) {
    timerApi.pauseTimer();
  }
  timerApi.adjustDurationByMs(-INACTIVITY_THRESHOLD_MS);
  isIdleDueToInactivity = true;
  logTimerPaused();
};
const startFocusLossIdleCountdown = () => {
  clearFocusLossIdleTimeout();
  focusLossIdleTimeoutId = window.setTimeout(() => {
    onIdleTriggered("focus-loss");
  }, FOCUS_LOSS_IDLE_THRESHOLD_MS);
};
const resetInactivityIdleTimeout = () => {
  clearInactivityIdleTimeout();
  inactivityIdleTimeoutId = window.setTimeout(() => {
    if (isIdleDueToFocusLoss) {
      return;
    }
    onIdleTriggered("inactivity");
  }, INACTIVITY_THRESHOLD_MS);
};
const handleWindowBlur = () => {
  isIdleDueToFocusLoss = false;
  startFocusLossIdleCountdown();
  clearInactivityIdleTimeout();
};
const handleWindowFocus = () => {
  clearFocusLossIdleTimeout();
  resetInactivityIdleTimeout();
  isIdleDueToFocusLoss = false;
  tryResumeTimer();
};
const handleUserInteraction = () => {
  const timerApi = getTimerApi();
  if (isIdleDueToInactivity) {
    if (document.hasFocus()) {
      isIdleDueToInactivity = false;
      tryResumeTimer();
    }
  }
  if (!timerApi) {
    resetInactivityIdleTimeout();
    return;
  }
  if (!timerApi.isTimerRunning() && !timerApi.isTimerPaused()) {
    resetInactivityIdleTimeout();
    return;
  }
  resetInactivityIdleTimeout();
};
const setupInactivityIdleTimer = () => {
  interactionEvents.forEach((eventName) => {
    document.addEventListener(eventName, handleUserInteraction, {
      passive: true,
    });
  });
  resetInactivityIdleTimeout();
};
const initializeIdleHandlers = () => {
  if (hasInitializedIdleHandlers) {
    return;
  }
  hasInitializedIdleHandlers = true;
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("focus", handleWindowFocus);
  setupInactivityIdleTimer();
  if (!document.hasFocus()) {
    handleWindowBlur();
  } else {
    resetInactivityIdleTimeout();
  }
};
initializeIdleHandlers();
