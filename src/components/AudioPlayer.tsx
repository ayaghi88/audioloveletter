import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface AudioPlayerProps {
  title: string;
  duration: string;
  conversionId: string;
  onDownload: () => void;
  onReset: () => void;
}

export function AudioPlayer({ title, duration, conversionId, onDownload, onReset }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Load audio on mount
  useEffect(() => {
    let cancelled = false;

    const loadAudio = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-audiobook-audio?conversionId=${conversionId}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );

        if (!response.ok || cancelled) return;

        const blob = await response.blob();
        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.addEventListener("loadedmetadata", () => {
          if (!cancelled) {
            setTotalSeconds(audio.duration);
            setAudioLoaded(true);
            setLoading(false);
          }
        });

        audio.addEventListener("timeupdate", () => {
          if (!cancelled) setCurrentTime(audio.currentTime);
        });

        audio.addEventListener("ended", () => {
          if (!cancelled) {
            setIsPlaying(false);
            setCurrentTime(0);
          }
        });

        audio.addEventListener("error", () => {
          if (!cancelled) setLoading(false);
        });

        audio.load();
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    loadAudio();

    return () => {
      cancelled = true;
      if (audioRef.current) {
        audioRef.current.pause();
        const src = audioRef.current.src;
        audioRef.current.src = "";
        URL.revokeObjectURL(src);
        audioRef.current = null;
      }
    };
  }, [conversionId]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioLoaded) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  }, [isPlaying, audioLoaded]);

  const skip = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
  }, []);

  const progress = totalSeconds > 0 ? (currentTime / totalSeconds) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 p-8 rounded-2xl bg-card border border-border glow-amber"
    >
      {/* Title */}
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-primary font-medium mb-1">
          Audiobook Ready
        </p>
        <h3 className="text-lg font-semibold text-foreground truncate">{title}</h3>
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading audio..." : duration}
        </p>
      </div>

      {/* Waveform visualization — clickable to seek */}
      <div
        className="flex items-center justify-center gap-[2px] h-20 cursor-pointer"
        onClick={(e) => {
          if (!audioRef.current || !audioLoaded) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const pct = x / rect.width;
          audioRef.current.currentTime = pct * audioRef.current.duration;
        }}
        onMouseDown={(e) => {
          if (!audioRef.current || !audioLoaded) return;
          const container = e.currentTarget;
          const onMove = (ev: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            const x = Math.max(0, Math.min(ev.clientX - rect.left, rect.width));
            const pct = x / rect.width;
            audioRef.current!.currentTime = pct * audioRef.current!.duration;
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
        onTouchStart={(e) => {
          if (!audioRef.current || !audioLoaded) return;
          const container = e.currentTarget;
          const onMove = (ev: TouchEvent) => {
            const rect = container.getBoundingClientRect();
            const x = Math.max(0, Math.min(ev.touches[0].clientX - rect.left, rect.width));
            const pct = x / rect.width;
            audioRef.current!.currentTime = pct * audioRef.current!.duration;
          };
          const onEnd = () => {
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("touchend", onEnd);
          };
          window.addEventListener("touchmove", onMove);
          window.addEventListener("touchend", onEnd);
        }}
      >
        {Array.from({ length: 60 }).map((_, i) => {
          const barProgress = (i / 60) * 100;
          const isPast = barProgress <= progress;
          const height = Math.sin((i / 60) * Math.PI * 3) * 30 + 20;
          return (
            <div
              key={i}
              className={`w-[3px] rounded-full transition-colors duration-200 ${
                isPast ? "bg-primary" : "bg-secondary"
              }`}
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>

      {/* Time */}
      <div className="flex justify-between text-xs text-muted-foreground font-mono">
        <span>{formatTime(currentTime)}</span>
        <span>{totalSeconds > 0 ? formatTime(totalSeconds) : duration}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => skip(-15)}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          <SkipBack className="w-5 h-5" />
        </button>
        <button
          onClick={togglePlay}
          disabled={!audioLoaded}
          className="p-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all glow-amber-strong disabled:opacity-50"
        >
          {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
        </button>
        <button
          onClick={() => skip(15)}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          variant="hero"
          className="flex-1"
          onClick={onDownload}
        >
          <Download className="w-4 h-4" />
          Download for KDP
        </Button>
        <Button
          variant="outline"
          onClick={onReset}
        >
          New File
        </Button>
      </div>
    </motion.div>
  );
}
