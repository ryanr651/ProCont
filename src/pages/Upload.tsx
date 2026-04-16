import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { MultiFileUpload, type UploadedFile } from "@/components/MultiFileUpload";
import { ArrowLeft, Loader2, Download, Building2, Plus, Check, Sparkles } from "lucide-react";
import { uploadAndProcessMultipleFiles, identifyFileTypes, generateDownloadableJSON } from "@/lib/supabaseUpload";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { XLSValidationMode } from "@/components/XLSValidationMode";
import { Badge } from "@/components/ui/badge";
import type { ValidationRow } from "@/lib/brazilianParser";

interface Empresa {
  id: string;
  nome: string;
  cnpj: string;
}

const TYPE_LABELS: Record<string, string> = {
  DRE: "DRE",
  BALANCO_PATRIMONIAL: "Balanço Patrimonial",
  DMPL: "DMPL",
  FLUXO_CAIXA: "Fluxo de Caixa",
  BALANCETE: "Balancete",
  DRA: "DRA",
  FATURAMENTO: "Faturamento",
  DESCONHECIDO: "Não identificado",
};

const Upload = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [fileTypes, setFileTypes] = useState<Array<{ filename: string; tipo: string; confianca: string }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [processingStage, setProcessingStage] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [validationRows, setValidationRows] = useState<ValidationRow[]>([]);
  const [lastResult, setLastResult] = useState<any>(null);

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<string | null>(null);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, signOut } = useAuth();

  // Pre-select empresa from URL param
  useEffect(() => {
    const empresaIdFromUrl = searchParams.get("empresa_id");
    if (empresaIdFromUrl && !selectedEmpresa) {
      setSelectedEmpresa(empresaIdFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (user) fetchEmpresas();
  }, [user]);

  const fetchEmpresas = async () => {
    try {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, nome, cnpj")
        .eq("user_id", user!.id)
        .order("nome");
      if (error) throw error;
      setEmpresas(data || []);
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar as empresas.", variant: "destructive" });
    } finally {
      setLoadingEmpresas(false);
    }
  };

  // Identify file types when files change
  const handleFilesChange = async (files: UploadedFile[]) => {
    setUploadedFiles(files);
    setFileTypes([]);
    setLastResult(null);

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
    } catch {
      toast({ title: "Aviso", description: "Não foi possível identificar os tipos de arquivo automaticamente.", variant: "default" });
    } finally {
      setIsIdentifying(false);
      setProcessingStage("");
    }
  };

  const handleProcess = async () => {
    if (uploadedFiles.length === 0 || !user || !selectedEmpresa) return;

    setIsProcessing(true);
    setProcessingStage("Iniciando processamento...");

    try {
      const result = await uploadAndProcessMultipleFiles(
        uploadedFiles,
        fileTypes,
        user.id,
        selectedEmpresa,
        setProcessingStage,
        true // cleanAll: limpa todos os dados anteriores da empresa
      );

      if (result.balanco_validation?.length) {
        setValidationRows(result.balanco_validation);
        setShowValidation(true);
      }

      if (!result.success) {
        toast({
          title: "Erro no processamento",
          description: result.errors.join("\n"),
          variant: "destructive",
        });
        return;
      }

      setLastResult(result);

      toast({
        title: "Processamento concluído",
        description: `DRE: ${result.inserted_dre} · Balanço: ${result.inserted_balanco} · Balancete: ${result.inserted_balancete} · Faturamento: ${result.inserted_faturamento} linhas`,
      });

      navigate(`/resultado?empresa_id=${selectedEmpresa}`);
    } catch {
      toast({
        title: "Erro inesperado",
        description: "Falha ao processar arquivos",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProcessingStage("");
    }
  };

  const hasDre = fileTypes.some((ft) => ft.tipo === "DRE");
  const hasBalanco = fileTypes.some((ft) => ft.tipo === "BALANCO_PATRIMONIAL");
  const hasBalancete = fileTypes.some((ft) => ft.tipo === "BALANCETE");
  const hasFaturamento = fileTypes.some((ft) => ft.tipo === "FATURAMENTO");
  const canProcess = uploadedFiles.length > 0 && (hasDre || hasBalanco || hasBalancete || hasFaturamento) && !isIdentifying;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="container mx-auto px-6 pt-24 pb-12 max-w-2xl">
        {/* Step 1: Company Selection */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
              1
            </div>
            <h2 className="font-display text-lg font-semibold">Selecione a Empresa</h2>
          </div>

          {loadingEmpresas ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : empresas.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">Nenhuma empresa cadastrada. Cadastre uma empresa para continuar.</p>
              <Button variant="neon" onClick={() => navigate("/cadastro-empresa")}>
                <Plus className="w-4 h-4 mr-2" />
                Cadastrar Empresa
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {empresas.map((empresa) => (
                <button
                  key={empresa.id}
                  onClick={() => setSelectedEmpresa(empresa.id)}
                  className={`w-full glass-card p-4 flex items-center justify-between text-left transition-colors cursor-pointer ${
                    selectedEmpresa === empresa.id
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{empresa.nome}</p>
                      <p className="text-xs text-muted-foreground">{empresa.cnpj}</p>
                    </div>
                  </div>
                  {selectedEmpresa === empresa.id && (
                    <Check className="w-5 h-5 text-primary" />
                  )}
                </button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => navigate("/cadastro-empresa")}
              >
                <Plus className="w-4 h-4 mr-2" />
                Cadastrar Nova Empresa
              </Button>
            </div>
          )}
        </div>

        {/* Step 2: File Upload */}
        {selectedEmpresa && (
          <div className="animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                2
              </div>
              <h2 className="font-display text-lg font-semibold">Importar Arquivos</h2>
            </div>

            <MultiFileUpload
              files={uploadedFiles}
              onFilesChange={handleFilesChange}
              maxFiles={6}
            />

            {/* AI identification status */}
            {isIdentifying && (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4 animate-pulse text-primary" />
                <span>IA identificando tipos de demonstração...</span>
              </div>
            )}

            {/* Detected types summary */}
            {fileTypes.length > 0 && !isIdentifying && (
              <div className="mt-3 flex flex-wrap gap-2">
                {fileTypes.map((ft, i) => (
                  <Badge
                    key={i}
                    variant={ft.tipo === "DESCONHECIDO" ? "outline" : "secondary"}
                    className="text-xs"
                  >
                    {TYPE_LABELS[ft.tipo] || ft.tipo}
                  </Badge>
                ))}
              </div>
            )}

            {/* Warning if no DRE/Balanço identified */}
            {fileTypes.length > 0 && !hasDre && !hasBalanco && !hasBalancete && !hasFaturamento && !isIdentifying && (
              <p className="mt-2 text-sm text-destructive">
                Nenhum arquivo foi identificado como DRE, Balanço Patrimonial, Balancete ou Faturamento. Verifique os arquivos.
              </p>
            )}

            <Button
              className="mt-6 w-full"
              onClick={handleProcess}
              disabled={isProcessing || !canProcess}
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="animate-spin w-4 h-4" />
                  {processingStage || "Processando..."}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Processar com IA
                </span>
              )}
            </Button>

            {showValidation && (
              <XLSValidationMode
                rows={validationRows}
                filename="balanco.xls"
                onClose={() => setShowValidation(false)}
              />
            )}

            {lastResult && (
              <div className="flex gap-4 mt-6">
                <Button onClick={() => generateDownloadableJSON(lastResult.dre_entries, "dre.json")}>
                  <Download className="w-4 h-4 mr-2" /> DRE
                </Button>
                <Button onClick={() => generateDownloadableJSON(lastResult.balanco_entries, "balanco.json")}>
                  <Download className="w-4 h-4 mr-2" /> Balanço
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Upload;
