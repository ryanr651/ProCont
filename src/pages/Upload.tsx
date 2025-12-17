import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { FileUpload } from "@/components/FileUpload";
import { ArrowLeft, Loader2, ArrowRight, Download, LogOut } from "lucide-react";
import { uploadAndProcessFiles, generateDownloadableJSON } from "@/lib/supabaseUpload";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const Upload = () => {
  const [dreFile, setDreFile] = useState<File | null>(null);
  const [balancoFile, setBalancoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<{
    dre_entries?: unknown[];
    balanco_entries?: unknown[];
  } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();

  const handleProcess = async () => {
    if (!dreFile || !balancoFile) {
      toast({
        title: "Arquivos necessários",
        description: "Por favor, envie os arquivos de DRE e Balanço Patrimonial.",
        variant: "destructive"
      });
      return;
    }

    if (!user) {
      toast({
        title: "Autenticação necessária",
        description: "Faça login para processar os arquivos.",
        variant: "destructive"
      });
      navigate("/auth");
      return;
    }

    setIsProcessing(true);

    try {
      const result = await uploadAndProcessFiles(dreFile, balancoFile, user.id);
      
       if (result.success) {
         // Se o backend considerou "parsed" mas nada foi persistido, não navegar para /resultado
         // (a página vai redirecionar de volta e a UX fica confusa).
         if ((result.inserted_dre ?? 0) === 0 && (result.inserted_balanco ?? 0) === 0) {
           toast({
             title: "Arquivos lidos, mas sem linhas geradas",
             description: "Os arquivos foram lidos, porém nenhuma linha contábil foi materializada para salvar. Verifique o formato/exportação e tente novamente.",
             variant: "destructive",
           });
           return;
         }

         setLastResult({
           dre_entries: result.dre_entries,
           balanco_entries: result.balanco_entries
         });

         toast({
           title: "Processamento concluído!",
           description: `${result.inserted_dre} linhas de DRE e ${result.inserted_balanco} linhas de Balanço inseridas.`,
         });

         navigate("/resultado");
       } else {
         toast({
           title: "Erro no processamento",
           description: result.errors.join('\n'),
           variant: "destructive"
         });
       }
    } catch (error) {
      console.error("Error processing files:", error);
      toast({
        title: "Erro no processamento",
        description: error instanceof Error ? error.message : "Ocorreu um erro ao processar os arquivos.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadDRE = () => {
    if (lastResult?.dre_entries) {
      generateDownloadableJSON(lastResult.dre_entries, 'normalized_dre.json');
    }
  };

  const handleDownloadBalanco = () => {
    if (lastResult?.balanco_entries) {
      generateDownloadableJSON(lastResult.balanco_entries, 'normalized_balanco.json');
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background relative">
      {/* Background effects */}
      <div className="hero-glow w-full h-[400px] top-0 left-0" />

      {/* Navigation */}
      <nav className="relative z-10 container mx-auto px-6 py-6 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:block">
            {user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </Link>
        </div>
      </nav>

      <main className="relative z-10 container mx-auto px-6 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="font-display text-4xl font-bold mb-4">
              Enviar <span className="gradient-text">Arquivos</span>
            </h1>
            <p className="text-muted-foreground">
              Faça upload dos arquivos de DRE e Balanço Patrimonial para gerar a análise financeira automatizada.
            </p>
          </div>

          {/* Upload Forms */}
          <div className="space-y-6 mb-8">
            <FileUpload
              label="Arquivo de DRE"
              description="Demonstração do Resultado do Exercício"
              onFileSelect={setDreFile}
            />

            <FileUpload
              label="Arquivo de Balanço Patrimonial"
              description="Balanço Patrimonial da empresa"
              onFileSelect={setBalancoFile}
            />
          </div>

          {/* Process Button */}
          <div className="flex flex-col items-center gap-4">
            <Button
              variant="hero"
              size="xl"
              className="w-full sm:w-auto"
              onClick={handleProcess}
              disabled={!dreFile || !balancoFile || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  Processar Arquivos
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </Button>

            <p className="text-sm text-muted-foreground text-center">
              Os dados serão salvos no banco de dados.
              <br />
              Formatos aceitos: CSV (separador ;), XLS, XLSX
            </p>
          </div>

          {/* Download buttons after processing */}
          {lastResult && (
            <div className="mt-8 flex justify-center gap-4">
              <Button variant="glass" size="sm" onClick={handleDownloadDRE}>
                <Download className="w-4 h-4 mr-2" />
                Download DRE JSON
              </Button>
              <Button variant="glass" size="sm" onClick={handleDownloadBalanco}>
                <Download className="w-4 h-4 mr-2" />
                Download Balanço JSON
              </Button>
            </div>
          )}

          {/* Info Card */}
          <div className="mt-12 glass-card p-6">
            <h3 className="font-display font-semibold mb-3">💡 Dica</h3>
            <p className="text-sm text-muted-foreground">
              O sistema reconhece automaticamente arquivos CSV com separador ponto-e-vírgula (;), 
              valores no formato brasileiro (1.234,56) e valores negativos entre parênteses.
              Compatível com exports do Domínio Sistemas e outros sistemas contábeis brasileiros.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Upload;
