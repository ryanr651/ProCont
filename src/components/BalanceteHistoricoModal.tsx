import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, CalendarDays, FileSpreadsheet } from "lucide-react";
import { parseBalanceteFileAuto, type ParsedBalanceteEntry } from "@/lib/brazilianParser";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface PreviousPeriodBalancete {
  ano: string;
  entries: ParsedBalanceteEntry[];
}

interface BalanceteHistoricoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPeriodo: string;
  existingPeriods: string[];
  onPeriodAdded: (period: PreviousPeriodBalancete) => void;
}

export function BalanceteHistoricoModal({
  open,
  onOpenChange,
  currentPeriodo,
  existingPeriods,
  onPeriodAdded,
}: BalanceteHistoricoModalProps) {
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Generate year options (last 10 years, excluding current period year)
  const currentYear = new Date().getFullYear();
  const currentPeriodoYear = currentPeriodo ? currentPeriodo.split("/").pop() || currentPeriodo.slice(0, 4) : String(currentYear);
  
  const yearOptions = Array.from({ length: 10 }, (_, i) => String(currentYear - i))
    .filter(y => y !== currentPeriodoYear && !existingPeriods.includes(y));

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      const ext = selected.name.split(".").pop()?.toLowerCase();
      if (!["xls", "xlsx", "csv"].includes(ext || "")) {
        toast({ title: "Formato inválido", description: "Use arquivos XLS, XLSX ou CSV.", variant: "destructive" });
        return;
      }
      setFile(selected);
    }
  };

  const handleProcess = async () => {
    if (!selectedYear || !file) return;

    setIsProcessing(true);
    setProcessingStage("Analisando arquivo do balancete...");

    try {
      // Parse the file
      const result = await parseBalanceteFileAuto(file);

      if (!result.parsed || result.entries.length === 0) {
        toast({
          title: "Erro ao processar",
          description: "Não foi possível extrair dados do balancete. Verifique se o arquivo está no formato correto.",
          variant: "destructive",
        });
        return;
      }

      // AI classification
      setProcessingStage("IA classificando contas...");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (token) {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/classify-accounts`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
              body: JSON.stringify({
                entries: result.entries.map((e, i) => ({
                  descricao: e.conta,
                  valor: e.saldo_atual,
                  posicao_relativa: i,
                  contexto_pai: e.contexto_pai || "",
                })),
                contexto_tipo: "balancete",
              }),
            }
          );

          if (response.ok) {
            const aiResult = await response.json();
            if (aiResult?.classifications?.length) {
              for (let i = 0; i < result.entries.length; i++) {
                const classification = aiResult.classifications[i];
                if (classification) {
                  result.entries[i].grupo = classification.grupo;
                }
              }
            }
          }
        } catch {
          console.warn("AI classification failed for historical balancete, using defaults");
        }
      }

      onPeriodAdded({ ano: selectedYear, entries: result.entries });
      toast({
        title: "Exercício adicionado!",
        description: `Balancete de ${selectedYear} importado com ${result.entries.length} contas.`,
      });

      // Reset and close
      setSelectedYear("");
      setFile(null);
      onOpenChange(false);
    } catch (error) {
      console.error("Error processing historical balancete:", error);
      toast({
        title: "Erro no processamento",
        description: "Ocorreu um erro ao processar o arquivo. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProcessingStage("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            Adicionar Exercício Anterior
          </DialogTitle>
          <DialogDescription>
            Importe um balancete de exercício anterior para realizar a Análise Vertical e Horizontal comparativa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Year Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Ano do Exercício</label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o ano..." />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map(year => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Exercício atual: <strong>{currentPeriodoYear}</strong> (não pode ser selecionado)
            </p>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Arquivo do Balancete</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border/60 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium text-foreground">{file.name}</span>
                </div>
              ) : (
                <div>
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Clique para selecionar o arquivo</p>
                  <p className="text-xs text-muted-foreground mt-1">XLS, XLSX ou CSV</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Processing indicator */}
          {isProcessing && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              {processingStage}
            </div>
          )}

          {/* Submit */}
          <Button
            className="w-full"
            onClick={handleProcess}
            disabled={!selectedYear || !file || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Importar Balancete
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
