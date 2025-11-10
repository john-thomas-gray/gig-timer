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
declare const getStoredDuration: () => Promise<number>;
declare const storeDuration: (duration: number) => void;
declare function handlePageClose(): void;
declare function stopTimerAndStore(): void;
declare function startTimerInternal(): Promise<void>;
declare const ensureWorkTimerApi: () => void;
//# sourceMappingURL=timer.d.ts.map