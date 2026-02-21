import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Upload, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface VoiceCloneUploadProps {
  onCloneReady: (cloneId: string) => void;
  existingCloneId: string | null;
}

type CloneState = "idle" | "recording" | "uploading" | "processing" | "ready" | "error";

export function VoiceCloneUpload({ onCloneReady, existingCloneId }: VoiceCloneUploadProps) {
  const [state, setState] = useState<CloneState>(existingCloneId ? "ready" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(1000);
      setState("recording");
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      setError("Microphone access required. Please allow microphone permissions.");
      setState("error");
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.onstop = async () => {
      clearInterval(timerRef.current);
      recorder.stream.getTracks().forEach((t) => t.stop());

      const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
      await uploadAndClone(audioBlob, "recording.webm");
    };

    recorder.stop();
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reject video files
    if (file.type.startsWith("video/")) {
      setError("Please upload an audio file (MP3, WAV, M4A, etc.), not a video. You can convert your video to audio first.");
      setState("error");
      return;
    }

    // Max 25MB
    if (file.size > 25 * 1024 * 1024) {
      setError("File is too large. Please upload an audio file under 25MB.");
      setState("error");
      return;
    }

    await uploadAndClone(file, file.name);
  }, []);

  const uploadAndClone = async (blob: Blob, filename: string) => {
    setState("uploading");
    setError(null);

    try {
      // Get current user session for correct storage path
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Not authenticated");

      const ext = filename.split('.').pop() || 'webm';
      const storagePath = `${session.user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("voice-samples")
        .upload(storagePath, blob);

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      setState("processing");

      // Call edge function with just the storage path (no large file in body)
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      headers["Authorization"] = `Bearer ${session.access_token}`;
      if (session) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clone-voice`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            storagePath,
            voiceName: "My Voice",
            userId: session?.user?.id || null,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Clone failed");

      setState("ready");
      onCloneReady(data.id);
    } catch (err: any) {
      setError(err.message);
      setState("error");
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-2 mb-1">
        <Mic className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Your Voice</span>
      </div>

      <AnimatePresence mode="wait">
        {state === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <p className="text-sm text-muted-foreground">
              Record 2–5 minutes of yourself reading, or upload an audio file (MP3, WAV, M4A). Video files are not supported.
            </p>
            <div className="flex gap-3">
              <Button variant="hero" onClick={startRecording} className="flex-1">
                <Mic className="w-4 h-4" />
                Record Now
              </Button>
              <label>
                <Button variant="outline" asChild>
                  <span>
                    <Upload className="w-4 h-4" />
                    Upload File
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".mp3,.wav,.m4a,.ogg,.flac,.aac,.webm,audio/*"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>
            </div>
          </motion.div>
        )}

        {state === "recording" && (
          <motion.div
            key="recording"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between p-4 rounded-xl bg-destructive/10 border border-destructive/30">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                <span className="text-sm font-medium text-foreground">Recording</span>
              </div>
              <span className="text-lg font-mono text-foreground">{formatTime(recordingTime)}</span>
            </div>

            {/* Waveform */}
            <div className="flex items-center justify-center gap-[2px] h-12">
              {Array.from({ length: 40 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 rounded-full bg-primary"
                  animate={{ height: [4, Math.random() * 40 + 8, 4] }}
                  transition={{
                    duration: 0.6 + Math.random() * 0.4,
                    repeat: Infinity,
                    delay: i * 0.02,
                  }}
                />
              ))}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              {recordingTime < 120
                ? `Read naturally for at least 2 minutes (${formatTime(120 - recordingTime)} remaining)`
                : "Great! You can stop anytime now."}
            </p>

            <Button
              variant="outline"
              className="w-full"
              onClick={stopRecording}
              disabled={recordingTime < 30}
            >
              <Square className="w-4 h-4" />
              {recordingTime < 30 ? `Wait ${30 - recordingTime}s...` : "Stop & Clone Voice"}
            </Button>
          </motion.div>
        )}

        {(state === "uploading" || state === "processing") && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-4 rounded-xl bg-secondary border border-border"
          >
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span className="text-sm text-foreground">
              {state === "uploading" ? "Uploading audio..." : "Cloning your voice — this takes ~30 seconds..."}
            </span>
          </motion.div>
        )}

        {state === "ready" && (
          <motion.div
            key="ready"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/30"
          >
            <CheckCircle2 className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-foreground">Voice cloned successfully!</span>
          </motion.div>
        )}

        {state === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <span className="text-sm text-foreground">{error}</span>
            </div>
            <Button variant="outline" onClick={() => setState("idle")} className="w-full">
              Try Again
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
