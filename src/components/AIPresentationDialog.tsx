import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Loader2, 
  Presentation, 
  Copy, 
  Check, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Target,
  Building,
  DollarSign,
  PieChart as PieChartIcon,
  FileDown,
  FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import html2pdf from "html2pdf.js";
import PptxGenJS from "pptxgenjs";

interface CalculatedDRE {
  receitaBruta: number;
  receitaLiquida: number;
  cmv: number;
  lucroBruto: number;
  despesasOperacionais: number;
  lucroOperacional: number;
  resultadoFinanceiro: number;
  lucroLiquido: number;
  margemBruta: number;
  margemOperacional: number;
  margemLiquida: number;
}

interface CalculatedBalanco {
  ativoCirculante: number;
  ativoNaoCirculante: number;
  ativoTotal: number;
  passivoCirculante: number;
  passivoNaoCirculante: number;
  passivoTotal: number;
  patrimonioLiquido: number;
}

interface Slide {
  type: 'cover' | 'overview' | 'profitability' | 'liquidity' | 'structure' | 'strengths' | 'risks' | 'recommendations' | 'conclusion' | 'charts';
  title: string;
  content: string[];
  icon?: React.ReactNode;
  highlight?: 'positive' | 'negative' | 'neutral';
  chartType?: 'dre' | 'balanco' | 'margens';
}

interface BrandingInfo {
  nome_empresa: string | null;
  cnpj_empresa: string | null;
  logo_url: string | null;
  telefone_fixo: string | null;
}

interface AIPresentationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dreData: CalculatedDRE | null;
  balancoData: CalculatedBalanco | null;
  empresaNome?: string;
  branding?: BrandingInfo | null;
}

const CHART_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export function AIPresentationDialog({
  open,
  onOpenChange,
  dreData,
  balancoData,
  empresaNome = "Empresa",
  branding
}: AIPresentationDialogProps) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rawContent, setRawContent] = useState("");
  const slideRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const formatCurrency = (value: number) => 
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatCompact = (value: number) => {
    if (Math.abs(value) >= 1000000) {
      return `R$ ${(value / 1000000).toFixed(1)}M`;
    } else if (Math.abs(value) >= 1000) {
      return `R$ ${(value / 1000).toFixed(0)}K`;
    }
    return formatCurrency(value);
  };

  // Chart data generators
  const getDREChartData = () => {
    if (!dreData) return [];
    return [
      { name: 'Receita Líquida', value: Math.abs(dreData.receitaLiquida), fill: CHART_COLORS[0] },
      { name: 'CMV', value: Math.abs(dreData.cmv), fill: CHART_COLORS[4] },
      { name: 'Lucro Bruto', value: Math.abs(dreData.lucroBruto), fill: CHART_COLORS[2] },
      { name: 'Desp. Operacionais', value: Math.abs(dreData.despesasOperacionais), fill: CHART_COLORS[3] },
      { name: 'Lucro Líquido', value: Math.abs(dreData.lucroLiquido), fill: dreData.lucroLiquido >= 0 ? CHART_COLORS[2] : CHART_COLORS[4] },
    ];
  };

  const getBalancoChartData = () => {
    if (!balancoData) return [];
    return [
      { name: 'Ativo Circulante', value: balancoData.ativoCirculante, fill: CHART_COLORS[0] },
      { name: 'Ativo Não Circulante', value: balancoData.ativoNaoCirculante, fill: CHART_COLORS[1] },
      { name: 'Passivo Circulante', value: balancoData.passivoCirculante, fill: CHART_COLORS[3] },
      { name: 'Passivo Não Circ.', value: balancoData.passivoNaoCirculante, fill: CHART_COLORS[4] },
      { name: 'Patrimônio Líquido', value: balancoData.patrimonioLiquido, fill: CHART_COLORS[2] },
    ];
  };

  const getMargensChartData = () => {
    if (!dreData) return [];
    return [
      { name: 'Margem Bruta', value: dreData.margemBruta, fill: CHART_COLORS[0] },
      { name: 'Margem Operacional', value: dreData.margemOperacional, fill: CHART_COLORS[1] },
      { name: 'Margem Líquida', value: dreData.margemLiquida, fill: CHART_COLORS[2] },
    ];
  };

  const generatePresentation = async () => {
    if (!dreData || !balancoData) {
      toast({
        title: "Dados insuficientes",
        description: "É necessário ter dados de DRE e Balanço para gerar a apresentação.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setSlides([]);
    setCurrentSlide(0);
    setRawContent("");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-presentation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            dre: dreData,
            balanco: balancoData,
            empresaNome,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao gerar apresentação");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullContent += content;
              setRawContent(fullContent);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullContent += content;
              setRawContent(fullContent);
            }
          } catch { /* ignore */ }
        }
      }

      // Parse the JSON response and create slides
      const parsedSlides = parseAIResponse(fullContent, empresaNome, dreData, balancoData);
      setSlides(parsedSlides);
    } catch (error) {
      console.error("Presentation error:", error);
      toast({
        title: "Erro na apresentação",
        description: error instanceof Error ? error.message : "Erro ao gerar apresentação com IA",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const parseAIResponse = (content: string, empresa: string, dre: CalculatedDRE, balanco: CalculatedBalanco): Slide[] => {
    const slides: Slide[] = [];
    
    // Cover slide
    slides.push({
      type: 'cover',
      title: `Análise Financeira - ${empresa}`,
      content: [
        `Relatório gerado por Inteligência Artificial`,
        `Data: ${new Date().toLocaleDateString('pt-BR')}`,
      ],
      icon: <Building className="w-12 h-12" />,
      highlight: 'neutral'
    });

    // Charts slides - DRE
    slides.push({
      type: 'charts',
      title: 'Composição do Resultado (DRE)',
      content: [],
      chartType: 'dre',
      highlight: 'neutral'
    });

    // Charts slides - Balanço
    slides.push({
      type: 'charts',
      title: 'Estrutura Patrimonial',
      content: [],
      chartType: 'balanco',
      highlight: 'neutral'
    });

    // Charts slides - Margens
    slides.push({
      type: 'charts',
      title: 'Indicadores de Margem',
      content: [],
      chartType: 'margens',
      highlight: dre.margemLiquida > 5 ? 'positive' : dre.margemLiquida < 0 ? 'negative' : 'neutral'
    });

    // Try to parse structured JSON from AI response
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const aiData = JSON.parse(jsonMatch[0]);
        
        if (aiData.resumo) {
          slides.push({
            type: 'overview',
            title: 'Visão Geral',
            content: Array.isArray(aiData.resumo) ? aiData.resumo : [aiData.resumo],
            icon: <PieChartIcon className="w-8 h-8" />,
            highlight: 'neutral'
          });
        }

        if (aiData.rentabilidade) {
          slides.push({
            type: 'profitability',
            title: 'Análise de Rentabilidade',
            content: Array.isArray(aiData.rentabilidade) ? aiData.rentabilidade : [aiData.rentabilidade],
            icon: <DollarSign className="w-8 h-8" />,
            highlight: dre.margemLiquida > 5 ? 'positive' : dre.margemLiquida < 0 ? 'negative' : 'neutral'
          });
        }

        if (aiData.liquidez) {
          slides.push({
            type: 'liquidity',
            title: 'Liquidez e Solvência',
            content: Array.isArray(aiData.liquidez) ? aiData.liquidez : [aiData.liquidez],
            icon: balanco.ativoCirculante > balanco.passivoCirculante 
              ? <TrendingUp className="w-8 h-8" /> 
              : <TrendingDown className="w-8 h-8" />,
            highlight: balanco.ativoCirculante > balanco.passivoCirculante ? 'positive' : 'negative'
          });
        }

        if (aiData.estrutura) {
          slides.push({
            type: 'structure',
            title: 'Estrutura de Capital',
            content: Array.isArray(aiData.estrutura) ? aiData.estrutura : [aiData.estrutura],
            icon: <Building className="w-8 h-8" />,
            highlight: 'neutral'
          });
        }

        if (aiData.pontosFortes && aiData.pontosFortes.length > 0) {
          slides.push({
            type: 'strengths',
            title: 'Pontos Fortes',
            content: aiData.pontosFortes,
            icon: <CheckCircle2 className="w-8 h-8" />,
            highlight: 'positive'
          });
        }

        if (aiData.pontosAtencao && aiData.pontosAtencao.length > 0) {
          slides.push({
            type: 'risks',
            title: 'Pontos de Atenção',
            content: aiData.pontosAtencao,
            icon: <AlertTriangle className="w-8 h-8" />,
            highlight: 'negative'
          });
        }

        if (aiData.recomendacoes && aiData.recomendacoes.length > 0) {
          slides.push({
            type: 'recommendations',
            title: 'Recomendações Estratégicas',
            content: aiData.recomendacoes,
            icon: <Target className="w-8 h-8" />,
            highlight: 'neutral'
          });
        }

        if (aiData.conclusao) {
          slides.push({
            type: 'conclusion',
            title: 'Conclusão',
            content: Array.isArray(aiData.conclusao) ? aiData.conclusao : [aiData.conclusao],
            icon: <CheckCircle2 className="w-8 h-8" />,
            highlight: 'neutral'
          });
        }
      }
    } catch (e) {
      console.error("Error parsing AI response:", e);
    }

    // Default slides if no AI content
    if (slides.length <= 4) {
      slides.push({
        type: 'overview',
        title: 'Resumo Financeiro',
        content: [
          `Receita Líquida: ${formatCurrency(dre.receitaLiquida)}`,
          `Lucro Bruto: ${formatCurrency(dre.lucroBruto)} (Margem: ${dre.margemBruta.toFixed(1)}%)`,
          `Lucro Operacional: ${formatCurrency(dre.lucroOperacional)} (Margem: ${dre.margemOperacional.toFixed(1)}%)`,
          `Lucro Líquido: ${formatCurrency(dre.lucroLiquido)} (Margem: ${dre.margemLiquida.toFixed(1)}%)`,
        ],
        icon: <DollarSign className="w-8 h-8" />,
        highlight: dre.lucroLiquido > 0 ? 'positive' : 'negative'
      });

      const liquidezCorrente = balanco.passivoCirculante > 0 
        ? balanco.ativoCirculante / balanco.passivoCirculante 
        : 0;

      slides.push({
        type: 'liquidity',
        title: 'Indicadores de Balanço',
        content: [
          `Ativo Total: ${formatCurrency(balanco.ativoTotal)}`,
          `Passivo Total: ${formatCurrency(balanco.passivoTotal)}`,
          `Patrimônio Líquido: ${formatCurrency(balanco.patrimonioLiquido)}`,
          `Liquidez Corrente: ${liquidezCorrente.toFixed(2)}`,
        ],
        icon: <Building className="w-8 h-8" />,
        highlight: liquidezCorrente >= 1 ? 'positive' : 'negative'
      });
    }

    return slides;
  };

  const generatePdfChartHtml = (chartType: string): string => {
    const fmtVal = (v: number) => {
      if (v >= 1000000) return 'R$ ' + (v/1000000).toFixed(1) + 'M';
      if (v >= 1000) return 'R$ ' + (v/1000).toFixed(0) + 'K';
      return 'R$ ' + v.toFixed(0);
    };

    if (chartType === 'dre' && dreData) {
      const items = [
        { label: 'Receita Líquida', value: Math.abs(dreData.receitaLiquida), color: '#8b5cf6' },
        { label: 'CMV / Custos', value: Math.abs(dreData.cmv), color: '#ef4444' },
        { label: 'Lucro Bruto', value: Math.abs(dreData.lucroBruto), color: '#10b981' },
        { label: 'Desp. Operacionais', value: Math.abs(dreData.despesasOperacionais), color: '#f59e0b' },
        { label: 'Lucro Líquido', value: Math.abs(dreData.lucroLiquido), color: dreData.lucroLiquido >= 0 ? '#06b6d4' : '#ef4444' },
      ];
      const maxVal = Math.max(...items.map(i => i.value));
      return '<div class="chart-data-section">' + items.map(item =>
        '<div class="chart-bar-row">' +
          '<div class="chart-bar-label">' + item.label + '</div>' +
          '<div class="chart-bar-track">' +
            '<div class="chart-bar-fill" style="width: ' + Math.max((item.value / maxVal) * 100, 8) + '%; background: ' + item.color + ';">' +
              '<span class="chart-bar-value">' + fmtVal(item.value) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>'
      ).join('') + '</div>';
    }

    if (chartType === 'balanco' && balancoData) {
      const items = [
        { label: 'Ativo Circulante', value: balancoData.ativoCirculante, color: '#8b5cf6' },
        { label: 'Ativo Não Circulante', value: balancoData.ativoNaoCirculante, color: '#06b6d4' },
        { label: 'Passivo Circulante', value: balancoData.passivoCirculante, color: '#f59e0b' },
        { label: 'Passivo Não Circ.', value: balancoData.passivoNaoCirculante, color: '#ef4444' },
        { label: 'Patrimônio Líquido', value: balancoData.patrimonioLiquido, color: '#10b981' },
      ];
      const total = items.reduce((a, b) => a + Math.abs(b.value), 0);
      return '<div class="chart-data-section"><div class="chart-donut-grid">' + items.map(item =>
        '<div class="chart-donut-item">' +
          '<div class="chart-donut-dot" style="background: ' + item.color + ';"></div>' +
          '<div class="chart-donut-info">' +
            '<div class="chart-donut-name">' + item.label + '</div>' +
            '<div class="chart-donut-val">' + fmtVal(Math.abs(item.value)) + ' (' + (total > 0 ? ((Math.abs(item.value)/total)*100).toFixed(1) : '0') + '%)</div>' +
          '</div>' +
        '</div>'
      ).join('') + '</div></div>';
    }

    if (chartType === 'margens' && dreData) {
      const items = [
        { label: 'Margem Bruta', value: dreData.margemBruta, color: '#8b5cf6' },
        { label: 'Margem Operacional', value: dreData.margemOperacional, color: '#06b6d4' },
        { label: 'Margem Líquida', value: dreData.margemLiquida, color: '#10b981' },
      ];
      return '<div class="chart-data-section"><div class="chart-kpi-row">' + items.map(item =>
        '<div class="chart-kpi-card" style="border-top: 4px solid ' + item.color + ';">' +
          '<div class="chart-kpi-value" style="color: ' + item.color + ';">' + item.value.toFixed(1) + '%</div>' +
          '<div class="chart-kpi-label">' + item.label + '</div>' +
        '</div>'
      ).join('') + '</div></div>';
    }

    return '<div class="chart-data-section" style="text-align:center; color:#94a3b8; padding:40px;">Dados não disponíveis</div>';
  };

  const handleExportPDF = async () => {
    if (!slideRef.current || slides.length === 0) return;
    
    setIsExporting(true);
    try {
      const brandName = branding?.nome_empresa || 'ProCont';
      const currentDate = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      
      const container = document.createElement('div');
      container.style.cssText = 'background: white; width: 1000px;';
      
      container.innerHTML = `
        <style>
          * { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; box-sizing: border-box; margin: 0; padding: 0; }
          .cover-page {
            height: 1400px;
            background: linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 80px;
            position: relative;
            overflow: hidden;
          }
          .cover-page::before {
            content: '';
            position: absolute;
            top: -50%;
            right: -30%;
            width: 800px;
            height: 800px;
            background: radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%);
            border-radius: 50%;
          }
          .cover-page::after {
            content: '';
            position: absolute;
            bottom: -40%;
            left: -20%;
            width: 600px;
            height: 600px;
            background: radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%);
            border-radius: 50%;
          }
          .cover-logo { position: relative; z-index: 2; margin-bottom: 40px; }
          .cover-logo img { max-height: 80px; max-width: 250px; filter: brightness(0) invert(1); }
          .cover-title { position: relative; z-index: 2; font-size: 42px; font-weight: 800; color: white; letter-spacing: -1px; line-height: 1.2; margin-bottom: 16px; }
          .cover-subtitle { position: relative; z-index: 2; font-size: 22px; color: rgba(255,255,255,0.8); font-weight: 300; margin-bottom: 40px; }
          .cover-empresa { position: relative; z-index: 2; background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2); border-radius: 16px; padding: 24px 48px; }
          .cover-empresa-name { font-size: 24px; font-weight: 700; color: white; margin-bottom: 4px; }
          .cover-empresa-info { font-size: 14px; color: rgba(255,255,255,0.7); }
          .cover-date { position: relative; z-index: 2; margin-top: 40px; font-size: 14px; color: rgba(255,255,255,0.5); }
          .cover-brand-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 6px; background: linear-gradient(90deg, #8b5cf6, #06b6d4, #10b981); z-index: 2; }

          .pdf-body { padding: 50px 60px; }
          .section { margin-bottom: 50px; page-break-inside: avoid; }
          .section-header { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; padding-bottom: 14px; border-bottom: 2px solid #e5e7eb; }
          .section-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; color: white; flex-shrink: 0; }
          .section-icon-positive { background: linear-gradient(135deg, #059669, #10b981); }
          .section-icon-negative { background: linear-gradient(135deg, #dc2626, #ef4444); }
          .section-icon-neutral { background: linear-gradient(135deg, #7c3aed, #8b5cf6); }
          .section-title { font-size: 22px; font-weight: 700; color: #1e293b; }
          .section-badge { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; padding: 4px 12px; border-radius: 20px; }
          .badge-positive { background: #ecfdf5; color: #059669; }
          .badge-negative { background: #fef2f2; color: #dc2626; }
          .badge-neutral { background: #f5f3ff; color: #7c3aed; }

          .content-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px 28px; }
          .content-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f1f5f9; line-height: 1.7; font-size: 15px; color: #334155; }
          .content-item:last-child { border-bottom: none; }
          .content-bullet { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 8px; }
          .bullet-positive { background: #10b981; }
          .bullet-negative { background: #ef4444; }
          .bullet-neutral { background: #8b5cf6; }
          .chart-data-section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px 28px; }
          .chart-bar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
          .chart-bar-label { width: 160px; font-size: 13px; font-weight: 600; color: #334155; flex-shrink: 0; }
          .chart-bar-track { flex: 1; background: #e2e8f0; border-radius: 6px; height: 28px; position: relative; overflow: hidden; }
          .chart-bar-fill { height: 100%; border-radius: 6px; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; min-width: 60px; }
          .chart-bar-value { font-size: 11px; font-weight: 700; color: white; white-space: nowrap; }
          .chart-kpi-row { display: flex; gap: 16px; margin-top: 16px; }
          .chart-kpi-card { flex: 1; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; text-align: center; }
          .chart-kpi-value { font-size: 22px; font-weight: 800; margin-bottom: 2px; }
          .chart-kpi-label { font-size: 11px; color: #64748b; }
          .chart-donut-grid { display: flex; flex-wrap: wrap; gap: 12px; }
          .chart-donut-item { flex: 1; min-width: 45%; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; display: flex; align-items: center; gap: 12px; }
          .chart-donut-dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
          .chart-donut-info { flex: 1; }
          .chart-donut-name { font-size: 12px; font-weight: 600; color: #334155; }
          .chart-donut-val { font-size: 11px; color: #64748b; }

          .pdf-footer { margin-top: 60px; padding: 24px 0; border-top: 2px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #94a3b8; }
          .footer-brand { font-weight: 600; color: #7c3aed; }
        </style>

        <!-- COVER PAGE -->
        <div class="cover-page">
          ${branding?.logo_url ? `<div class="cover-logo"><img src="${branding.logo_url}" alt="Logo" crossorigin="anonymous" /></div>` : ''}
          <div class="cover-title">Apresentação Executiva</div>
          <div class="cover-subtitle">Análise Financeira com Inteligência Artificial</div>
          <div class="cover-empresa">
            <div class="cover-empresa-name">${empresaNome}</div>
            ${branding?.cnpj_empresa ? `<div class="cover-empresa-info">CNPJ: ${branding.cnpj_empresa}</div>` : ''}
          </div>
          <div class="cover-date">${currentDate}</div>
          <div class="cover-brand-bar"></div>
        </div>

        <!-- CONTENT -->
        <div class="pdf-body">
          ${slides.filter(s => s.type !== 'cover').map((slide) => {
            const hl = slide.highlight || 'neutral';
            const iconEmoji = slide.type === 'charts' ? '📊' : slide.type === 'profitability' ? '💰' : slide.type === 'liquidity' ? '💧' : slide.type === 'structure' ? '🏗️' : slide.type === 'strengths' ? '✅' : slide.type === 'risks' ? '⚠️' : slide.type === 'recommendations' ? '🎯' : slide.type === 'conclusion' ? '📋' : '📄';
            const badgeText = hl === 'positive' ? 'Favorável' : hl === 'negative' ? 'Atenção' : '';
            
            return `
              <div class="section">
                <div class="section-header">
                  <div class="section-icon section-icon-${hl}">${iconEmoji}</div>
                  <div class="section-title">${slide.title}</div>
                  ${badgeText ? `<span class="section-badge badge-${hl}">${badgeText}</span>` : ''}
                </div>
                ${slide.type === 'charts' && slide.chartType
                  ? generatePdfChartHtml(slide.chartType)
                  : `
                  <div class="content-card">
                    ${slide.content.map(item => `
                      <div class="content-item">
                        <div class="content-bullet bullet-${hl}"></div>
                        <div>${item}</div>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>
            `;
          }).join('')}

          <div class="pdf-footer">
            <div><span class="footer-brand">${brandName}</span> — Análise gerada com IA</div>
            <div>${currentDate}${branding?.telefone_fixo ? ` | ${branding.telefone_fixo}` : ''}</div>
          </div>
        </div>
      `;

      document.body.appendChild(container);

      const opt = {
        margin: 0,
        filename: `apresentacao-${empresaNome.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      await html2pdf().set(opt).from(container).save();
      document.body.removeChild(container);

      toast({
        title: "PDF exportado!",
        description: "Apresentação salva com sucesso.",
      });
    } catch (error) {
      console.error("PDF export error:", error);
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível gerar o PDF.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const fetchImageAsBase64 = async (url: string): Promise<string | null> => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      
      // Convert to PNG via canvas to ensure PptxGenJS compatibility (WebP not supported)
      return await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('No canvas context')); return; }
            ctx.drawImage(img, 0, 0);
            const pngDataUrl = canvas.toDataURL('image/png');
            console.log('Logo converted to PNG base64, length:', pngDataUrl.length);
            resolve(pngDataUrl);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = URL.createObjectURL(blob);
      });
    } catch (e) {
      console.error('Failed to fetch image as base64:', e);
      return null;
    }
  };

  const handleExportPPTX = async () => {
    if (slides.length === 0 || !dreData || !balancoData) return;
    
    setIsExporting(true);
    try {
      const pptx = new PptxGenJS();
      const brandName = branding?.nome_empresa || 'ProCont';
      pptx.author = brandName;
      pptx.title = `Análise Financeira - ${empresaNome}`;
      pptx.subject = 'Apresentação Executiva';
      pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 inches

      // Color palette
      const colors = {
        darkBg: '1E1B4B',
        midBg: '312E81',
        accent: '8B5CF6',
        accentLight: 'A78BFA',
        positive: '059669',
        positiveLight: 'ECFDF5',
        negative: 'DC2626',
        negativeLight: 'FEF2F2',
        text: '1E293B',
        textLight: '64748B',
        white: 'FFFFFF',
        lightGray: 'F8FAFC',
        border: 'E2E8F0',
        cyan: '06B6D4',
        emerald: '10B981',
        amber: 'F59E0B',
        red: 'EF4444',
      };

      // ========== COVER SLIDE ==========
      const coverSlide = pptx.addSlide();
      coverSlide.background = { fill: colors.darkBg };
      
      // Decorative circles
      coverSlide.addShape(pptx.ShapeType.ellipse, { x: 8.5, y: -2, w: 6, h: 6, fill: { color: colors.accent, transparency: 80 } });
      coverSlide.addShape(pptx.ShapeType.ellipse, { x: -2, y: 4, w: 5, h: 5, fill: { color: colors.midBg, transparency: 50 } });
      
      // Bottom gradient bar
      coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.2, w: 13.33, h: 0.3, fill: { color: colors.accent } });

      // Logo (if available) - fetch as base64 for reliable embedding
      if (branding?.logo_url) {
        try {
          const logoBase64 = await fetchImageAsBase64(branding.logo_url);
          if (logoBase64) {
            coverSlide.addImage({ data: logoBase64, x: 5.17, y: 0.8, w: 3, h: 1, sizing: { type: 'contain', w: 3, h: 1 } });
          }
        } catch { /* logo might fail, continue */ }
      }

      // Title
      coverSlide.addText('Apresentação Executiva', {
        x: 1.5, y: 2.2, w: 10.33, h: 1.2,
        fontSize: 40, fontFace: 'Segoe UI', bold: true, color: colors.white,
        align: 'center'
      });
      coverSlide.addText('Análise Financeira com Inteligência Artificial', {
        x: 2.5, y: 3.3, w: 8.33, h: 0.6,
        fontSize: 20, fontFace: 'Segoe UI Light', color: colors.accentLight,
        align: 'center'
      });

      // Company card
      coverSlide.addShape(pptx.ShapeType.roundRect, {
        x: 3.67, y: 4.3, w: 6, h: 1.5,
        fill: { color: colors.white, transparency: 88 },
        line: { color: colors.white, width: 1, transparency: 70 },
        rectRadius: 0.15
      });
      coverSlide.addText(empresaNome, {
        x: 3.67, y: 4.4, w: 6, h: 0.8,
        fontSize: 22, fontFace: 'Segoe UI', bold: true, color: colors.white,
        align: 'center'
      });
      if (branding?.cnpj_empresa) {
        coverSlide.addText(`CNPJ: ${branding.cnpj_empresa}`, {
          x: 3.67, y: 5.1, w: 6, h: 0.5,
          fontSize: 13, fontFace: 'Segoe UI', color: colors.accentLight,
          align: 'center'
        });
      }

      // Date
      coverSlide.addText(new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }), {
        x: 4.17, y: 6.3, w: 5, h: 0.5,
        fontSize: 13, fontFace: 'Segoe UI', color: colors.accentLight, align: 'center'
      });

      // ========== CONTENT SLIDES ==========
      slides.filter(s => s.type !== 'cover').forEach((slide) => {
        const pptSlide = pptx.addSlide();
        pptSlide.background = { fill: colors.white };

        // Top accent bar
        pptSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.06, fill: { color: colors.accent } });

        // Footer bar
        pptSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.0, w: 13.33, h: 0.5, fill: { color: colors.lightGray } });
        pptSlide.addText(`${brandName}${branding?.telefone_fixo ? `  |  ${branding.telefone_fixo}` : ''}`, {
          x: 0.5, y: 7.05, w: 6, h: 0.4,
          fontSize: 9, fontFace: 'Segoe UI', color: colors.textLight
        });
        pptSlide.addText(empresaNome, {
          x: 7, y: 7.05, w: 5.83, h: 0.4,
          fontSize: 9, fontFace: 'Segoe UI', color: colors.textLight, align: 'right'
        });

        // Slide number indicator
        const hlColor = slide.highlight === 'positive' ? colors.positive : slide.highlight === 'negative' ? colors.negative : colors.accent;

        // Title area with accent left border
        pptSlide.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.4, w: 0.08, h: 0.8, fill: { color: hlColor } });
        pptSlide.addText(slide.title, {
          x: 0.9, y: 0.35, w: 11, h: 0.9,
          fontSize: 28, fontFace: 'Segoe UI', bold: true, color: colors.text
        });

        // Badge
        if (slide.highlight === 'positive' || slide.highlight === 'negative') {
          const badgeText = slide.highlight === 'positive' ? '● FAVORÁVEL' : '● ATENÇÃO';
          const badgeBg = slide.highlight === 'positive' ? colors.positiveLight : colors.negativeLight;
          const badgeFg = slide.highlight === 'positive' ? colors.positive : colors.negative;
          pptSlide.addShape(pptx.ShapeType.roundRect, {
            x: 10.5, y: 0.5, w: 2.2, h: 0.45,
            fill: { color: badgeBg }, rectRadius: 0.2
          });
          pptSlide.addText(badgeText, {
            x: 10.5, y: 0.5, w: 2.2, h: 0.45,
            fontSize: 10, fontFace: 'Segoe UI', bold: true, color: badgeFg, align: 'center'
          });
        }

        // Divider line
        pptSlide.addShape(pptx.ShapeType.line, {
          x: 0.6, y: 1.35, w: 12.13, h: 0,
          line: { color: colors.border, width: 1 }
        });

        if (slide.type === 'charts' && slide.chartType) {
          // Chart background card
          pptSlide.addShape(pptx.ShapeType.roundRect, {
            x: 0.6, y: 1.6, w: 12.13, h: 5.1,
            fill: { color: colors.lightGray },
            line: { color: colors.border, width: 0.5 },
            rectRadius: 0.12
          });

          if (slide.chartType === 'dre') {
            const formatCurrencyLabel = (v: number) => {
              if (Math.abs(v) >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
              if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toFixed(0)}K`;
              return `R$ ${v.toFixed(0)}`;
            };
            const vals = [
              Math.abs(dreData.receitaLiquida), Math.abs(dreData.cmv),
              Math.abs(dreData.lucroBruto), Math.abs(dreData.despesasOperacionais),
              Math.abs(dreData.lucroLiquido)
            ];
            const labels = ['Receita Líquida', 'CMV / Custos', 'Lucro Bruto', 'Desp. Operacionais', 'Lucro Líquido'];
            const barColors = [colors.accent, colors.red, colors.emerald, colors.amber, colors.cyan];

            // Use individual series per bar for individual colors + 3D effect
            const chartData = labels.map((label, i) => ({
              name: label,
              labels: [label],
              values: [vals[i]]
            }));

            // Subtitle
            pptSlide.addText('Valores em Reais (R$) — Composição do Resultado', {
              x: 1, y: 1.5, w: 11.33, h: 0.35,
              fontSize: 11, fontFace: 'Segoe UI', italic: true, color: colors.textLight
            });

            pptSlide.addChart(pptx.ChartType.bar3d, chartData, {
              x: 0.8, y: 1.85, w: 11.73, h: 4.3,
              showValue: true,
              dataLabelColor: colors.text,
              dataLabelFontSize: 12,
              dataLabelFontBold: true,
              dataLabelFormatCode: '#,##0',
              dataLabelPosition: 'outEnd',
              catAxisLabelFontSize: 12,
              catAxisLabelFontBold: true,
              catAxisLabelColor: colors.text,
              catAxisOrientation: 'minMax',
              valAxisHidden: true,
              chartColors: barColors,
              plotArea: { fill: { color: colors.white } },
              catGridLine: { style: 'none' },
              valGridLine: { style: 'none' },
              showLegend: false,
              barGapWidthPct: 60,
              bar3DShape: 'cylinder',
              shadow: { type: 'outer', blur: 6, offset: 3, color: '000000', opacity: 0.2 },
            });

            // Summary cards below the chart
            const cardLabels = ['Receita Líq.', 'CMV', 'Lucro Bruto', 'Desp. Op.', 'Lucro Líq.'];
            cardLabels.forEach((label, i) => {
              const cardW = 2.2;
              const gap = 0.2;
              const totalW = (cardW * 5) + (gap * 4);
              const startX = (13.33 - totalW) / 2;
              const cardX = startX + (i * (cardW + gap));

              // Card background
              pptSlide.addShape(pptx.ShapeType.roundRect, {
                x: cardX, y: 6.25, w: cardW, h: 0.65,
                fill: { color: colors.white },
                line: { color: barColors[i], width: 2 },
                rectRadius: 0.08,
                shadow: { type: 'outer', blur: 4, offset: 2, color: '000000', opacity: 0.1 }
              });
              // Color accent bar on top
              pptSlide.addShape(pptx.ShapeType.rect, {
                x: cardX, y: 6.25, w: cardW, h: 0.06,
                fill: { color: barColors[i] }
              });
              // Label
              pptSlide.addText(label, {
                x: cardX, y: 6.26, w: cardW, h: 0.3,
                fontSize: 8, fontFace: 'Segoe UI', color: colors.textLight, align: 'center'
              });
              // Value
              pptSlide.addText(formatCurrencyLabel(vals[i]), {
                x: cardX, y: 6.5, w: cardW, h: 0.35,
                fontSize: 12, fontFace: 'Segoe UI', bold: true, color: barColors[i], align: 'center'
              });
            });

          } else if (slide.chartType === 'balanco') {
            const chartData = [{
              name: 'Estrutura',
              labels: ['Ativo Circulante', 'Ativo Não Circulante', 'Passivo Circulante', 'Passivo Não Circ.', 'Patrimônio Líquido'],
              values: [
                balancoData.ativoCirculante, balancoData.ativoNaoCirculante,
                balancoData.passivoCirculante, balancoData.passivoNaoCirculante,
                balancoData.patrimonioLiquido
              ]
            }];

            pptSlide.addText('Composição do Patrimônio', {
              x: 1, y: 1.55, w: 11.33, h: 0.35,
              fontSize: 11, fontFace: 'Segoe UI', italic: true, color: colors.textLight
            });

            pptSlide.addChart(pptx.ChartType.doughnut, chartData, {
              x: 1.5, y: 1.9, w: 5.5, h: 4.6,
              showPercent: true,
              dataLabelFontSize: 12,
              dataLabelFontBold: true,
              dataLabelColor: colors.text,
              showLegend: false,
              chartColors: [colors.accent, colors.cyan, colors.amber, colors.red, colors.emerald],
            });

            // Custom legend with values on the right side
            const legendLabels = ['Ativo Circulante', 'Ativo Não Circulante', 'Passivo Circulante', 'Passivo Não Circ.', 'Patrimônio Líquido'];
            const legendColors = [colors.accent, colors.cyan, colors.amber, colors.red, colors.emerald];
            const legendValues = [
              balancoData.ativoCirculante, balancoData.ativoNaoCirculante,
              balancoData.passivoCirculante, balancoData.passivoNaoCirculante,
              balancoData.patrimonioLiquido
            ];
            const total = legendValues.reduce((a, b) => a + Math.abs(b), 0);

            legendLabels.forEach((label, i) => {
              const y = 2.2 + (i * 0.85);
              // Color dot
              pptSlide.addShape(pptx.ShapeType.ellipse, {
                x: 7.8, y: y + 0.1, w: 0.22, h: 0.22,
                fill: { color: legendColors[i] }
              });
              // Label
              pptSlide.addText(label, {
                x: 8.15, y: y - 0.05, w: 3.5, h: 0.35,
                fontSize: 12, fontFace: 'Segoe UI', bold: true, color: colors.text
              });
              // Value
              const pct = total > 0 ? ((Math.abs(legendValues[i]) / total) * 100).toFixed(1) : '0.0';
              pptSlide.addText(`R$ ${(legendValues[i] / 1000).toFixed(0)}K  (${pct}%)`, {
                x: 8.15, y: y + 0.25, w: 3.5, h: 0.3,
                fontSize: 10, fontFace: 'Segoe UI', color: colors.textLight
              });
            });

          } else if (slide.chartType === 'margens') {
            const margensValues = [dreData.margemBruta, dreData.margemOperacional, dreData.margemLiquida];
            const chartData = [{
              name: 'Margens (%)',
              labels: ['Margem Bruta', 'Margem Operacional', 'Margem Líquida'],
              values: margensValues
            }];

            pptSlide.addText('Indicadores de Rentabilidade (%)', {
              x: 1, y: 1.55, w: 11.33, h: 0.35,
              fontSize: 11, fontFace: 'Segoe UI', italic: true, color: colors.textLight
            });

            pptSlide.addChart(pptx.ChartType.bar, chartData, {
              x: 1.5, y: 1.9, w: 7, h: 4.4,
              showValue: true,
              dataLabelColor: colors.text,
              dataLabelFontSize: 14,
              dataLabelFontBold: true,
              dataLabelFormatCode: '0.0"%"',
              catAxisLabelFontSize: 13,
              catAxisLabelFontBold: true,
              catAxisLabelColor: colors.text,
              valAxisHidden: true,
              chartColors: [colors.accent, colors.cyan, colors.emerald],
              plotArea: { fill: { color: colors.white }, border: { color: colors.border, pt: 0.5 } },
              catGridLine: { style: 'none' },
              valGridLine: { style: 'none' },
              showLegend: false,
              barGapWidthPct: 100,
            });

            // KPI cards on the right
            const kpiLabels = ['Margem Bruta', 'Margem Operacional', 'Margem Líquida'];
            const kpiColors = [colors.accent, colors.cyan, colors.emerald];
            kpiLabels.forEach((label, i) => {
              const y = 2.3 + (i * 1.5);
              pptSlide.addShape(pptx.ShapeType.roundRect, {
                x: 9.2, y: y, w: 3.5, h: 1.1,
                fill: { color: colors.white },
                line: { color: kpiColors[i], width: 2 },
                rectRadius: 0.1
              });
              pptSlide.addText(`${margensValues[i].toFixed(1)}%`, {
                x: 9.2, y: y + 0.05, w: 3.5, h: 0.6,
                fontSize: 26, fontFace: 'Segoe UI', bold: true, color: kpiColors[i], align: 'center'
              });
              pptSlide.addText(label, {
                x: 9.2, y: y + 0.6, w: 3.5, h: 0.4,
                fontSize: 10, fontFace: 'Segoe UI', color: colors.textLight, align: 'center'
              });
            });
          }
        } else {
          // Content slides with styled cards
          const contentY = 1.6;
          const itemHeight = Math.min(0.9, 4.8 / Math.max(slide.content.length, 1));
          
          slide.content.forEach((item, i) => {
            const y = contentY + (i * itemHeight);
            
            // Bullet circle
            pptSlide.addShape(pptx.ShapeType.ellipse, {
              x: 1, y: y + 0.15, w: 0.18, h: 0.18,
              fill: { color: hlColor }
            });

            // Text
            pptSlide.addText(item, {
              x: 1.4, y: y, w: 11, h: itemHeight,
              fontSize: 15, fontFace: 'Segoe UI', color: colors.text,
              valign: 'middle', lineSpacingMultiple: 1.3
            });

            // Separator
            if (i < slide.content.length - 1) {
              pptSlide.addShape(pptx.ShapeType.line, {
                x: 1, y: y + itemHeight - 0.02, w: 11.33, h: 0,
                line: { color: colors.border, width: 0.5, dashType: 'dash' }
              });
            }
          });
        }
      });

      // ========== CLOSING SLIDE ==========
      const closingSlide = pptx.addSlide();
      closingSlide.background = { fill: colors.darkBg };
      closingSlide.addShape(pptx.ShapeType.ellipse, { x: 9, y: -1.5, w: 5, h: 5, fill: { color: colors.accent, transparency: 85 } });
      closingSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.2, w: 13.33, h: 0.3, fill: { color: colors.accent } });

      closingSlide.addText('Obrigado', {
        x: 2, y: 2.5, w: 9.33, h: 1.2,
        fontSize: 44, fontFace: 'Segoe UI', bold: true, color: colors.white, align: 'center'
      });
      closingSlide.addText(`${brandName} — Análise gerada com Inteligência Artificial`, {
        x: 2.5, y: 3.8, w: 8.33, h: 0.6,
        fontSize: 16, fontFace: 'Segoe UI Light', color: colors.accentLight, align: 'center'
      });
      if (branding?.telefone_fixo) {
        closingSlide.addText(`Contato: ${branding.telefone_fixo}`, {
          x: 3.67, y: 4.5, w: 6, h: 0.5,
          fontSize: 14, fontFace: 'Segoe UI', color: colors.accentLight, align: 'center'
        });
      }

      await pptx.writeFile({ fileName: `apresentacao-${empresaNome.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pptx` });

      toast({
        title: "PowerPoint exportado!",
        description: "Apresentação salva com sucesso.",
      });
    } catch (error) {
      console.error("PPTX export error:", error);
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível gerar o PowerPoint.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };



  const handleCopy = async () => {
    try {
      const textContent = slides.map(slide => 
        `## ${slide.title}\n${slide.content.map(c => `• ${c}`).join('\n')}`
      ).join('\n\n');
      
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copiado!",
        description: "Apresentação copiada para a área de transferência.",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível copiar o texto.",
        variant: "destructive",
      });
    }
  };

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const getHighlightClass = (highlight?: 'positive' | 'negative' | 'neutral') => {
    switch (highlight) {
      case 'positive':
        return 'from-green-500/10 to-emerald-500/10 border-green-500/30';
      case 'negative':
        return 'from-red-500/10 to-orange-500/10 border-red-500/30';
      default:
        return 'from-primary/10 to-secondary/10 border-primary/30';
    }
  };

  const getIconColor = (highlight?: 'positive' | 'negative' | 'neutral') => {
    switch (highlight) {
      case 'positive':
        return 'text-green-500';
      case 'negative':
        return 'text-red-500';
      default:
        return 'text-primary';
    }
  };

  const renderChart = (chartType: string) => {
    if (chartType === 'dre') {
      const data = getDREChartData();
      return (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ left: 100, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" tickFormatter={(v) => formatCompact(v)} stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={95} />
            <Tooltip 
              formatter={(value: number) => formatCurrency(value)} 
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    } else if (chartType === 'balanco') {
      const data = getBalancoChartData();
      return (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={80}
              innerRadius={40}
              dataKey="value"
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
              fontSize={10}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value: number) => formatCurrency(value)} 
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      );
    } else if (chartType === 'margens') {
      const data = getMargensChartData();
      return (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ left: 20, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis tickFormatter={(v) => `${v}%`} stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <Tooltip 
              formatter={(value: number) => `${value.toFixed(2)}%`} 
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Presentation className="w-6 h-6 text-primary" />
            Apresentação com IA
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {!slides.length && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <Presentation className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Gerar Apresentação Executiva</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                Nossa IA irá criar uma apresentação profissional com slides, gráficos visuais 
                e análises sobre a situação financeira da empresa.
              </p>
              <Button onClick={generatePresentation} variant="hero" size="lg">
                <Presentation className="w-5 h-5 mr-2" />
                Gerar Apresentação
              </Button>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
              <span className="text-muted-foreground">Gerando apresentação executiva...</span>
            </div>
          ) : (
            <div className="space-y-4" ref={slideRef}>
              {/* Slide Display */}
              <Card className={`bg-gradient-to-br ${getHighlightClass(slides[currentSlide]?.highlight)} border-2 min-h-[350px] flex flex-col`}>
                <CardContent className="flex-1 p-6 flex flex-col">
                  {/* Slide Header */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`p-2 rounded-full bg-background/50 ${getIconColor(slides[currentSlide]?.highlight)}`}>
                      {slides[currentSlide]?.type === 'charts' ? <PieChartIcon className="w-6 h-6" /> : slides[currentSlide]?.icon}
                    </div>
                    <h2 className="text-xl font-bold">{slides[currentSlide]?.title}</h2>
                  </div>
                  
                  {/* Slide Content */}
                  <div className="flex-1">
                    {slides[currentSlide]?.type === 'cover' ? (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <Building className="w-16 h-16 text-primary mb-4" />
                        {slides[currentSlide]?.content.map((item, idx) => (
                          <p key={idx} className="text-lg text-muted-foreground mb-2">{item}</p>
                        ))}
                      </div>
                    ) : slides[currentSlide]?.type === 'charts' && slides[currentSlide]?.chartType ? (
                      <div className="h-full flex items-center justify-center">
                        {renderChart(slides[currentSlide].chartType!)}
                      </div>
                    ) : (
                      <ScrollArea className="h-[200px] pr-4">
                        <ul className="space-y-3">
                          {slides[currentSlide]?.content.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-3">
                              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                                slides[currentSlide]?.highlight === 'positive' ? 'bg-green-500' :
                                slides[currentSlide]?.highlight === 'negative' ? 'bg-red-500' :
                                'bg-primary'
                              }`} />
                              <span className="text-foreground/90 leading-relaxed text-sm">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    )}
                  </div>

                  {/* Slide Number */}
                  <div className="text-center text-sm text-muted-foreground mt-4">
                    Slide {currentSlide + 1} de {slides.length}
                  </div>
                </CardContent>
              </Card>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={prevSlide} 
                  disabled={currentSlide === 0}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Anterior
                </Button>
                
                {/* Slide indicators */}
                <div className="flex gap-1.5 flex-wrap justify-center max-w-[300px]">
                  {slides.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentSlide(idx)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        idx === currentSlide 
                          ? 'bg-primary scale-125' 
                          : 'bg-muted hover:bg-muted-foreground/50'
                      }`}
                    />
                  ))}
                </div>

                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={nextSlide} 
                  disabled={currentSlide === slides.length - 1}
                >
                  Próximo
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {slides.length > 0 && !isLoading && (
          <div className="flex flex-wrap justify-between items-center gap-2 pt-4 border-t border-border">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={generatePresentation}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Nova
              </Button>
              <Button size="sm" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {copied ? "Copiado!" : "Copiar"}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExportPDF}
                disabled={isExporting}
              >
                {isExporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
                PDF
              </Button>
              <Button 
                variant="neon" 
                size="sm" 
                onClick={handleExportPPTX}
                disabled={isExporting}
              >
                {isExporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}
                PowerPoint
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
