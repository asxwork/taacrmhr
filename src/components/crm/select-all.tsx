"use client";

/** Header checkbox that toggles every `ids` checkbox in the same form. */
export function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      className="accent-navy-900"
      onChange={(e) => {
        e.currentTarget.form?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((cb) => (cb.checked = e.currentTarget.checked));
      }}
    />
  );
}
