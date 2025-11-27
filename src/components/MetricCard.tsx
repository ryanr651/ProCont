import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  className?: string;
  variant?: "default" | "highlight" | "accent";
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  className,
  variant = "default"
}: MetricCardProps) {
  const variantClasses = {
    default: "metric-card",
    highlight: "metric-card border-primary/50 shadow-[0_0_20px_hsl(262,100%,53%,0.2)]",
    accent: "metric-card border-secondary/50 shadow-[0_0_20px_hsl(192,100%,50%,0.2)]"
  };

  return (
    <div className={cn(variantClasses[variant], className)}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm text-muted-foreground font-medium">{title}</span>
        {Icon && (
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-display font-bold text-foreground">
          {typeof value === "number"
            ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            : value}
        </span>
        {trend && (
          <span
            className={cn(
              "text-sm font-medium mb-1",
              trend === "up" && "text-green-400",
              trend === "down" && "text-red-400",
              trend === "neutral" && "text-muted-foreground"
            )}
          >
            {trend === "up" && "↑"}
            {trend === "down" && "↓"}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>
      )}
    </div>
  );
}
