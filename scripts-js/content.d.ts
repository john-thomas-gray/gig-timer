type ContentScriptDefinition = {
    matches?: string[];
};
type ManifestWithOptionalMatches = {
    content_scripts?: ContentScriptDefinition | ContentScriptDefinition[];
};
declare const manifest: ManifestWithOptionalMatches | undefined;
declare const manifestMatches: string[];
declare const doesUrlMatchPattern: (url: string, pattern: string) => boolean;
declare const convertMatchPatternToRegExp: (pattern: string) => RegExp | null;
declare const escapeRegex: (value: string) => string;
declare const getStoredMatches: () => Promise<string[]>;
declare const currentUrl: string;
declare const evaluateMatches: (patterns: string[]) => void;
declare const initialize: () => Promise<void>;
//# sourceMappingURL=content.d.ts.map