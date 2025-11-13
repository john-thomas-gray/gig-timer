declare const POPUP_GOOGLE_APPS_SCRIPT_ENDPOINT = "https://script.google.com/macros/s/AKfycbwKRKegGwQLUNs0ANSTfz7_L-944XcWJgtJxIUTUSnLV9liUD1AXxGPVmdHCVWqNs2A/exec";
type PopupAdditionalFieldName = "client" | "studio" | "genre" | "season" | "subtitles" | "runtime" | "rate" | "dateBooked";
type PopupDatasetFieldKey = "matchesUrl" | PopupAdditionalFieldName;
type StoredSummary = {
    projectTitle: string | null;
    durationMs: number;
    fields: Partial<Record<PopupDatasetFieldKey, string>>;
};
type WorkSummaryPayload = {
    "Project Title": string;
    "Work Time": string;
};
declare const POPUP_PROJECT_DURATIONS_KEY = "projectDurations";
declare const POPUP_DATASET_FIELD_NAMES: PopupDatasetFieldKey[];
declare const datasetFieldElements: Partial<Record<PopupDatasetFieldKey, HTMLElement | null>>;
type PopupStorageChangeMap = Record<string, {
    newValue?: unknown;
    oldValue?: unknown;
}>;
declare const popupStatusElement: HTMLElement | null;
declare const popupSubmitButton: HTMLButtonElement | null;
declare const popupResetButton: HTMLButtonElement | null;
declare const popupProjectTitleElement: HTMLElement | null;
declare const popupWorkTimeElement: HTMLElement | null;
declare let currentSummary: StoredSummary;
declare let hasAttachedStorageChangeListener: boolean;
declare const normalizePopupDurationMap: (raw: unknown) => Record<string, number>;
declare const sanitizePopupFieldValue: (value: unknown) => string;
declare const formatDurationForSheetValue: (durationMs: number) => string;
declare const setPopupStatus: (message: string, isError?: boolean) => void;
declare const clearPopupStatus: () => void;
declare const getStoredSummary: () => Promise<StoredSummary>;
declare const resetStoredDuration: () => Promise<void>;
declare const buildWorkSummaryPayload: (summary: StoredSummary) => WorkSummaryPayload | null;
declare const sendSummaryToSheet: (payload: WorkSummaryPayload) => Promise<string>;
declare const updatePreview: (summary: StoredSummary) => void;
declare const handleStorageChange: (changes: PopupStorageChangeMap, areaName: string) => void;
type PopupStorageOnChanged = {
    addListener?: (callback: (changes: PopupStorageChangeMap, areaName: string) => void) => void;
    removeListener?: (callback: (changes: PopupStorageChangeMap, areaName: string) => void) => void;
};
declare const getStorageOnChanged: () => PopupStorageOnChanged | undefined;
declare const detachStorageChangeListener: () => void;
declare const attachStorageChangeListener: () => void;
declare const handleSubmit: () => Promise<void>;
declare const handleReset: () => Promise<void>;
declare const initializePopup: () => Promise<void>;
//# sourceMappingURL=popup.d.ts.map