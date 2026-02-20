import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Sparkles, BookOpen, Upload as UploadIcon, Zap } from "lucide-react";
import { Header } from "@/components/Header";
import { DocumentUpload } from "@/components/DocumentUpload";
import { VoiceSettings } from "@/components/VoiceSettings";
import { ConversionProgress } from "@/components/ConversionProgress";
import { AudioPlayer } from "@/components/AudioPlayer";
import { Button } from "@/components/ui/button";

type AppState = "upload" | "settings" | "converting" | "done";

const STAGES = [
  "Parsing document...",
  "Splitting into chapters...",
  "Generating narration...",
  "Encoding audio...",
  "Finalizing KDP format...",
];

const Index = () => {
  const [state, setState] = useState<AppState>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [voice, setVoice] = useState("sarah");
  const [speed, setSpeed] = useState(1.0);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(STAGES[0]);

  const handleFileSelect = useCallback((f: File) => {
    setFile(f);
    setState("settings");
  }, []);

  const handleClearFile = useCallback(() => {
    setFile(null);
    setState("upload");
  }, []);

  const handleConvert = useCallback(() => {
    setState("converting");
    setProgress(0);
  }, []);

  // Simulate conversion progress
  useEffect(() => {
    if (state !== "converting") return;
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + Math.random() * 3 + 0.5;
        const stageIndex = Math.min(Math.floor((next / 100) * STAGES.length), STAGES.length - 1);
        setStage(STAGES[stageIndex]);
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => setState("done"), 500);
          return 100;
        }
        return next;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [state]);

  const handleReset = () => {
    setFile(null);
    setState("upload");
    setProgress(0);
  };

  return (
    <div className="min-h-screen bg-background bg-grid relative">
      <div className="relative z-10 max-w-2xl mx-auto px-6 pb-20">
        <Header />

        {/* Hero */}
        <AnimatePresence mode="wait">
          {state === "upload" && (
            <motion.div
              key="hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-12 mb-10"
            >
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight"
              >
                Turn any document into a{" "}
                <span className="text-gradient-amber">KDP-ready audiobook</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-4 text-lg text-muted-foreground max-w-lg"
              >
                Upload your manuscript, pick a voice, and get a publish-ready audiobook in minutes. No other tools needed.
              </motion.p>

              {/* Feature pills */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-wrap gap-3 mt-6"
              >
                {[
                  { icon: Zap, label: "One-click convert" },
                  { icon: BookOpen, label: "KDP-ready format" },
                  { icon: Sparkles, label: "AI narration" },
                ].map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-sm text-secondary-foreground border border-border"
                  >
                    <Icon className="w-3.5 h-3.5 text-primary" />
                    {label}
                  </span>
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step indicator for settings */}
        <AnimatePresence mode="wait">
          {state === "settings" && (
            <motion.div
              key="settings-header"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-10 mb-6"
            >
              <h2 className="text-2xl font-bold text-foreground">Configure your audiobook</h2>
              <p className="text-muted-foreground mt-1">Choose a voice and speed, then hit convert.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main content area */}
        <AnimatePresence mode="wait">
          {state === "upload" && (
            <motion.div
              key="upload-area"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: 0.4 }}
            >
              <DocumentUpload
                onFileSelect={handleFileSelect}
                selectedFile={null}
                onClear={handleClearFile}
              />
            </motion.div>
          )}

          {state === "settings" && (
            <motion.div
              key="settings-area"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <DocumentUpload
                onFileSelect={handleFileSelect}
                selectedFile={file}
                onClear={handleClearFile}
              />
              <VoiceSettings
                voice={voice}
                speed={speed}
                onVoiceChange={setVoice}
                onSpeedChange={setSpeed}
              />
              <Button
                variant="hero"
                size="lg"
                className="w-full text-base"
                onClick={handleConvert}
              >
                Convert to Audiobook
                <ArrowRight className="w-4 h-4" />
              </Button>
            </motion.div>
          )}

          {state === "converting" && (
            <motion.div
              key="converting-area"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-10"
            >
              <ConversionProgress progress={progress} stage={stage} />
            </motion.div>
          )}

          {state === "done" && (
            <motion.div
              key="done-area"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-10"
            >
              <AudioPlayer
                title={file?.name.replace(/\.[^/.]+$/, "") ?? "Audiobook"}
                duration="3:05"
                onDownload={() => {
                  // TODO: real download
                  alert("Download will be available once the backend is connected!");
                }}
                onReset={handleReset}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Index;
