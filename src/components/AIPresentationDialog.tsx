import { useState } from "react";
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
  PieChart
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  type: 'cover' | 'overview' | 'profitability' | 'liquidity' | 'structure' | 'strengths' | 'risks' | 'recommendations' | 'conclusion';
  title: string;
  content: string[];
  icon?: React.ReactNode;
  highlight?: 'positive' | 'negative' | 'neutral';
}

interface AIPresentationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dreData: CalculatedDRE | null;
  balancoData: CalculatedBalanco | null;
  empresaNome?: string;
}

export function AIPresentationDialog({
  open,
  onOpenChange,
  dreData,
  balancoData,
  empresaNome = "Empresa"
}: AIPresentationDialogProps) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rawContent, setRawContent] = useState("");
  const { toast } = useToast();

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
    
    // Cover slide with company data
    const formatCurrency = (value: number) => 
      value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    
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

    // Try to parse structured JSON from AI response
    try {
      // Look for JSON block in response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const aiData = JSON.parse(jsonMatch[0]);
        
        // Overview slide
        if (aiData.resumo) {
          slides.push({
            type: 'overview',
            title: 'Visão Geral',
            content: Array.isArray(aiData.resumo) ? aiData.resumo : [aiData.resumo],
            icon: <PieChart className="w-8 h-8" />,
            highlight: 'neutral'
          });
        }

        // Profitability slide
        if (aiData.rentabilidade) {
          slides.push({
            type: 'profitability',
            title: 'Análise de Rentabilidade',
            content: Array.isArray(aiData.rentabilidade) ? aiData.rentabilidade : [aiData.rentabilidade],
            icon: <DollarSign className="w-8 h-8" />,
            highlight: dre.margemLiquida > 5 ? 'positive' : dre.margemLiquida < 0 ? 'negative' : 'neutral'
          });
        }

        // Liquidity slide
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

        // Structure slide
        if (aiData.estrutura) {
          slides.push({
            type: 'structure',
            title: 'Estrutura de Capital',
            content: Array.isArray(aiData.estrutura) ? aiData.estrutura : [aiData.estrutura],
            icon: <Building className="w-8 h-8" />,
            highlight: 'neutral'
          });
        }

        // Strengths slide
        if (aiData.pontosFortes && aiData.pontosFortes.length > 0) {
          slides.push({
            type: 'strengths',
            title: 'Pontos Fortes',
            content: aiData.pontosFortes,
            icon: <CheckCircle2 className="w-8 h-8" />,
            highlight: 'positive'
          });
        }

        // Risks slide
        if (aiData.pontosAtencao && aiData.pontosAtencao.length > 0) {
          slides.push({
            type: 'risks',
            title: 'Pontos de Atenção',
            content: aiData.pontosAtencao,
            icon: <AlertTriangle className="w-8 h-8" />,
            highlight: 'negative'
          });
        }

        // Recommendations slide
        if (aiData.recomendacoes && aiData.recomendacoes.length > 0) {
          slides.push({
            type: 'recommendations',
            title: 'Recomendações Estratégicas',
            content: aiData.recomendacoes,
            icon: <Target className="w-8 h-8" />,
            highlight: 'neutral'
          });
        }

        // Conclusion slide
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

    // If no slides were parsed, create default ones with numbers
    if (slides.length <= 1) {
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
                Nossa IA irá criar uma apresentação profissional com slides sobre a situação 
                financeira da empresa, incluindo análises, indicadores e recomendações estratégicas.
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
              {rawContent && (
                <div className="mt-4 max-w-md text-xs text-muted-foreground/50 text-center">
                  Processando dados...
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Slide Display */}
              <Card className={`bg-gradient-to-br ${getHighlightClass(slides[currentSlide]?.highlight)} border-2 min-h-[350px] flex flex-col`}>
                <CardContent className="flex-1 p-8 flex flex-col">
                  {/* Slide Header */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`p-3 rounded-full bg-background/50 ${getIconColor(slides[currentSlide]?.highlight)}`}>
                      {slides[currentSlide]?.icon}
                    </div>
                    <h2 className="text-2xl font-bold">{slides[currentSlide]?.title}</h2>
                  </div>
                  
                  {/* Slide Content */}
                  <div className="flex-1">
                    {slides[currentSlide]?.type === 'cover' ? (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="mb-6">{slides[currentSlide]?.icon}</div>
                        {slides[currentSlide]?.content.map((item, idx) => (
                          <p key={idx} className="text-lg text-muted-foreground mb-2">{item}</p>
                        ))}
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
                              <span className="text-foreground/90 leading-relaxed">{item}</span>
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
                  onClick={prevSlide} 
                  disabled={currentSlide === 0}
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Anterior
                </Button>
                
                {/* Slide indicators */}
                <div className="flex gap-2">
                  {slides.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentSlide(idx)}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        idx === currentSlide 
                          ? 'bg-primary scale-125' 
                          : 'bg-muted hover:bg-muted-foreground/50'
                      }`}
                    />
                  ))}
                </div>

                <Button 
                  variant="outline" 
                  onClick={nextSlide} 
                  disabled={currentSlide === slides.length - 1}
                >
                  Próximo
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {slides.length > 0 && !isLoading && (
          <div className="flex justify-between items-center pt-4 border-t border-border">
            <Button variant="outline" onClick={generatePresentation}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Nova Apresentação
            </Button>
            <Button onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar Texto
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
