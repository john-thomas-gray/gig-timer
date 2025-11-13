interface WorkTimerApi {
    startTimer: () => Promise<void>;
    stopTimer: () => void;
}
interface Window {
    workTimer?: WorkTimerApi;
}
declare let timerStart: number | null;
declare let hasStoredDuration: boolean;
declare let logIntervalId: number | null;
declare let accumulatedDurationBeforeSessionMs: number;
declare let activeProjectTitle: string | null;
declare const TIMER_PROJECT_DURATIONS_KEY = "projectDurations";
declare const normalizeProjectTitle: (value: unknown) => string | null;
declare const normalizeTimerDurationMap: (raw: unknown) => Record<string, number>;
declare const getStoredDuration: () => Promise<number>;
declare const storeDuration: (duration: number) => void;
declare function handlePageClose(): void;
declare function stopTimerAndStore(): void;
declare function startTimerInternal(): Promise<void>;
declare const ensureWorkTimerApi: () => void;
//# sourceMappingURL=timer.d.ts.map