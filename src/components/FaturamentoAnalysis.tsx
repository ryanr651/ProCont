import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Target, Trophy, AlertTriangle,
  BarChart3, Activity,
} from "lucide-react";

export interface FaturamentoRow {
  mes: string;
  ano: number;
  saidas: number;
  servicos: number;
  outros: number;
  total: number;
}

interface Props {
  data: FaturamentoRow[];
}

const MESES_ORDEM = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

// Máscara monetária brasileira
function applyMoneyMask(raw: string): string {
  // Remove tudo que não for dígito ou vírgula
  let value = raw.replace(/[^\d,]/g, "");

  // Garante no máximo uma vírgula
  const parts = value.split(",");
  if (parts.length > 2) {
    value = parts[0] + "," + parts.slice(1).join("");
  }

  // Limita casas decimais a 2
  if (parts[1] !== undefined) {
    value = parts[0] + "," + parts[1].slice(0, 2);
  }

  // Formata a parte inteira com pontos de milhar
  const intPart = parts[0]?.replace(/\B(?=(\d{3})+(?!\d))/g, ".") || "";
  const decPart = parts[1] !== undefined ? "," + parts[1].slice(0, 2) : "";

  if (!intPart && !decPart) return "";
  return "R$ " + intPart + decPart;
}

function parseMaskedValue(masked: string): number {
  const clean = masked
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  return parseFloat(clean) || 0;
}


const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))"];
const MEDAL_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

export function FaturamentoAnalysis({ data }: Props) {
  const [metaAnual, setMetaAnual] = useState("");

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => MESES_ORDEM.indexOf(a.mes) - MESES_ORDEM.indexOf(b.mes));
  }, [data]);

  // ====== BLOCO 1: Indicadores ======
  const totalAnual = sorted.reduce((s, r) => s + r.total, 0);
  const media = totalAnual / (sorted.length || 1);
  const maiorMes = sorted.reduce((a, b) => (b.total > a.total ? b : a), sorted[0]);
  const menorMes = sorted.reduce((a, b) => (b.total < a.total ? b : a), sorted[0]);
  const variacaoAbs = maiorMes.total - menorMes.total;
  const variacaoPct = menorMes.total > 0 ? (variacaoAbs / menorMes.total) * 100 : 0;

  // ====== BLOCO 2: Tendência ======
  const variacaoMensal = sorted.map((r, i) => {
    const prev = i > 0 ? sorted[i - 1].total : null;
    const pct = prev && prev > 0 ? ((r.total - prev) / prev) * 100 : 0;
    return { mes: r.mes.substring(0, 3), total: r.total, variacao: i === 0 ? 0 : pct };
  });

  const trimestres = [
    { label: "Q1", meses: sorted.filter((_, i) => i < 3) },
    { label: "Q2", meses: sorted.filter((_, i) => i >= 3 && i < 6) },
    { label: "Q3", meses: sorted.filter((_, i) => i >= 6 && i < 9) },
    { label: "Q4", meses: sorted.filter((_, i) => i >= 9 && i < 12) },
  ].map(q => ({ ...q, total: q.meses.reduce((s, r) => s + r.total, 0) }));

  const melhorTri = trimestres.reduce((a, b) => (b.total > a.total ? b : a));
  const piorTri = trimestres.reduce((a, b) => (b.total < a.total ? b : a));

  const sem1 = sorted.filter((_, i) => i < 6).reduce((s, r) => s + r.total, 0);
  const sem2 = sorted.filter((_, i) => i >= 6).reduce((s, r) => s + r.total, 0);
  const semDiff = sem2 - sem1;
  const semPct = sem1 > 0 ? (semDiff / sem1) * 100 : 0;

  // ====== BLOCO 3: Consistência ======
  const totais = sorted.map(r => r.total);
  const desvioPadrao = Math.sqrt(totais.reduce((s, t) => s + Math.pow(t - media, 2), 0) / totais.length);
  const cv = media > 0 ? (desvioPadrao / media) * 100 : 0;
  const cvLabel = cv < 15 ? "Faturamento estável ✅" : cv <= 30 ? "Faturamento moderadamente variável ⚠️" : "Faturamento instável ❌";
  const acimaDaMedia = sorted.filter(r => r.total >= media);
  const abaixoDaMedia = sorted.filter(r => r.total < media);

  // ====== BLOCO 4: Composição ======
  const totalSaidas = sorted.reduce((s, r) => s + r.saidas, 0);
  const totalServicos = sorted.reduce((s, r) => s + r.servicos, 0);
  const totalOutros = sorted.reduce((s, r) => s + r.outros, 0);
  const composicao = [
    { name: "Saídas", value: totalSaidas, pct: totalAnual > 0 ? (totalSaidas / totalAnual) * 100 : 0 },
    { name: "Serviços", value: totalServicos, pct: totalAnual > 0 ? (totalServicos / totalAnual) * 100 : 0 },
  ];
  if (totalOutros > 0) composicao.push({ name: "Outros", value: totalOutros, pct: (totalOutros / totalAnual) * 100 });

  const ticketMedioSaidas = sorted.length > 0 ? totalSaidas / sorted.length : 0;
  const ticketMedioServicos = sorted.length > 0 ? totalServicos / sorted.filter(r => r.servicos > 0).length || 0 : 0;

  // ====== BLOCO 5: Projeções ======
  const projecaoAnual = media * 12;
  const ultimos3 = sorted.slice(-3);
  const mediaUltimos3 = ultimos3.reduce((s, r) => s + r.total, 0) / (ultimos3.length || 1);
  const metaNum = parseBRCurrency(metaAnual);
  const crescimentoNecessario = metaNum > 0 && totalAnual > 0 ? ((metaNum - totalAnual) / totalAnual) * 100 : 0;
  const faturamentoMensalMeta = metaNum > 0 ? metaNum / 12 : 0;

  // ====== BLOCO 6: Rankings ======
  const ranking = [...sorted].sort((a, b) => b.total - a.total);
  const top3 = ranking.slice(0, 3);
  const bottom3 = ranking.slice(-3).reverse();

  const chartData = sorted.map(r => ({
    mes: r.mes.substring(0, 3),
    total: r.total,
    saidas: r.saidas,
    servicos: r.servicos,
    acima: r.total >= media,
  }));

  return (
    <section className="mb-12">
      <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-3">
        <BarChart3 className="w-7 h-7 text-primary" />
        📊 Análise de Faturamento Mensal
      </h2>

      {/* BLOCO 1 - Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <Card icon={<TrendingUp className="w-5 h-5 text-green-500" />} label="Maior Faturamento" sub={maiorMes.mes}>
          {fmt(maiorMes.total)}
        </Card>
        <Card icon={<TrendingDown className="w-5 h-5 text-red-500" />} label="Menor Faturamento" sub={menorMes.mes}>
          {fmt(menorMes.total)}
        </Card>
        <Card icon={<Activity className="w-5 h-5 text-primary" />} label="Média Mensal">
          {fmt(media)}
        </Card>
        <Card icon={<DollarSign className="w-5 h-5 text-primary" />} label="Total Anual">
          {fmt(totalAnual)}
        </Card>
        <Card icon={<Target className="w-5 h-5 text-orange-500" />} label="Variação Max/Min" sub={fmtPct(variacaoPct)}>
          {fmt(variacaoAbs)}
        </Card>
      </div>

      {/* BLOCO 2 - Tendência */}
      <div className="glass-card p-6 mb-8">
        <h3 className="font-display text-lg font-bold mb-4">📈 Análise de Tendência</h3>

        {/* Variação mensal bar chart */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-muted-foreground mb-3">Variação Mês a Mês (%)</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={variacaoMensal}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickFormatter={v => `${v.toFixed(0)}%`}
                domain={["auto", "auto"]}
              />
              <Tooltip formatter={(v: number) => fmtPct(v)} />
              {variacaoMensal.some(d => d.variacao < 0) && (
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={1} />
              )}
              <Bar dataKey="variacao" fill="hsl(var(--primary))">
                {variacaoMensal.map((entry, i) => (
                  <Cell key={i} fill={entry.variacao >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Trimestral */}
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Análise Trimestral</h4>
            <div className="space-y-2">
              {trimestres.map(q => (
                <div key={q.label} className={`flex items-center justify-between p-3 rounded-lg border ${
                  q.label === melhorTri.label ? "border-green-500/50 bg-green-500/5" :
                  q.label === piorTri.label ? "border-red-500/50 bg-red-500/5" : "border-border bg-muted/20"
                }`}>
                  <span className="font-medium">{q.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{fmt(q.total)}</span>
                    {q.label === melhorTri.label && <Badge className="bg-green-500/20 text-green-600 text-xs">Melhor</Badge>}
                    {q.label === piorTri.label && <Badge className="bg-red-500/20 text-red-600 text-xs">Pior</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Semestral */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Comparativo Semestral</h4>
            <div className="space-y-3">
              <div className="flex justify-between p-3 rounded-lg border border-border bg-muted/20">
                <span>1º Semestre</span><span className="font-semibold">{fmt(sem1)}</span>
              </div>
              <div className="flex justify-between p-3 rounded-lg border border-border bg-muted/20">
                <span>2º Semestre</span><span className="font-semibold">{fmt(sem2)}</span>
              </div>
              <div className={`flex justify-between p-3 rounded-lg border ${semDiff >= 0 ? "border-green-500/50 bg-green-500/5" : "border-red-500/50 bg-red-500/5"}`}>
                <span>{semDiff >= 0 ? "Crescimento" : "Queda"}</span>
                <span className="font-semibold">{fmt(Math.abs(semDiff))} ({fmtPct(Math.abs(semPct))})</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BLOCO 3 - Consistência */}
      <div className="glass-card p-6 mb-8">
        <h3 className="font-display text-lg font-bold mb-4">🎯 Análise de Consistência</h3>
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center">
            <p className="text-xs text-muted-foreground mb-1">Desvio Padrão</p>
            <p className="text-lg font-bold">{fmt(desvioPadrao)}</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center">
            <p className="text-xs text-muted-foreground mb-1">Coeficiente de Variação</p>
            <p className="text-lg font-bold">{fmtPct(cv)}</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center">
            <p className="text-xs text-muted-foreground mb-1">Diagnóstico</p>
            <p className="text-base font-bold">{cvLabel}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-lg border border-green-500/30 bg-green-500/5">
            <p className="text-sm font-semibold text-green-600 mb-2">Acima da média ({acimaDaMedia.length} meses)</p>
            <div className="flex flex-wrap gap-1">
              {acimaDaMedia.map(r => <Badge key={r.mes} variant="secondary" className="text-xs">{r.mes}</Badge>)}
            </div>
          </div>
          <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5">
            <p className="text-sm font-semibold text-red-600 mb-2">Abaixo da média ({abaixoDaMedia.length} meses)</p>
            <div className="flex flex-wrap gap-1">
              {abaixoDaMedia.map(r => <Badge key={r.mes} variant="outline" className="text-xs">{r.mes}</Badge>)}
            </div>
          </div>
        </div>

        {/* Sazonalidade chart */}
        <h4 className="text-sm font-semibold text-muted-foreground mb-3">Sazonalidade — Faturamento vs Média</h4>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickFormatter={v => `${(v/1000).toFixed(0)}k`}
              domain={["auto", "auto"]}
            />
            <Tooltip formatter={(v: number) => fmt(v)} />
            {chartData.some(d => d.total < 0) && (
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={1} />
            )}
            <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
            <Line type="monotone" dataKey={() => media} stroke="hsl(var(--destructive))" strokeDasharray="5 5" dot={false} name="Média" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* BLOCO 4 - Composição */}
      <div className="glass-card p-6 mb-8">
        <h3 className="font-display text-lg font-bold mb-4">💰 Composição da Receita</h3>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Donut chart */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Participação por Categoria</h4>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={composicao} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                  label={({ name, pct }) => `${name}: ${fmtPct(pct)}`} labelLine={false} fontSize={11}>
                  {composicao.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6 mt-2 text-sm">
              <span>Ticket Médio Saídas: <b>{fmt(ticketMedioSaidas)}</b></span>
              <span>Ticket Médio Serviços: <b>{fmt(ticketMedioServicos)}</b></span>
            </div>
          </div>

          {/* Evolução serviços */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Evolução de Serviços</h4>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={v => `${(v/1000).toFixed(0)}k`}
                  domain={["auto", "auto"]}
                />
                <Tooltip formatter={(v: number) => fmt(v)} />
                {chartData.some(d => d.servicos < 0) && (
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={1} />
                )}
                <Line type="monotone" dataKey="servicos" stroke="hsl(var(--secondary))" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
            {sorted.filter(r => r.servicos === 0).length > 0 && (
              <div className="mt-2 flex items-center gap-2 text-sm text-orange-500">
                <AlertTriangle className="w-4 h-4" />
                Meses sem serviços: {sorted.filter(r => r.servicos === 0).map(r => r.mes).join(", ")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BLOCO 5 - Projeções */}
      <div className="glass-card p-6 mb-8">
        <h3 className="font-display text-lg font-bold mb-4">🔮 Projeções</h3>
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">Meta Anualizada</p>
            <p className="text-sm">Se mantivesse a média mensal ({fmt(media)}), o faturamento projetado seria</p>
            <p className="text-xl font-bold text-primary">{fmt(projecaoAnual)}/ano</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">Projeção Próximo Mês</p>
            <p className="text-sm">Com base nos últimos 3 meses, a projeção é</p>
            <p className="text-xl font-bold text-primary">{fmt(mediaUltimos3)}</p>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
          <h4 className="text-sm font-semibold mb-3">Meta Personalizada</h4>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Meta anual:</span>
            <Input
              placeholder="R$ 0,00"
              value={metaAnual}
              onChange={(e) => setMetaAnual(applyMoneyMask(e.target.value))}
              inputMode="numeric"
              className="max-w-xs"
            />
          </div>
          {metaNum > 0 && (
            <div className="grid md:grid-cols-2 gap-4 mt-3">
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground">Crescimento necessário</p>
                <p className="text-lg font-bold">{fmtPct(crescimentoNecessario)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground">Faturamento mensal necessário</p>
                <p className="text-lg font-bold">{fmt(faturamentoMensalMeta)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BLOCO 6 - Rankings */}
      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-bold mb-4">🏆 Rankings</h3>

        {/* Top 3 vs Bottom 3 */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div>
            <h4 className="text-sm font-semibold text-green-600 mb-3">🥇 Top 3 Meses</h4>
            <div className="space-y-2">
              {top3.map((r, i) => (
                <div key={r.mes} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: MEDAL_COLORS[i], color: "#000" }}>
                      {i + 1}
                    </div>
                    <span className="font-medium">{r.mes}</span>
                  </div>
                  <span className="font-semibold">{fmt(r.total)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-red-600 mb-3">⬇️ Bottom 3 Meses</h4>
            <div className="space-y-2">
              {bottom3.map((r, i) => (
                <div key={r.mes} className="flex items-center justify-between p-3 rounded-lg border border-red-500/30 bg-red-500/5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-xs font-bold text-red-600">
                      {ranking.length - 2 + i}
                    </div>
                    <span className="font-medium">{r.mes}</span>
                  </div>
                  <span className="font-semibold">{fmt(r.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Ranking completo */}
        <h4 className="text-sm font-semibold text-muted-foreground mb-3">Ranking Completo</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-muted-foreground">#</th>
                <th className="text-left py-2 px-3 text-muted-foreground">Mês</th>
                <th className="text-right py-2 px-3 text-muted-foreground">Saídas</th>
                <th className="text-right py-2 px-3 text-muted-foreground">Serviços</th>
                <th className="text-right py-2 px-3 text-muted-foreground">Total</th>
                <th className="text-right py-2 px-3 text-muted-foreground">vs Média</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => {
                const diff = ((r.total - media) / media) * 100;
                return (
                  <tr key={r.mes} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-3 font-bold">{i + 1}º</td>
                    <td className="py-2 px-3 font-medium">{r.mes}</td>
                    <td className="py-2 px-3 text-right">{fmt(r.saidas)}</td>
                    <td className="py-2 px-3 text-right">{fmt(r.servicos)}</td>
                    <td className="py-2 px-3 text-right font-semibold">{fmt(r.total)}</td>
                    <td className={`py-2 px-3 text-right font-medium ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {diff >= 0 ? "+" : ""}{fmtPct(diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Card({ icon, label, sub, children }: { icon: React.ReactNode; label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-4 text-center">
      <div className="flex justify-center mb-2">{icon}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-foreground">{children}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function parseBRCurrency(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/R\$\s*/gi, "").replace(/\./g, "").replace(",", ".").trim();
  return parseFloat(cleaned) || 0;
}
