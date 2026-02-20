import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, Download, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AudioPlayerProps {
  title: string;
  duration: string;
  audioUrl?: string;
  onDownload: () => void;
  onReset: () => void;
}

export function AudioPlayer({ title, duration, audioUrl, onDownload, onReset }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(185);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Set up real audio element when URL is provided
  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const onLoaded = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setTotalSeconds(audio.duration);
      }
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [audioUrl]);

  // Mock progress animation when no real audio URL
  useEffect(() => {
    if (audioUrl || !isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime((t) => {
        if (t >= totalSeconds) {
          setIsPlaying(false);
          return 0;
        }
        return t + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, audioUrl, totalSeconds]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (audio) {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play().catch((err) => console.error("Audio playback error:", err));
      }
    }
    setIsPlaying((p) => !p);
  };

  const seekBack = () => {
    const newTime = Math.max(0, currentTime - 15);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    } else {
      setCurrentTime(newTime);
    }
  };

  const seekForward = () => {
    const newTime = Math.min(totalSeconds, currentTime + 15);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    } else {
      setCurrentTime(newTime);
    }
  };

  const progress = (currentTime / totalSeconds) * 100;

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
        <p className="text-sm text-muted-foreground">{duration}</p>
      </div>

      {/* Waveform visualization */}
      <div className="flex items-center justify-center gap-[2px] h-20">
        {Array.from({ length: 60 }).map((_, i) => {
          const barProgress = (i / 60) * 100;
          const isPast = barProgress <= progress;
          const height = Math.sin((i / 60) * Math.PI * 3) * 30 + Math.random() * 20 + 10;
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
        <span>{formatTime(totalSeconds)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={seekBack}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          <SkipBack className="w-5 h-5" />
        </button>
        <button
          onClick={togglePlay}
          className="p-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all glow-amber-strong"
        >
          {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
        </button>
        <button
          onClick={seekForward}
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
          Download Audio
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
