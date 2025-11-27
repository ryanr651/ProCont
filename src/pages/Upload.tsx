import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { FileUpload } from "@/components/FileUpload";
import { ArrowLeft, Loader2, ArrowRight } from "lucide-react";
import { analyzeFinancials, FinancialAnalysis } from "@/lib/fileParser";
import { useToast } from "@/hooks/use-toast";

const Upload = () => {
  const [dreFile, setDreFile] = useState<File | null>(null);
  const [balancoFile, setBalancoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleProcess = async () => {
    if (!dreFile || !balancoFile) {
      toast({
        title: "Arquivos necessários",
        description: "Por favor, envie os arquivos de DRE e Balanço Patrimonial.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    try {
      const analysis = await analyzeFinancials(dreFile, balancoFile);
      
      // Store analysis in sessionStorage to pass to results page
      sessionStorage.setItem("fintrix-analysis", JSON.stringify(analysis));
      
      toast({
        title: "Processamento concluído!",
        description: "Os arquivos foram analisados com sucesso.",
      });

      navigate("/resultado");
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

  return (
    <div className="min-h-screen bg-background relative">
      {/* Background effects */}
      <div className="hero-glow w-full h-[400px] top-0 left-0" />

      {/* Navigation */}
      <nav className="relative z-10 container mx-auto px-6 py-6 flex items-center justify-between">
        <Logo />
        <Link to="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </Link>
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
              Os arquivos serão processados localmente.
              <br />
              Formatos aceitos: CSV, XLS, XLSX
            </p>
          </div>

          {/* Info Card */}
          <div className="mt-12 glass-card p-6">
            <h3 className="font-display font-semibold mb-3">💡 Dica</h3>
            <p className="text-sm text-muted-foreground">
              O sistema reconhece automaticamente o layout dos arquivos exportados por sistemas contábeis brasileiros 
              como Domínio Sistemas. Certifique-se de que os arquivos contêm as informações de DRE e Balanço Patrimonial 
              em formato tabular.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Upload;
