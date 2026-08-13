"use client";

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  text: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = "Löschen",
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="confirm"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
    >
      <h2 className="confirmTitle">{title}</h2>
      <p className="confirmText">{text}</p>
      <div className="confirmRow">
        <button className="btn" type="button" onClick={onCancel}>
          Abbrechen
        </button>
        <button className={`btn ${danger ? "btnDanger" : "btnPrimary"}`} type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
