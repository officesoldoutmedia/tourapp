"use client";

/**
 * Wrapper minim doar pentru confirmarea nativă la ștergere — restul
 * paginii de categorii rămâne server-only (pattern groups/songs); acțiunea
 * `deleteCategory` e un Server Action trecut ca prop din page.tsx.
 */
export function DeleteCategoryForm({
  categoryId,
  action,
  confirmText,
  label,
}: {
  categoryId: string;
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
      <input type="hidden" name="id" value={categoryId} />
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
