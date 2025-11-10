type AdditionalFieldName = "projectTitle" | "client" | "studio" | "genre" | "subtitles" | "runtime" | "rate" | "dateBooked";
type StoredOptions = {
    matchesUrl: string;
} & Record<AdditionalFieldName, string>;
type StorageResult = Partial<Record<keyof StoredOptions, unknown>>;
type AdditionalFieldConfig = {
    id: string;
    label: string;
    name: AdditionalFieldName;
    type?: string;
    placeholder?: string;
    required?: boolean;
    defaultValue?: string;
    getDefaultValue?: () => string;
};
declare const savedUrlElement: HTMLElement | null;
declare const inputElement: HTMLInputElement | null;
declare const formElement: HTMLElement | null;
declare const statusElement: HTMLElement | null;
declare const getCurrentMonthYear: () => string;
declare const additionalFieldConfigs: AdditionalFieldConfig[];
declare const additionalInputs: Partial<Record<AdditionalFieldName, HTMLInputElement>>;
declare const getDefaultValueForConfig: (config: AdditionalFieldConfig) => string;
declare const createDefaultStoredOptions: () => StoredOptions;
declare const normalizeStoredOption: <Key extends keyof StoredOptions>(storageResult: StorageResult, key: Key, fallback: StoredOptions[Key]) => StoredOptions[Key];
declare const displaySavedUrl: (storedValues: Partial<StoredOptions>) => void;
declare const reportStatus: (message: string) => void;
declare const clearStatus: () => void;
declare const fillFormFields: (storedValues: StoredOptions) => void;
declare const loadSavedOptions: () => void;
declare const collectFormValues: () => StoredOptions;
declare const saveOptions: (values: StoredOptions) => void;
//# sourceMappingURL=options.d.ts.map