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
declare let timerStart: number | null;
declare let accumulatedDurationBeforeSessionMs: number;
declare let hasStoredDuration: boolean;
declare let hasAttachedLifecycleListeners: boolean;
declare let hasInitializedFromStorage: boolean;
declare let hasEverBeenStarted: boolean;
declare let isTimerCurrentlyPaused: boolean;
declare const getStoredDuration: () => Promise<number>;
declare const storeDuration: (duration: number) => void;
declare const getTotalDurationMs: () => number;
declare const setTotalDurationMs: (totalMs: number) => void;
declare const adjustDurationByMs: (deltaMs: number) => void;
declare const attachLifecycleListeners: () => void;
declare const detachLifecycleListeners: () => void;
declare const beginRunningTimer: () => void;
declare const pauseTimerInternal: () => void;
declare const resumeTimerInternal: () => Promise<void>;
declare const handlePageClose: () => void;
declare const stopTimerAndStore: () => void;
declare const startTimerInternal: () => Promise<void>;
declare const pauseTimer: () => void;
declare const resumeTimer: () => Promise<void>;
declare const isTimerRunning: () => boolean;
declare const isTimerPaused: () => boolean;
declare const ensureWorkTimerApi: () => void;
//# sourceMappingURL=timer.d.ts.map