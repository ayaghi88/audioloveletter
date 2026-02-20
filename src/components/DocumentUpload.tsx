import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, X, FileAudio } from "lucide-react";

interface DocumentUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
}

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/epub+zip",
];

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".epub"];

export function DocumentUpload({ onFileSelect, selectedFile, onClear }: DocumentUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {!selectedFile ? (
          <motion.label
            key="upload"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            htmlFor="file-upload"
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`
              relative flex flex-col items-center justify-center gap-4 p-12
              rounded-2xl border-2 border-dashed cursor-pointer
              transition-all duration-300 group
              ${isDragOver
                ? "border-primary bg-primary/5 glow-amber"
                : "border-border hover:border-primary/50 hover:bg-secondary/30"
              }
            `}
          >
            <motion.div
              animate={isDragOver ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
              className="p-4 rounded-2xl bg-secondary"
            >
              <Upload className="w-8 h-8 text-primary" />
            </motion.div>
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">
                Drop your document here
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse — PDF, DOCX, TXT, EPUB
              </p>
            </div>
            <input
              id="file-upload"
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(",")}
              onChange={handleFileInput}
              className="sr-only"
            />
          </motion.label>
        ) : (
          <motion.div
            key="file-selected"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-center gap-4 p-5 rounded-2xl bg-secondary border border-border"
          >
            <div className="p-3 rounded-xl bg-primary/10">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
            </div>
            <button
              onClick={onClear}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
