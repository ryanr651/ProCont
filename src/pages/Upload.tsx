import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FileUpload } from "@/components/FileUpload";
import { ArrowLeft, Loader2, ArrowRight, Download, LogOut, FileSearch, Building2, Plus, Check } from "lucide-react";
import { uploadAndProcessFiles, generateDownloadableJSON } from "@/lib/supabaseUpload";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { XLSValidationMode } from "@/components/XLSValidationMode";
import type { ValidationRow } from "@/lib/brazilianParser";

interface Empresa {
  id: string;
  nome: string;
  cnpj: string;
}

const Upload = () => {
  const [dreFile, setDreFile] = useState<File | null>(null);
  const [balancoFile, setBalancoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [validationRows, setValidationRows] = useState<ValidationRow[]>([]);
  const [lastResult, setLastResult] = useState<any>(null);

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<string | null>(null);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);

  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();

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

  const handleProcess = async () => {
    if (!dreFile || !balancoFile || !user) return;

    setIsProcessing(true);

    try {
      const result = await uploadAndProcessFiles(dreFile, balancoFile, user.id);

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
        description: "Arquivos processados com sucesso",
      });

      navigate("/resultado");
    } catch (err) {
      toast({
        title: "Erro inesperado",
        description: "Falha ao processar arquivos",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const empresaSelecionada = empresas.find(e => e.id === selectedEmpresa);

  return (
    <div className="min-h-screen bg-background">
      <nav className="container mx-auto px-6 py-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Logo />
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button onClick={signOut} variant="ghost">
            <LogOut className="w-4 h-4 mr-2" /> Sair
          </Button>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12 max-w-2xl">
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

        {/* Step 2: File Upload (only if company selected) */}
        {selectedEmpresa && (
          <div className="animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                2
              </div>
              <h2 className="font-display text-lg font-semibold">Importar Arquivos</h2>
            </div>

            <FileUpload label="DRE" description="Demonstração do Resultado do Exercício" onFileSelect={setDreFile} />
            <FileUpload label="Balanço Patrimonial" description="Balanço Patrimonial da empresa" onFileSelect={setBalancoFile} />

            <Button className="mt-6 w-full" onClick={handleProcess} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="animate-spin" /> : "Processar"}
            </Button>

            {showValidation && (
              <XLSValidationMode
                rows={validationRows}
                filename={balancoFile?.name ?? "balanco.xls"}
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
