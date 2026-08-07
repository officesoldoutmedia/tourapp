"use client";

/**
 * Wrapper minim doar pentru confirmarea nativă la ștergere (pattern
 * DeleteCategoryForm din file-categories) — restul paginii de entități
 * emitente rămâne server-only; `deleteEntity` e un Server Action trecut
 * ca prop din page.tsx.
 */
export function DeleteEntityForm({
  entityId,
  action,
  confirmText,
  label,
}: {
  entityId: string;
  action: (formData: FormData) => void;
  confirmText: string;
  label: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={entityId} />
      <button
        title={label}
        aria-label={label}
        className="rounded px-2 py-1 text-xs text-danger hover:bg-danger-subtle"
      >
        🗑
      </button>
    </form>
  );
}
