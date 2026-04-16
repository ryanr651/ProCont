import { useState } from "react";
import { cn } from "@/lib/utils";
import { LucideIcon, Info, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AccountDetail {
  descricao: string;
  valor: number;
  motivo?: string;
  isSynthetic?: boolean;
  isRedutora?: boolean;
}

export interface IndicatorConfig {
  title: string;
  value: number;
  format: "currency" | "percentage" | "ratio";
  icon: LucideIcon;
  formula: string;
  formulaDescription: string;
  accounts: AccountDetail[];
  variant?: "default" | "highlight" | "accent" | "success" | "warning" | "danger";
  trend?: "up" | "down" | "neutral";
  subtitle?: string;
  visible?: boolean;
}

function formatValue(value: number, format: "currency" | "percentage" | "ratio"): string {
  if (format === "currency") {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (format === "percentage") {
    return `${value.toFixed(2)}%`;
  }
  return value.toFixed(2);
}

function getVariantClasses(variant: string): string {
  const variants: Record<string, string> = {
    default: "border-border/50",
    highlight: "border-primary/50 shadow-[0_0_20px_hsl(var(--primary)/0.15)]",
    accent: "border-secondary/50 shadow-[0_0_20px_hsl(var(--secondary)/0.15)]",
    success: "border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]",
    warning: "border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)]",
    danger: "border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]",
  };
  return variants[variant] || variants.default;
}

function getIconBg(variant: string): string {
  const bgs: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    highlight: "bg-primary/15 text-primary",
    accent: "bg-secondary/15 text-secondary",
    success: "bg-emerald-500/15 text-emerald-500",
    warning: "bg-amber-500/15 text-amber-500",
    danger: "bg-red-500/15 text-red-500",
  };
  return bgs[variant] || bgs.default;
}

function getTrendColor(trend?: string): string {
  if (trend === "up") return "text-emerald-400";
  if (trend === "down") return "text-red-400";
  return "text-muted-foreground";
}

export function IndicatorCard({ config }: { config: IndicatorConfig }) {
  const [showDrilldown, setShowDrilldown] = useState(false);
  const { title, value, format, icon: Icon, variant = "default", trend, subtitle } = config;

  if (config.visible === false) return null;

  return (
    <>
      <div
        className={cn(
          "glass-card p-5 transition-all duration-300 hover:scale-[1.02] group relative",
          getVariantClasses(variant)
        )}
        style={{ background: "var(--gradient-card)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <span className="text-sm text-muted-foreground font-medium leading-tight">{title}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowDrilldown(true)}
              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Ver cálculo"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            <div className={cn("p-2 rounded-lg", getIconBg(variant))}>
              <Icon className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Value */}
        <div className="flex items-end gap-2">
          <span
            className={cn(
              "text-2xl font-display font-bold",
              value < 0 ? "text-red-500" : "text-foreground"
            )}
          >
            {formatValue(value, format)}
          </span>
          {trend && value >= 0 && (
            <span className={cn("text-sm font-medium mb-1", getTrendColor(trend))}>
              {trend === "up" && "↑"}
              {trend === "down" && "↓"}
            </span>
          )}
          {value < 0 && (
            <span className="text-sm font-medium mb-1 text-red-500">↓</span>
          )}
        </div>


        {subtitle && (
          <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>
        )}

        {/* Sparkle indicator for AI classification */}
        {config.accounts.some(a => a.motivo?.includes("IA")) && (
          <div className="absolute bottom-2 right-2">
            <Sparkles className="w-3 h-3 text-primary/40" />
          </div>
        )}
      </div>

      {/* Drill-down Modal */}
      {showDrilldown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowDrilldown(false)}>
          <div
            className="glass-card w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-border/50">
              <div>
                <h3 className="font-display font-bold text-lg text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground mt-1">Memória de Cálculo</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowDrilldown(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Formula */}
            <div className="p-5 border-b border-border/50 bg-muted/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Fórmula</p>
              <p className="font-mono text-sm text-primary font-medium">{config.formula}</p>
              <p className="text-xs text-muted-foreground mt-2">{config.formulaDescription}</p>
            </div>

            {/* Result */}
            <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Resultado</span>
              <span className="text-lg font-display font-bold text-primary">
                {formatValue(value, format)}
              </span>
            </div>

            {/* Accounts */}
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                Contas utilizadas ({config.accounts.filter(a => !a.isSynthetic).length})
                {config.accounts.some(a => a.isSynthetic) && (
                  <span className="ml-2 text-amber-500/80">
                    + {config.accounts.filter(a => a.isSynthetic).length} totalizadores
                  </span>
                )}
              </p>
              {config.accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Nenhuma conta individual encontrada para este indicador.</p>
              ) : (
                <div className="space-y-2">
                  {/* Show analytic accounts first */}
                  {config.accounts
                    .filter(a => !a.isSynthetic)
                    .map((account, i) => (
                    <div
                      key={`a-${i}`}
                      className={cn(
                        "flex items-start justify-between p-3 rounded-lg border transition-colors",
                        account.isRedutora
                          ? "bg-red-500/5 border-red-500/20 hover:bg-red-500/10"
                          : "bg-muted/30 border-border/30 hover:bg-muted/50"
                      )}
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm text-foreground truncate flex items-center gap-1.5" title={account.descricao}>
                          {account.isRedutora && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-medium shrink-0">
                              REDUTORA
                            </span>
                          )}
                          {account.descricao}
                        </p>
                        {account.motivo && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            {account.motivo.includes("IA") && <Sparkles className="w-3 h-3 text-primary/60 inline shrink-0" />}
                            <span className="truncate">{account.motivo}</span>
                          </p>
                        )}
                      </div>
                      <span className={cn(
                        "text-sm font-mono font-medium whitespace-nowrap",
                        account.isRedutora ? "text-red-400" : account.valor >= 0 ? "text-emerald-400" : "text-red-400"
                      )}>
                        {account.isRedutora
                          ? `(${Math.abs(account.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`
                          : account.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        }
                      </span>
                    </div>
                  ))}
                  
                  {/* Show synthetic (totals) entries with label, dimmed */}
                  {config.accounts.filter(a => a.isSynthetic).length > 0 && (
                    <>
                      <div className="mt-4 mb-2 flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/50" />
                        <span className="text-xs text-amber-500/80 font-medium uppercase tracking-wider">
                          Totalizadores de Grupo (não somados)
                        </span>
                        <div className="h-px flex-1 bg-border/50" />
                      </div>
                      {config.accounts
                        .filter(a => a.isSynthetic)
                        .map((account, i) => (
                        <div
                          key={`s-${i}`}
                          className="flex items-start justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 opacity-60"
                        >
                          <div className="flex-1 min-w-0 mr-3">
                            <p className="text-sm text-foreground truncate flex items-center gap-1.5" title={account.descricao}>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 font-medium shrink-0">
                                SINTÉTICA
                              </span>
                              {account.descricao}
                            </p>
                            {account.motivo && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{account.motivo}</p>
                            )}
                          </div>
                          <span className="text-sm font-mono font-medium whitespace-nowrap text-muted-foreground">
                            {account.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function IndicatorSection({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-10", className)}>
      <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-3">
        <Icon className="w-6 h-6 text-primary" />
        {title}
      </h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {children}
      </div>
    </section>
  );
}
