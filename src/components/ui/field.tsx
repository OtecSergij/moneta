import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  const errorId = `${htmlFor}-error`;
  const control =
    error && isValidElement(children)
      ? cloneElement(
          children as ReactElement<{ "aria-describedby"?: string }>,
          { "aria-describedby": errorId }
        )
      : children;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text">
        {label}
      </label>
      {control}
      {error ? (
        <p id={errorId} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
