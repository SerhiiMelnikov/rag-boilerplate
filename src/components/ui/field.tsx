import { useId } from "react";

// A render prop rather than `children: ReactNode`: the label, description and
// error have to reach the control as `htmlFor`, `aria-describedby` and
// `aria-invalid`, and the only alternatives are cloneElement (fragile) or making
// every call site invent its own ids (which is how they get forgotten).
export function Field({
  label,
  description,
  error,
  required = false,
  children,
}: {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: (control: {
    id: string;
    required: boolean;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
  }) => React.ReactNode;
}) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-ink-muted">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        )}
      </label>
      {description && (
        <p id={descriptionId} className="text-xs text-ink-subtle">
          {description}
        </p>
      )}
      {children({
        id,
        required,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
