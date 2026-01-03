import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { FileUpload } from "@/components/FileUpload";
import { ArrowLeft, Loader2, ArrowRight, Download, LogOut, FileSearch } from "lucide-react";
import { uploadAndProcessFiles, generateDownloadableJSON } from "@/lib/supabaseUpload";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { XLSValidationMode } from "@/components/XLSValidationMode";
import type { ValidationRow } from "@/lib/brazilianParser"; // ✅ TIPO ÚNICO

const Upload = () => {
  const [dreFile, setDreFile] = useState<File | null>(null);
  const [balancoFile, setBalancoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [validationRows, setValidationRows] = useState<ValidationRow[]>([]);
  const [lastResult, setLastResult] = useState<any>(null);

  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();

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

  return (
    <div className="min-h-screen bg-background">
      <nav className="container mx-auto px-6 py-6 flex justify-between">
        <Logo />
        <Button onClick={signOut} variant="ghost">
          <LogOut className="w-4 h-4 mr-2" /> Sair
        </Button>
      </nav>

      <main className="container mx-auto px-6 py-12 max-w-2xl">
        <FileUpload label="DRE" onFileSelect={setDreFile} />
        <FileUpload label="Balanço Patrimonial" onFileSelect={setBalancoFile} />

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
      </main>
    </div>
  );
};

export default Upload;
