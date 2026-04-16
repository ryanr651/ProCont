import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MultiFileUpload, type UploadedFile } from "@/components/MultiFileUpload";
import { identifyFileTypes, uploadAndProcessMultipleFiles } from "@/lib/supabaseUpload";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { FileText, Loader2, Sparkles, AlertTriangle } from "lucide-react";

interface ImportedFile {
  tipo: string;
  label: string;
}

interface AddFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId: string;
  importedFiles: ImportedFile[];
  onProcessingComplete: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  DRE: "DRE",
  BALANCO_PATRIMONIAL: "Balanço Patrimonial",
  BALANCETE: "Balancete",
  FATURAMENTO: "Relatório de Faturamento",
  DESCONHECIDO: "Não identificado",
};

const TYPE_BADGE_CLASSES: Record<string, string> = {
  DRE: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  BALANCO_PATRIMONIAL: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  BALANCETE: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
  FATURAMENTO: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  DESCONHECIDO: "bg-muted text-muted-foreground border-border",
};

export function AddFilesDialog({
  open,
  onOpenChange,
  empresaId,
  importedFiles,
  onProcessingComplete,
}: AddFilesDialogProps) {
  const { user } = useAuth();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [fileTypes, setFileTypes] = useState<Array<{ filename: string; tipo: string; confianca: string }>>([]);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState("");
  const [confirmReplace, setConfirmReplace] = useState<{ tipo: string; filename: string } | null>(null);

  const handleFilesChange = useCallback(async (files: UploadedFile[]) => {
    // Check for duplicate filenames against imported files
    // (imported files don't have filenames stored, so we only check within the new batch)
    setUploadedFiles(files);
    setFileTypes([]);
    setConfirmReplace(null);

    if (files.length === 0) return;

    setIsIdentifying(true);
    try {
      const types = await identifyFileTypes(files, setProcessingStage);
      setFileTypes(types);

      // Update files with detected types
      const updatedFiles = files.map((f) => {
        const match = types.find((t) => t.filename === f.file.name);
        return { ...f, detectedType: match ? TYPE_LABELS[match.tipo] || match.tipo : undefined };
      });
      setUploadedFiles(updatedFiles);

      // Check for type conflicts with existing imports
      for (const ft of types) {
        const existing = importedFiles.find((imp) => imp.tipo === ft.tipo);
        if (existing && ft.tipo !== "DESCONHECIDO") {
          setConfirmReplace({ tipo: ft.tipo, filename: ft.filename });
        }
      }
    } catch {
      toast.error("Não foi possível identificar os tipos de arquivo.");
    } finally {
      setIsIdentifying(false);
      setProcessingStage("");
    }
  }, [importedFiles]);

  const handleProcess = async () => {
    if (!user || uploadedFiles.length === 0) return;

    setIsProcessing(true);
    setProcessingStage("Processando novos arquivos e atualizando sua análise...");

    try {
      const result = await uploadAndProcessMultipleFiles(
        uploadedFiles,
        fileTypes,
        user.id,
        empresaId,
        setProcessingStage,
      );

      if (!result.success) {
        toast.error(result.errors.join("\n"));
        return;
      }

      toast.success("Análise atualizada com sucesso!");
      onOpenChange(false);
      resetState();
      onProcessingComplete();
    } catch {
      toast.error("Erro ao processar arquivos.");
    } finally {
      setIsProcessing(false);
      setProcessingStage("");
    }
  };

  const resetState = () => {
    setUploadedFiles([]);
    setFileTypes([]);
    setConfirmReplace(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) resetState();
    onOpenChange(open);
  };

  const hasValidFile = fileTypes.some(
    (ft) => ft.tipo !== "DESCONHECIDO"
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Gerenciar Arquivos da Análise</DialogTitle>
        </DialogHeader>

        {/* Section A: Already imported files */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Arquivos já importados
          </h4>
          {importedFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nenhum arquivo importado ainda.</p>
          ) : (
            <div className="space-y-2">
              {importedFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
                >
                  <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium flex-1">{file.label}</span>
                  <Badge
                    variant="outline"
                    className={`text-xs ${TYPE_BADGE_CLASSES[file.tipo] || TYPE_BADGE_CLASSES.DESCONHECIDO}`}
                  >
                    {TYPE_LABELS[file.tipo] || file.tipo}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section B: Add new files */}
        <div className="space-y-3 pt-2 border-t border-border/50">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Adicionar novos arquivos
          </h4>

          <MultiFileUpload
            files={uploadedFiles}
            onFilesChange={handleFilesChange}
            maxFiles={6}
          />

          {isIdentifying && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="w-4 h-4 animate-pulse text-primary" />
              <span>Identificando tipo do arquivo...</span>
            </div>
          )}

          {fileTypes.length > 0 && !isIdentifying && (
            <div className="flex flex-wrap gap-2">
              {fileTypes.map((ft, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className={`text-xs ${TYPE_BADGE_CLASSES[ft.tipo] || TYPE_BADGE_CLASSES.DESCONHECIDO}`}
                >
                  {TYPE_LABELS[ft.tipo] || ft.tipo}
                </Badge>
              ))}
            </div>
          )}

          {confirmReplace && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-foreground">
                Já existe um arquivo do tipo <strong>{TYPE_LABELS[confirmReplace.tipo]}</strong> nesta análise.
                Ao processar, ele será substituído.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button
            onClick={handleProcess}
            disabled={isProcessing || !hasValidFile || isIdentifying}
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {processingStage || "Processando..."}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Processar e Atualizar Análise
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
