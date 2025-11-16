"use strict";
const MODAL_STYLE_ID = "work-timer-modal-styles";
const ensureModalStyles = () => {
    if (document.getElementById(MODAL_STYLE_ID)) {
        return;
    }
    const style = document.createElement("style");
    style.id = MODAL_STYLE_ID;
    style.textContent = `
    .wt-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(17, 24, 39, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10_000;
    }

    .wt-modal {
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
      padding: 24px;
      max-width: 360px;
      width: calc(100% - 32px);
      font-family: inherit;
    }

    .wt-modal h2 {
      margin: 0 0 12px;
      font-size: 18px;
    }

    .wt-modal p {
      margin: 0 0 20px;
      line-height: 1.5;
    }

    .wt-modal-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    .wt-modal button {
      padding: 8px 16px;
      border-radius: 6px;
      border: none;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }

    .wt-modal button:focus {
      outline: 3px solid rgba(59, 130, 246, 0.6);
      outline-offset: 2px;
    }

    .wt-modal button[data-variant="cancel"] {
      background: #e5e7eb;
      color: #1f2933;
    }

    .wt-modal button[data-variant="cancel"]:hover {
      background: #d1d5db;
    }

    .wt-modal button[data-variant="confirm"] {
      background: #dc2626;
      color: #ffffff;
    }

    .wt-modal button[data-variant="confirm"]:hover {
      background: #b91c1c;
    }
  `;
    document.head.appendChild(style);
};
let activeModal = null;
const closeActiveModal = () => {
    if (!activeModal) {
        return;
    }
    activeModal.overlay.remove();
    activeModal = null;
};
const showConfirmationModal = (options) => {
    ensureModalStyles();
    closeActiveModal();
    const overlay = document.createElement("div");
    overlay.className = "wt-modal-overlay";
    overlay.setAttribute("role", "presentation");
    const modal = document.createElement("div");
    modal.className = "wt-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "wt-modal-heading");
    const heading = document.createElement("h2");
    heading.id = "wt-modal-heading";
    heading.textContent = "Confirm Deletion";
    const message = document.createElement("p");
    message.textContent = options.message;
    const buttonRow = document.createElement("div");
    buttonRow.className = "wt-modal-buttons";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = options.cancelText ?? "No";
    cancelButton.dataset.variant = "cancel";
    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.textContent = options.confirmText ?? "Yes";
    confirmButton.dataset.variant = "confirm";
    buttonRow.appendChild(cancelButton);
    buttonRow.appendChild(confirmButton);
    modal.appendChild(heading);
    modal.appendChild(message);
    modal.appendChild(buttonRow);
    overlay.appendChild(modal);
    const cleanup = () => {
        closeActiveModal();
    };
    cancelButton.addEventListener("click", () => {
        cleanup();
    });
    confirmButton.addEventListener("click", () => {
        cleanup();
        options.onConfirm();
    });
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            cleanup();
        }
    });
    overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            cleanup();
        }
    });
    document.body.appendChild(overlay);
    activeModal = {
        overlay,
        modal,
        confirmButton,
        cancelButton,
    };
    window.setTimeout(() => {
        cancelButton.focus();
    }, 0);
};
const modalWindow = window;
modalWindow.workTimerModal = {
    showConfirmation: showConfirmationModal,
};
//# sourceMappingURL=modal.js.map