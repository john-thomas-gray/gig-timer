interface WorkTimerApi {
    startTimer: () => Promise<void>;
    stopTimer: () => void;
    pauseTimer: () => void;
    resumeTimer: () => Promise<void>;
    isTimerRunning: () => boolean;
    isTimerPaused: () => boolean;
    adjustDurationByMs: (deltaMs: number) => void;
    getTotalDurationMs: () => number;
}
interface Window {
    workTimer?: WorkTimerApi;
}
declare const FOCUS_LOSS_IDLE_THRESHOLD_MS: number;
declare const INACTIVITY_THRESHOLD_MS: number;
type IdleEvent = "focus-loss" | "inactivity";
declare let focusLossIdleTimeoutId: number | null;
declare let inactivityIdleTimeoutId: number | null;
declare let isIdleDueToFocusLoss: boolean;
declare let isIdleDueToInactivity: boolean;
declare let hasInitializedIdleHandlers: boolean;
declare const interactionEvents: Array<keyof DocumentEventMap>;
declare const getTimerApi: () => WorkTimerApi | undefined;
declare const logTimerPaused: () => void;
declare const clearTimeoutById: (timeoutId: number | null) => void;
declare const clearFocusLossIdleTimeout: () => void;
declare const clearInactivityIdleTimeout: () => void;
declare const tryResumeTimer: () => void;
declare const onIdleTriggered: (reason: IdleEvent) => void;
declare const startFocusLossIdleCountdown: () => void;
declare const resetInactivityIdleTimeout: () => void;
declare const handleWindowBlur: () => void;
declare const handleWindowFocus: () => void;
declare const handleUserInteraction: () => void;
declare const setupInactivityIdleTimer: () => void;
declare const initializeIdleHandlers: () => void;
//# sourceMappingURL=idle.d.ts.map