interface ErrorDisplayProps {
  errors?: string[];
  warnings?: string[];
}

export function ErrorDisplay({ errors = [], warnings = [] }: ErrorDisplayProps) {
  if (errors.length === 0 && warnings.length === 0) return null;

  return (
    <div className="space-y-3">
      {errors.length > 0 && (
        <div className="rounded-lg border border-loss/30 bg-loss/5 p-4">
          <h3 className="text-sm font-medium text-loss mb-2">
            {errors.length} Error{errors.length !== 1 ? "s" : ""}
          </h3>
          <ul className="space-y-1">
            {errors.map((err, i) => (
              <li key={i} className="text-xs text-loss/80">
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
          <h3 className="text-sm font-medium text-yellow-400 mb-2">
            {warnings.length} Warning{warnings.length !== 1 ? "s" : ""}
          </h3>
          <ul className="space-y-1">
            {warnings.map((warn, i) => (
              <li key={i} className="text-xs text-yellow-400/80">
                {warn}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
