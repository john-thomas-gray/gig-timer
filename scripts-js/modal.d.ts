type ConfirmationModalOptions = {
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
};
type ModalElements = {
    overlay: HTMLDivElement;
    modal: HTMLDivElement;
    confirmButton: HTMLButtonElement;
    cancelButton: HTMLButtonElement;
};
declare const MODAL_STYLE_ID = "work-timer-modal-styles";
declare const ensureModalStyles: () => void;
declare let activeModal: ModalElements | null;
declare const closeActiveModal: () => void;
declare const showConfirmationModal: (options: ConfirmationModalOptions) => void;
type WorkTimerModalApi = {
    showConfirmation: (options: ConfirmationModalOptions) => void;
};
declare const modalWindow: Window & {
    workTimerModal?: WorkTimerModalApi;
};
//# sourceMappingURL=modal.d.ts.map