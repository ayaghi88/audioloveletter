import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Mic, Gauge, Play, Square, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VoiceSettingsProps {
  voice: string;
  speed: number;
  onVoiceChange: (voice: string) => void;
  onSpeedChange: (speed: number) => void;
}

const VOICES = [
  { id: "george", name: "George", desc: "Deep, authoritative" },
  { id: "sarah", name: "Sarah", desc: "Warm, conversational" },
  { id: "roger", name: "Roger", desc: "Rich, narrative" },
  { id: "laura", name: "Laura", desc: "Gentle, soothing" },
  { id: "charlie", name: "Charlie", desc: "Bright, engaging" },
  { id: "liam", name: "Liam", desc: "Clear, professional" },
];

const SPEEDS = [
  { value: 0.8, label: "0.8×" },
  { value: 0.9, label: "0.9×" },
  { value: 1.0, label: "1.0×" },
  { value: 1.1, label: "1.1×" },
  { value: 1.2, label: "1.2×" },
];

export function VoiceSettings({ voice, speed, onVoiceChange, onSpeedChange }: VoiceSettingsProps) {
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const handlePreview = async (voiceId: string) => {
    // Stop any currently playing preview
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (playingVoice === voiceId) {
      setPlayingVoice(null);
      return;
    }

    setPreviewingVoice(voiceId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ variant: "destructive", title: "Not signed in", description: "Please sign in to preview voices." });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/preview-voice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ voice: voiceId }),
        }
      );

      if (!response.ok) {
        let errMsg = "Preview unavailable";
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch {
          // ignore parse errors
        }
        toast({ variant: "destructive", title: "Preview failed", description: errMsg });
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingVoice(voiceId);

      audio.onended = () => {
        setPlayingVoice(null);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      audio.play().catch(() => {
        toast({ variant: "destructive", title: "Playback blocked", description: "Your browser blocked audio autoplay. Please interact with the page first." });
        setPlayingVoice(null);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      });
    } catch {
      toast({ variant: "destructive", title: "Preview failed", description: "Unable to load voice preview. Please try again." });
    } finally {
      setPreviewingVoice(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="space-y-6"
    >
      {/* Voice Selection */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Mic className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Narrator Voice</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {VOICES.map((v) => (
            <div
              key={v.id}
              role="button"
              tabIndex={0}
              onClick={() => onVoiceChange(v.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onVoiceChange(v.id); } }}
              className={`
                p-3 rounded-xl text-left transition-all duration-200 border cursor-pointer
                ${voice === v.id
                  ? "border-primary bg-primary/10 glow-amber"
                  : "border-border bg-secondary hover:border-primary/30"
                }
              `}
            >
              <p className={`text-sm font-medium ${voice === v.id ? "text-primary" : "text-foreground"}`}>
                {v.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{v.desc}</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handlePreview(v.id); }}
                className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                aria-label={playingVoice === v.id ? `Stop preview of ${v.name}` : `Preview ${v.name} voice`}
              >
                {previewingVoice === v.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : playingVoice === v.id ? (
                  <Square className="w-3 h-3" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                {previewingVoice === v.id ? "Loading…" : playingVoice === v.id ? "Stop" : "Preview"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Speed */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Narration Speed</span>
        </div>
        <div className="flex gap-2">
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              onClick={() => onSpeedChange(s.value)}
              className={`
                flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 border
                ${speed === s.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/30"
                }
              `}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
