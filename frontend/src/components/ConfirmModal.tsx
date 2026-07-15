import { AlertTriangle } from "lucide-react";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="rounded-full bg-danger/10 p-2 text-danger">
            <AlertTriangle size={20} />
          </span>
          <h2 className="text-lg font-semibold text-text">{title}</h2>
        </div>
        <p className="text-sm leading-6 text-text-muted">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded-input border border-border px-4 py-2 text-sm font-medium text-text-muted hover:text-text"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="rounded-input bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90"
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
