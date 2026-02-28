import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Calculator, ChevronDown, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BalanceteClassifiedEntry } from "@/components/DashboardBalancete";
import type { PreviousPeriodBalancete } from "@/components/BalanceteHistoricoModal";

interface BalanceteComparativoProps {
  currentEntries: BalanceteClassifiedEntry[];
  currentPeriodo: string;
  previousPeriods: PreviousPeriodBalancete[];
}

interface ComparativeRow {
  conta: string;
  grupo: string;
  values: Record<string, { saldo: number; av: number }>; // keyed by year
  ah: number | null; // % variation current vs most recent previous
  avChange: number | null; // AV change between periods
}

function normalizeContaName(conta: string): string {
  return conta
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getGrupoBase(grupo: string): string {
  const g = grupo.toUpperCase();
  if (["DISPONIBILIDADES", "CAIXA", "BANCO", "CONTAS_A_RECEBER", "CLIENTES", "ESTOQUE", "ATIVO_CIRCULANTE", "APLICAC"].some(k => g.includes(k))) return "ATIVO";
  if (["ATIVO_NAO_CIRCULANTE", "IMOBILIZADO", "INTANGIVEL", "INVESTIMENTO", "REALIZAVEL"].some(k => g.includes(k))) return "ATIVO";
  if (["FORNECEDOR", "OBRIGAC", "PASSIVO_CIRCULANTE", "EMPRESTIMO_CP", "SALARIOS_A_PAGAR", "IMPOSTOS_A_PAGAR", "PROVISAO_CP"].some(k => g.includes(k))) return "PASSIVO";
  if (["PASSIVO_NAO_CIRCULANTE", "EMPRESTIMO_LP", "FINANCIAMENTO_LP", "PROVISAO_LP"].some(k => g.includes(k))) return "PASSIVO";
  if (["PATRIMONIO", "CAPITAL_SOCIAL", "RESERVA", "LUCROS_ACUMULADOS", "PREJUIZOS"].some(k => g.includes(k))) return "PL";
  if (["RECEITA", "DESPESA", "CUSTO", "RESULTADO"].some(k => g.includes(k))) return "RESULTADO";
  return "OUTROS";
}

function calculateAtivoTotal(entries: BalanceteClassifiedEntry[] | PreviousPeriodBalancete["entries"]): number {
  let total = 0;
  for (const e of entries) {
    const gb = getGrupoBase(e.grupo);
    if (gb === "ATIVO") total += Math.abs(e.saldo_atual);
  }
  return total || 1; // avoid division by zero
}

export function BalanceteComparativo({ currentEntries, currentPeriodo, previousPeriods }: BalanceteComparativoProps) {
  const [calcDetail, setCalcDetail] = useState<ComparativeRow | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    ATIVO: true,
    PASSIVO: true,
    PL: true,
    RESULTADO: false,
    OUTROS: false,
  });

  const currentYear = currentPeriodo?.split("/").pop() || currentPeriodo?.slice(0, 4) || "Atual";
  
  // Sort previous periods by year descending
  const sortedPrevious = useMemo(
    () => [...previousPeriods].sort((a, b) => Number(b.ano) - Number(a.ano)),
    [previousPeriods]
  );

  const allYears = useMemo(() => {
    const years = sortedPrevious.map(p => p.ano);
    years.push(currentYear);
    return years.sort();
  }, [sortedPrevious, currentYear]);

  const comparativeData = useMemo(() => {
    // Build a map: normalized conta name → row data
    const rowMap = new Map<string, ComparativeRow>();

    // AV bases per period
    const currentAtivoTotal = calculateAtivoTotal(currentEntries);
    const prevAtivoTotals: Record<string, number> = {};
    for (const p of sortedPrevious) {
      prevAtivoTotals[p.ano] = calculateAtivoTotal(p.entries as any);
    }

    // Process current entries
    for (const entry of currentEntries) {
      const key = normalizeContaName(entry.conta);
      const av = (Math.abs(entry.saldo_atual) / currentAtivoTotal) * 100;
      
      if (!rowMap.has(key)) {
        rowMap.set(key, {
          conta: entry.conta,
          grupo: entry.grupo,
          values: {},
          ah: null,
          avChange: null,
        });
      }
      const row = rowMap.get(key)!;
      row.values[currentYear] = { saldo: entry.saldo_atual, av };
    }

    // Process previous periods
    for (const period of sortedPrevious) {
      const base = prevAtivoTotals[period.ano];
      for (const entry of period.entries) {
        const key = normalizeContaName(entry.conta);
        const av = (Math.abs(entry.saldo_atual) / base) * 100;

        if (!rowMap.has(key)) {
          rowMap.set(key, {
            conta: entry.conta,
            grupo: entry.grupo,
            values: {},
            ah: null,
            avChange: null,
          });
        }
        const row = rowMap.get(key)!;
        row.values[period.ano] = { saldo: entry.saldo_atual, av };
      }
    }

    // Calculate AH (current vs most recent previous)
    const mostRecentPrev = sortedPrevious[0]?.ano;
    if (mostRecentPrev) {
      for (const row of rowMap.values()) {
        const current = row.values[currentYear];
        const previous = row.values[mostRecentPrev];
        if (current && previous && previous.saldo !== 0) {
          row.ah = ((current.saldo / previous.saldo) - 1) * 100;
          row.avChange = current.av - previous.av;
        }
      }
    }

    return Array.from(rowMap.values());
  }, [currentEntries, sortedPrevious, currentYear]);

  // Group rows by grupo base
  const groupedRows = useMemo(() => {
    const groups: Record<string, ComparativeRow[]> = {
      ATIVO: [],
      PASSIVO: [],
      PL: [],
      RESULTADO: [],
      OUTROS: [],
    };
    for (const row of comparativeData) {
      const gb = getGrupoBase(row.grupo);
      (groups[gb] || groups.OUTROS).push(row);
    }
    // Sort by absolute saldo descending within each group
    for (const g of Object.keys(groups)) {
      groups[g].sort((a, b) => {
        const aVal = Math.abs(a.values[currentYear]?.saldo || 0);
        const bVal = Math.abs(b.values[currentYear]?.saldo || 0);
        return bVal - aVal;
      });
    }
    return groups;
  }, [comparativeData, currentYear]);

  const groupLabels: Record<string, string> = {
    ATIVO: "Ativo",
    PASSIVO: "Passivo",
    PL: "Patrimônio Líquido",
    RESULTADO: "Resultado",
    OUTROS: "Outros",
  };

  const toggleGroup = (g: string) => {
    setExpandedGroups(prev => ({ ...prev, [g]: !prev[g] }));
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatPercent = (v: number | null) =>
    v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

  const getAHColor = (ah: number | null) => {
    if (ah === null) return "";
    if (ah > 10) return "text-green-500";
    if (ah < -10) return "text-red-500";
    return "text-muted-foreground";
  };

  const getAHIcon = (ah: number | null) => {
    if (ah === null) return <Minus className="w-3 h-3" />;
    if (ah > 0) return <TrendingUp className="w-3 h-3" />;
    if (ah < 0) return <TrendingDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  const isAVSignificant = (avChange: number | null) =>
    avChange !== null && Math.abs(avChange) >= 5;

  return (
    <>
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 font-semibold text-foreground sticky left-0 bg-muted/30 min-w-[200px]">
                  Conta
                </th>
                {allYears.map(year => (
                  <th key={`saldo-${year}`} className="text-right py-3 px-3 font-semibold text-foreground min-w-[120px]">
                    Saldo {year}
                  </th>
                ))}
                {allYears.map(year => (
                  <th key={`av-${year}`} className="text-right py-3 px-3 font-semibold text-primary min-w-[80px]">
                    AV% {year}
                  </th>
                ))}
                {sortedPrevious.length > 0 && (
                  <th className="text-right py-3 px-3 font-semibold text-accent-foreground min-w-[100px]">
                    AH% (Variação)
                  </th>
                )}
              </tr>
            </thead>
            {Object.entries(groupedRows).map(([groupKey, rows]) => {
              if (rows.length === 0) return null;
              const isExpanded = expandedGroups[groupKey];
              return (
                <tbody key={groupKey}>
                    {/* Group Header */}
                    <tr
                      className="bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
                      onClick={() => toggleGroup(groupKey)}
                    >
                      <td
                        colSpan={allYears.length * 2 + (sortedPrevious.length > 0 ? 1 : 0)}
                        className="py-2 px-4 font-bold text-foreground"
                      >
                        <span className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {groupLabels[groupKey]} ({rows.length} contas)
                        </span>
                      </td>
                    </tr>
                    {/* Rows */}
                    {isExpanded && rows.map((row, idx) => {
                      const hasSignificantAV = isAVSignificant(row.avChange);
                      return (
                        <tr
                          key={idx}
                          className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${
                            hasSignificantAV ? "bg-yellow-500/5" : ""
                          }`}
                        >
                          <td className="py-2 px-4 text-foreground font-medium sticky left-0 bg-background truncate max-w-[250px]" title={row.conta}>
                            {row.conta}
                            {hasSignificantAV && (
                              <span className="ml-1 text-xs text-yellow-500" title="Mudança de representatividade > 5%">⚠</span>
                            )}
                          </td>
                          {allYears.map(year => (
                            <td key={`saldo-${year}`} className="text-right py-2 px-3 text-foreground tabular-nums">
                              {row.values[year] ? formatCurrency(row.values[year].saldo) : "—"}
                            </td>
                          ))}
                          {allYears.map(year => (
                            <td key={`av-${year}`} className="text-right py-2 px-3 text-primary/80 tabular-nums text-xs">
                              {row.values[year] ? `${row.values[year].av.toFixed(1)}%` : "—"}
                            </td>
                          ))}
                          {sortedPrevious.length > 0 && (
                            <td className={`text-right py-2 px-3 tabular-nums font-medium ${getAHColor(row.ah)}`}>
                              <span
                                className="inline-flex items-center gap-1 cursor-pointer hover:underline"
                                onClick={() => setCalcDetail(row)}
                                title="Ver cálculo"
                              >
                                {getAHIcon(row.ah)}
                                {formatPercent(row.ah)}
                                <Calculator className="w-3 h-3 opacity-40" />
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                </tbody>
              );
            })}
          </table>
        </div>
      </div>

      {/* Calculation Detail Dialog */}
      <Dialog open={!!calcDetail} onOpenChange={() => setCalcDetail(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-primary" />
              Cálculo da Análise Horizontal
            </DialogTitle>
          </DialogHeader>
          {calcDetail && (
            <div className="space-y-4 py-2">
              <div className="text-sm font-medium text-foreground">{calcDetail.conta}</div>
              
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="text-xs text-muted-foreground font-mono">
                  <strong>Fórmula:</strong> ((Valor Atual ÷ Valor Anterior) − 1) × 100
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Valor Atual ({currentYear}):</span>
                    <div className="font-bold text-foreground">
                      {calcDetail.values[currentYear]
                        ? formatCurrency(calcDetail.values[currentYear].saldo)
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor Anterior ({sortedPrevious[0]?.ano}):</span>
                    <div className="font-bold text-foreground">
                      {calcDetail.values[sortedPrevious[0]?.ano]
                        ? formatCurrency(calcDetail.values[sortedPrevious[0].ano].saldo)
                        : "—"}
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-3">
                  <span className="text-muted-foreground text-sm">Resultado AH:</span>
                  <div className={`text-xl font-bold ${getAHColor(calcDetail.ah)}`}>
                    {formatPercent(calcDetail.ah)}
                  </div>
                </div>

                {calcDetail.avChange !== null && (
                  <div className="border-t border-border pt-3">
                    <span className="text-muted-foreground text-sm">Mudança na AV:</span>
                    <div className={`text-sm font-medium ${
                      Math.abs(calcDetail.avChange) >= 5 ? "text-yellow-500" : "text-muted-foreground"
                    }`}>
                      {calcDetail.values[sortedPrevious[0]?.ano]?.av.toFixed(1)}% →{" "}
                      {calcDetail.values[currentYear]?.av.toFixed(1)}%{" "}
                      ({calcDetail.avChange >= 0 ? "+" : ""}{calcDetail.avChange.toFixed(1)}pp)
                      {Math.abs(calcDetail.avChange) >= 5 && " ⚠ Mudança significativa"}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
