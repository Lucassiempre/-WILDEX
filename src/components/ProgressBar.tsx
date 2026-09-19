type ProgressBarProps = {
  value: number;
  label?: string;
};

export function ProgressBar({ value, label }: ProgressBarProps) {
  return (
    <div className="space-y-2">
      {label ? <div className="text-sm font-medium text-forest/75">{label}</div> : null}
      <div className="h-3 overflow-hidden rounded-full bg-moss/35">
        <div
          className="h-full rounded-full bg-gradient-to-r from-canopy via-forest to-gold transition-all duration-700"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
