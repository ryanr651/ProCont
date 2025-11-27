import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  className?: string;
  variant?: "purple" | "blue" | "gradient";
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showPercentage = true,
  className,
  variant = "gradient"
}: ProgressBarProps) {
  const percentage = Math.min((value / max) * 100, 100);

  const barVariants = {
    purple: "bg-primary",
    blue: "bg-secondary",
    gradient: "bg-gradient-to-r from-primary to-secondary"
  };

  return (
    <div className={cn("w-full", className)}>
      {(label || showPercentage) && (
        <div className="flex justify-between items-center mb-2">
          {label && (
            <span className="text-sm font-medium text-foreground">{label}</span>
          )}
          {showPercentage && (
            <span className="text-sm text-muted-foreground">
              {percentage.toFixed(1)}%
            </span>
          )}
        </div>
      )}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            barVariants[variant]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
