import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles, Copy, Check, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

interface EmpresaContext {
  nome: string;
  cnpj: string;
  cnae: string;
  regime_tributario: string;
  contexto: string | null;
}

interface AIAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dreData: CalculatedDRE | null;
  balancoData: CalculatedBalanco | null;
  empresa?: EmpresaContext;
}

export function AIAnalysisDialog({
  open,
  onOpenChange,
  dreData,
  balancoData,
  empresa,
}: AIAnalysisDialogProps) {
  const [analysis, setAnalysis] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const runAnalysis = async () => {
    if (!dreData || !balancoData) {
      toast({
        title: "Dados insuficientes",
        description: "É necessário ter dados de DRE e Balanço para a análise.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setAnalysis("");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-financials`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            dre: dreData,
            balanco: balancoData,
            empresa,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao gerar análise");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let analysisContent = "";

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
              analysisContent += content;
              setAnalysis(analysisContent);
            }
          } catch {
            // Incomplete JSON, put it back
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
              analysisContent += content;
              setAnalysis(analysisContent);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (error) {
      console.error("Analysis error:", error);
      toast({
        title: "Erro na análise",
        description: error instanceof Error ? error.message : "Erro ao gerar análise com IA",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(analysis);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copiado!",
        description: "Análise copiada para a área de transferência.",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível copiar o texto.",
        variant: "destructive",
      });
    }
  };

  // Simple markdown renderer
  const renderMarkdown = (text: string) => {
    const lines = text.split("\n");
    const elements: JSX.Element[] = [];
    let listItems: string[] = [];
    let inBlockquote = false;
    let blockquoteContent: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 my-2 text-foreground/90">
            {listItems.map((item, i) => (
              <li key={i}>{renderInline(item)}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
    };

    const flushBlockquote = () => {
      if (blockquoteContent.length > 0) {
        elements.push(
          <blockquote key={`quote-${elements.length}`} className="border-l-4 border-primary pl-4 my-3 italic text-muted-foreground bg-muted/30 py-2 rounded-r">
            {blockquoteContent.map((line, i) => (
              <p key={i}>{renderInline(line)}</p>
            ))}
          </blockquote>
        );
        blockquoteContent = [];
        inBlockquote = false;
      }
    };

    const renderInline = (text: string) => {
      // Handle bold **text**
      const parts = text.split(/(\*\*[^*]+\*\*)/g);
      return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        }
        return part;
      });
    };

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();

      // Blockquote
      if (trimmedLine.startsWith(">")) {
        flushList();
        inBlockquote = true;
        blockquoteContent.push(trimmedLine.slice(1).trim());
        return;
      } else if (inBlockquote) {
        flushBlockquote();
      }

      // Headers
      if (trimmedLine.startsWith("## ")) {
        flushList();
        elements.push(
          <h2 key={index} className="text-lg font-bold text-primary mt-6 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            {trimmedLine.slice(3)}
          </h2>
        );
        return;
      }

      if (trimmedLine.startsWith("### ")) {
        flushList();
        elements.push(
          <h3 key={index} className="text-base font-semibold text-foreground mt-4 mb-2">
            {trimmedLine.slice(4)}
          </h3>
        );
        return;
      }

      // List items
      if (trimmedLine.startsWith("- ") || trimmedLine.startsWith("* ")) {
        listItems.push(trimmedLine.slice(2));
        return;
      }

      // Numbered list
      if (/^\d+\.\s/.test(trimmedLine)) {
        flushList();
        const content = trimmedLine.replace(/^\d+\.\s/, "");
        elements.push(
          <div key={index} className="flex gap-2 my-1">
            <span className="text-primary font-semibold min-w-[1.5rem]">{trimmedLine.match(/^\d+/)?.[0]}.</span>
            <span className="text-foreground/90">{renderInline(content)}</span>
          </div>
        );
        return;
      }

      // Regular paragraph
      if (trimmedLine) {
        flushList();
        elements.push(
          <p key={index} className="text-foreground/90 my-2 leading-relaxed">
            {renderInline(trimmedLine)}
          </p>
        );
      }
    });

    flushList();
    flushBlockquote();

    return elements;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-6 h-6 text-primary" />
            Análise Inteligente com IA
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {!analysis && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <Sparkles className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Análise Financeira com IA</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                Nossa IA irá analisar seus dados de DRE e Balanço Patrimonial para gerar 
                insights estratégicos, identificar pontos de atenção e fornecer recomendações.
              </p>
              <Button onClick={runAnalysis} variant="hero" size="lg">
                <Sparkles className="w-5 h-5 mr-2" />
                Gerar Análise
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[60vh] pr-4">
              <div className="space-y-1">
                {isLoading && !analysis && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mr-3" />
                    <span className="text-muted-foreground">Analisando dados financeiros...</span>
                  </div>
                )}
                
                {analysis && (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {renderMarkdown(analysis)}
                    {isLoading && (
                      <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {analysis && !isLoading && (
          <div className="flex justify-between items-center pt-4 border-t border-border">
            <Button variant="outline" onClick={runAnalysis}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Nova Análise
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
                  Copiar Análise
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
