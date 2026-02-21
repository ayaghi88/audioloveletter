import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Sparkles, BookOpen, Zap, LogOut, FileJson } from "lucide-react";
import { Header } from "@/components/Header";
import { DocumentUpload } from "@/components/DocumentUpload";
import { VoiceCloneUpload } from "@/components/VoiceCloneUpload";
import { ConversionProgress } from "@/components/ConversionProgress";
import { AudioPlayer } from "@/components/AudioPlayer";
import { AuthForm } from "@/components/AuthForm";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type AppState = "auth" | "upload" | "settings" | "converting" | "done";

const STAGES = [
  "Parsing document...",
  "Splitting into chapters...",
  "Generating narration with your voice...",
  "Encoding audio...",
  "Finalizing KDP format...",
];

const Index = () => {
  const [state, setState] = useState<AppState>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [voiceCloneId, setVoiceCloneId] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1.0);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(STAGES[0]);
  const [conversionId, setConversionId] = useState<string | null>(null);
  const [conversionResult, setConversionResult] = useState<any>(null);
  const { toast } = useToast();

  // Check auth on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setState("upload");
        loadExistingVoice();
      } else {
        setState("auth");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadExistingVoice();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadExistingVoice = async () => {
    const { data } = await supabase
      .from("voice_clones")
      .select("id")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(1);
    if (data?.[0]) setVoiceCloneId(data[0].id);
  };

  const handleFileSelect = useCallback((f: File) => {
    setFile(f);
    setState("settings");
  }, []);

  const handleClearFile = useCallback(() => {
    setFile(null);
    setState("upload");
  }, []);

  const handleConvert = useCallback(async () => {
    if (!file || !voiceCloneId) return;

    setState("converting");
    setProgress(5);
    setStage(STAGES[0]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Upload document to storage first
      const docPath = `${session.user.id}/${crypto.randomUUID()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("audiobooks")
        .upload(docPath, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      setProgress(10);
      setStage(STAGES[0]);

      // Simulate initial progress while waiting
      const fakeProgress = setInterval(() => {
        setProgress((p) => {
          if (p >= 20) {
            clearInterval(fakeProgress);
            return p;
          }
          return p + 1;
        });
      }, 500);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/convert-to-audiobook`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            documentPath: docPath,
            voiceCloneId,
            filename: file.name,
            speed,
          }),
        }
      );

      clearInterval(fakeProgress);

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Conversion failed");

      setConversionId(data.id);
      setConversionResult(data);
      setProgress(100);
      setTimeout(() => setState("done"), 500);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Conversion failed",
        description: err.message,
      });
      setState("settings");
    }
  }, [file, voiceCloneId, speed, toast]);

  const handleDownloadAudio = useCallback(async () => {
    if (!conversionId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-audiobook-audio?conversionId=${conversionId}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      if (!response.ok) {
        let errMsg = "Download failed";
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch {
          // ignore parse errors
        }
        throw new Error(errMsg);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${file?.name?.replace(/\.[^/.]+$/, "") || "audiobook"}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Download failed", description: err.message });
    }
  }, [conversionId, file, toast]);

  const handleExportKdp = useCallback(async () => {
    if (!conversionId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-kdp-json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            conversionId,
            title: file?.name?.replace(/\.[^/.]+$/, ""),
          }),
        }
      );
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${file?.name?.replace(/\.[^/.]+$/, "") || "audiobook"}-kdp-metadata.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Export failed", description: err.message });
    }
  }, [conversionId, file, toast]);

  const handleReset = () => {
    setFile(null);
    setConversionId(null);
    setConversionResult(null);
    setProgress(0);
    setState("upload");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setState("auth");
  };

  const totalDuration = conversionResult?.totalDuration
    ? `${Math.floor(conversionResult.totalDuration / 60)}:${Math.floor(conversionResult.totalDuration % 60).toString().padStart(2, "0")}`
    : "0:00";

  return (
    <div className="min-h-screen bg-background bg-grid relative">
      <div className="relative z-10 max-w-2xl mx-auto px-6 pb-20">
        <Header />

        {state !== "auth" && (
          <div className="flex justify-end -mt-2 mb-4">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        )}

        {/* Hero */}
        <AnimatePresence mode="wait">
          {(state === "upload" || state === "auth") && (
            <motion.div
              key="hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-8 mb-10"
            >
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight"
              >
                Turn any document into a{" "}
                <span className="text-gradient-amber">KDP-ready audiobook</span>
                {" "}in <span className="text-gradient-amber">your voice</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-4 text-lg text-muted-foreground max-w-lg"
              >
                Upload your manuscript, record yourself for 2 minutes, and get a publish-ready audiobook narrated in your own voice.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-wrap gap-3 mt-6"
              >
                {[
                  { icon: Zap, label: "One-click convert" },
                  { icon: BookOpen, label: "KDP-ready format" },
                  { icon: Sparkles, label: "Your voice, cloned" },
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

        {/* Settings header */}
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
              <p className="text-muted-foreground mt-1">Clone your voice and set your speed, then convert.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main content */}
        <AnimatePresence mode="wait">
          {state === "auth" && (
            <motion.div
              key="auth-area"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: 0.4 }}
            >
              <AuthForm onAuthSuccess={() => setState("upload")} />
            </motion.div>
          )}

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
              <VoiceCloneUpload
                onCloneReady={setVoiceCloneId}
                existingCloneId={voiceCloneId}
              />

              {/* Speed selector */}
              <div>
                <span className="text-sm font-medium text-foreground mb-3 block">Narration Speed</span>
                <div className="flex gap-2">
                  {[0.8, 0.9, 1.0, 1.1, 1.2].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                        speed === s
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/30"
                      }`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>

              <Button
                variant="hero"
                size="lg"
                className="w-full text-base"
                onClick={handleConvert}
                disabled={!voiceCloneId}
              >
                {!voiceCloneId ? "Clone your voice first" : "Convert to Audiobook"}
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
              className="mt-10 space-y-4"
            >
              <AudioPlayer
                title={file?.name.replace(/\.[^/.]+$/, "") ?? "Audiobook"}
                duration={totalDuration}
                conversionId={conversionId!}
                onDownload={handleDownloadAudio}
                onReset={handleReset}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={handleExportKdp}
              >
                <FileJson className="w-4 h-4" />
                Export KDP Chapter Metadata (JSON)
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Index;
