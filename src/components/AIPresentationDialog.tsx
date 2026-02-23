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
      // Create a container for all slides
      const container = document.createElement('div');
      container.style.cssText = 'background: white; padding: 40px; width: 1000px;';
      
      // Add header
      const header = document.createElement('div');
      const brandName = branding?.nome_empresa || 'ProCont';
      header.innerHTML = `
        <div style="text-align: center; margin-bottom: 40px; border-bottom: 3px solid #8b5cf6; padding-bottom: 20px;">
          ${branding?.logo_url ? `<img src="${branding.logo_url}" alt="Logo" style="max-height: 60px; max-width: 200px; margin-bottom: 10px;" crossorigin="anonymous" />` : ''}
          <h1 style="color: #1a1a2e; font-size: 28px; margin: 0;">📊 Apresentação Executiva</h1>
          <p style="color: #444; margin-top: 8px; font-weight: 600;">${brandName}</p>
          ${branding?.cnpj_empresa ? `<p style="color: #666; margin-top: 2px; font-size: 13px;">CNPJ: ${branding.cnpj_empresa}</p>` : ''}
          <p style="color: #666; margin-top: 6px;">${empresaNome} - ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      `;
      container.appendChild(header);

      // Add each slide as a section
      slides.forEach((slide, index) => {
        const slideDiv = document.createElement('div');
        slideDiv.style.cssText = 'margin-bottom: 40px; page-break-inside: avoid;';
        
        const highlightColor = slide.highlight === 'positive' ? '#10b981' : 
                               slide.highlight === 'negative' ? '#ef4444' : '#8b5cf6';
        
        slideDiv.innerHTML = `
          <div style="border-left: 4px solid ${highlightColor}; padding-left: 20px; margin-bottom: 20px;">
            <h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 15px 0;">${slide.title}</h2>
            ${slide.type === 'charts' ? `
              <p style="color: #666; font-style: italic;">📈 Gráfico disponível na versão PowerPoint</p>
            ` : `
              <ul style="margin: 0; padding-left: 20px; color: #333;">
                ${slide.content.map(item => `<li style="margin-bottom: 8px; line-height: 1.6;">${item}</li>`).join('')}
              </ul>
            `}
          </div>
        `;
        container.appendChild(slideDiv);
      });

      // Add footer
      const footer = document.createElement('div');
      footer.innerHTML = `
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px;">
          Gerado por ${branding?.nome_empresa || 'ProCont'} com Inteligência Artificial
          ${branding?.telefone_fixo ? `<br/>Contato: ${branding.telefone_fixo}` : ''}
        </div>
      `;
      container.appendChild(footer);

      document.body.appendChild(container);

      const opt = {
        margin: 10,
        filename: `apresentacao-${empresaNome.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
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

      // Define master slide
      pptx.defineSlideMaster({
        title: 'MASTER_SLIDE',
        background: { color: 'FFFFFF' },
        objects: [
          { rect: { x: 0, y: '90%', w: '100%', h: '10%', fill: { color: '8b5cf6' } } },
          { text: { text: `${brandName} - Análise Financeira com IA${branding?.telefone_fixo ? ` | ${branding.telefone_fixo}` : ''}`, options: { x: 0.5, y: '92%', w: '90%', h: 0.5, fontSize: 10, color: 'FFFFFF' } } }
        ]
      });

      slides.forEach((slide, index) => {
        const pptSlide = pptx.addSlide({ masterName: 'MASTER_SLIDE' });

        // Slide title
        pptSlide.addText(slide.title, {
          x: 0.5,
          y: 0.3,
          w: 9,
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: '1a1a2e'
        });

        if (slide.type === 'charts' && slide.chartType) {
          // Add charts
          if (slide.chartType === 'dre') {
            const chartData = [
              {
                name: 'DRE',
                labels: ['Receita Líq.', 'CMV', 'Lucro Bruto', 'Desp. Op.', 'Lucro Líq.'],
                values: [
                  Math.abs(dreData.receitaLiquida),
                  Math.abs(dreData.cmv),
                  Math.abs(dreData.lucroBruto),
                  Math.abs(dreData.despesasOperacionais),
                  Math.abs(dreData.lucroLiquido)
                ]
              }
            ];
            pptSlide.addChart(pptx.ChartType.bar, chartData, {
              x: 0.5,
              y: 1.5,
              w: 9,
              h: 4,
              showValue: true,
              valAxisTitle: 'Valores (R$)',
              chartColors: ['8b5cf6', 'ef4444', '10b981', 'f59e0b', '06b6d4']
            });
          } else if (slide.chartType === 'balanco') {
            const chartData = [
              {
                name: 'Estrutura',
                labels: ['Ativo Circ.', 'Ativo Não Circ.', 'Passivo Circ.', 'Passivo Não Circ.', 'Patrimônio Líq.'],
                values: [
                  balancoData.ativoCirculante,
                  balancoData.ativoNaoCirculante,
                  balancoData.passivoCirculante,
                  balancoData.passivoNaoCirculante,
                  balancoData.patrimonioLiquido
                ]
              }
            ];
            pptSlide.addChart(pptx.ChartType.pie, chartData, {
              x: 1.5,
              y: 1.5,
              w: 7,
              h: 4,
              showPercent: true,
              showLegend: true,
              legendPos: 'r',
              chartColors: ['8b5cf6', '06b6d4', 'f59e0b', 'ef4444', '10b981']
            });
          } else if (slide.chartType === 'margens') {
            const chartData = [
              {
                name: 'Margens',
                labels: ['Margem Bruta', 'Margem Operacional', 'Margem Líquida'],
                values: [dreData.margemBruta, dreData.margemOperacional, dreData.margemLiquida]
              }
            ];
            pptSlide.addChart(pptx.ChartType.bar, chartData, {
              x: 1,
              y: 1.5,
              w: 8,
              h: 4,
              showValue: true,
              valAxisTitle: 'Percentual (%)',
              chartColors: ['8b5cf6', '06b6d4', '10b981']
            });
          }
        } else if (slide.type === 'cover') {
          // Cover slide special treatment
          pptSlide.addText(slide.content.join('\n'), {
            x: 0.5,
            y: 2.5,
            w: 9,
            h: 2,
            fontSize: 18,
            color: '666666',
            align: 'center'
          });
        } else {
          // Regular content slides with bullet points
          const bulletPoints = slide.content.map(item => ({
            text: item,
            options: { bullet: true, color: '333333', fontSize: 16 }
          }));

          pptSlide.addText(bulletPoints, {
            x: 0.5,
            y: 1.5,
            w: 9,
            h: 4,
            valign: 'top'
          });
        }
      });

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
