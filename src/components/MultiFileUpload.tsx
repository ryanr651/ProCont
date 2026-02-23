import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Upload, FileSpreadsheet, X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface UploadedFile {
  file: File;
  id: string;
  detectedType?: string;
}

interface MultiFileUploadProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
  accept?: string;
  className?: string;
}

export function MultiFileUpload({
  files,
  onFilesChange,
  maxFiles = 6,
  accept = ".csv,.xls,.xlsx",
  className,
}: MultiFileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const remaining = maxFiles - files.length;
      if (remaining <= 0) return;

      const toAdd = Array.from(newFiles).slice(0, remaining);
      const newEntries: UploadedFile[] = toAdd.map((f) => ({
        file: f,
        id: crypto.randomUUID(),
      }));
      onFilesChange([...files, ...newEntries]);
    },
    [files, maxFiles, onFilesChange]
  );

  const removeFile = useCallback(
    (id: string) => {
      onFilesChange(files.filter((f) => f.id !== id));
    },
    [files, onFilesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
      }
      e.target.value = "";
    },
    [addFiles]
  );

  const canAddMore = files.length < maxFiles;

  return (
    <div className={cn("w-full space-y-3", className)}>
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-foreground">
          Arquivos Contábeis
        </label>
        <span className="text-xs text-muted-foreground">
          {files.length}/{maxFiles} arquivos
        </span>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {entry.file.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">
                    {(entry.file.size / 1024).toFixed(1)} KB
                  </span>
                  {entry.detectedType && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                      {entry.detectedType}
                    </Badge>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeFile(entry.id)}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {canAddMore && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "relative border-2 border-dashed rounded-xl transition-all duration-300 cursor-pointer",
            files.length > 0 ? "p-5" : "p-8",
            isDragging
              ? "border-primary bg-primary/5 scale-[1.01]"
              : "border-border hover:border-primary/50 hover:bg-muted/30"
          )}
        >
          <input
            type="file"
            accept={accept}
            multiple
            onChange={handleChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />

          <div className="flex flex-col items-center text-center">
            {files.length > 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Plus className="w-4 h-4" />
                <span className="text-sm">Adicionar mais arquivos</span>
              </div>
            ) : (
              <>
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Upload className="w-7 h-7 text-primary" />
                </div>
                <p className="text-foreground font-medium mb-1">
                  Arraste os arquivos ou clique para selecionar
                </p>
                <p className="text-sm text-muted-foreground">
                  DRE, Balanço Patrimonial, DMPL, Fluxo de Caixa e outros
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Até {maxFiles} arquivos · CSV, XLS, XLSX
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
