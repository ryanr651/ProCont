import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Upload, FileSpreadsheet, Check, X } from "lucide-react";

interface FileUploadProps {
  label: string;
  description: string;
  accept?: string;
  onFileSelect: (file: File | null) => void;
  className?: string;
}

export function FileUpload({
  label,
  description,
  accept = ".csv,.xls,.xlsx,.pdf",
  onFileSelect,
  className
}: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (selectedFile: File | null) => {
      setFile(selectedFile);
      onFileSelect(selectedFile);
    },
    [onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFile(droppedFile);
      }
    },
    [handleFile]
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
      const selectedFile = e.target.files?.[0] || null;
      handleFile(selectedFile);
    },
    [handleFile]
  );

  const clearFile = useCallback(() => {
    handleFile(null);
  }, [handleFile]);

  return (
    <div className={cn("w-full", className)}>
      <label className="block text-sm font-medium text-foreground mb-2">
        {label}
      </label>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 transition-all duration-300 cursor-pointer",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.02]"
            : file
            ? "border-green-500/50 bg-green-500/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        )}
      >
        <input
          type="file"
          accept={accept}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        <div className="flex flex-col items-center text-center">
          {file ? (
            <>
              <div className="w-14 h-14 rounded-xl bg-green-500/10 flex items-center justify-center mb-4">
                <FileSpreadsheet className="w-7 h-7 text-green-400" />
              </div>
              <p className="text-foreground font-medium mb-1">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                className="mt-3 flex items-center gap-1 text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                <X className="w-4 h-4" />
                Remover arquivo
              </button>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Upload className="w-7 h-7 text-primary" />
              </div>
              <p className="text-foreground font-medium mb-1">
                Arraste o arquivo ou clique para selecionar
              </p>
              <p className="text-sm text-muted-foreground">{description}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Formatos aceitos: CSV, XLS, XLSX, PDF
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
