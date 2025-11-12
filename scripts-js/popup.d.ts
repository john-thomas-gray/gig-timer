declare const POPUP_GOOGLE_APPS_SCRIPT_ENDPOINT = "https://script.google.com/macros/s/AKfycbwKRKegGwQLUNs0ANSTfz7_L-944XcWJgtJxIUTUSnLV9liUD1AXxGPVmdHCVWqNs2A/exec";
type StoredSummary = {
    projectTitle: string | null;
    durationMs: number;
};
type WorkSummaryPayload = {
    "Project Title": string;
    "Work Time": string;
};
declare const popupStatusElement: HTMLElement | null;
declare const popupSubmitButton: HTMLButtonElement | null;
declare const popupResetButton: HTMLButtonElement | null;
declare const popupProjectTitleElement: HTMLElement | null;
declare const popupWorkTimeElement: HTMLElement | null;
declare const formatDurationForSheetValue: (durationMs: number) => string;
declare const setPopupStatus: (message: string, isError?: boolean) => void;
declare const clearPopupStatus: () => void;
declare const getStoredSummary: () => Promise<StoredSummary>;
declare const resetStoredDuration: () => Promise<void>;
declare const buildWorkSummaryPayload: (summary: StoredSummary) => WorkSummaryPayload | null;
declare const sendSummaryToSheet: (payload: WorkSummaryPayload) => Promise<string>;
declare const updatePreview: (summary: StoredSummary) => void;
declare const handleSubmit: () => Promise<void>;
declare const handleReset: () => Promise<void>;
declare const initializePopup: () => Promise<void>;
//# sourceMappingURL=popup.d.ts.map