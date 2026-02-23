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
          .chart-placeholder { text-align: center; padding: 40px; color: #94a3b8; font-style: italic; background: #f1f5f9; border-radius: 12px; border: 2px dashed #cbd5e1; }

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
                ${slide.type === 'charts' ? `
                  <div class="chart-placeholder">📈 Gráficos interativos disponíveis na versão PowerPoint</div>
                ` : `
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

      // Logo (if available)
      if (branding?.logo_url) {
        try {
          coverSlide.addImage({ path: branding.logo_url, x: 5.17, y: 0.8, w: 3, h: 1, sizing: { type: 'contain', w: 3, h: 1 } });
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
            const chartData = [{
              name: 'DRE',
              labels: ['Receita Líquida', 'CMV / Custos', 'Lucro Bruto', 'Desp. Operacionais', 'Lucro Líquido'],
              values: [
                Math.abs(dreData.receitaLiquida), Math.abs(dreData.cmv),
                Math.abs(dreData.lucroBruto), Math.abs(dreData.despesasOperacionais),
                Math.abs(dreData.lucroLiquido)
              ]
            }];
            pptSlide.addChart(pptx.ChartType.bar, chartData, {
              x: 1, y: 1.8, w: 11.33, h: 4.6,
              showValue: true,
              catAxisLabelFontSize: 11, valAxisLabelFontSize: 9,
              chartColors: [colors.accent, colors.red, colors.emerald, colors.amber, colors.cyan],
              plotArea: { fill: { color: colors.white } },
              catGridLine: { style: 'none' },
              valGridLine: { color: colors.border, style: 'dash' },
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
            pptSlide.addChart(pptx.ChartType.doughnut, chartData, {
              x: 2, y: 1.8, w: 9.33, h: 4.6,
              showPercent: true, showLegend: true, legendPos: 'r',
              legendFontSize: 12,
              chartColors: [colors.accent, colors.cyan, colors.amber, colors.red, colors.emerald],
            });
          } else if (slide.chartType === 'margens') {
            const chartData = [{
              name: 'Margens (%)',
              labels: ['Margem Bruta', 'Margem Operacional', 'Margem Líquida'],
              values: [dreData.margemBruta, dreData.margemOperacional, dreData.margemLiquida]
            }];
            pptSlide.addChart(pptx.ChartType.bar, chartData, {
              x: 1.5, y: 1.8, w: 10.33, h: 4.6,
              showValue: true,
              catAxisLabelFontSize: 13, valAxisLabelFontSize: 10,
              valAxisTitle: 'Percentual (%)', valAxisTitleFontSize: 10,
              chartColors: [colors.accent, colors.cyan, colors.emerald],
              plotArea: { fill: { color: colors.white } },
              catGridLine: { style: 'none' },
              valGridLine: { color: colors.border, style: 'dash' },
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
