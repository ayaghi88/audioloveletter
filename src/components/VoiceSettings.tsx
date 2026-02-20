import { motion } from "framer-motion";
import { Mic, Volume2, Gauge } from "lucide-react";

interface VoiceSettingsProps {
  voice: string;
  speed: number;
  onVoiceChange: (voice: string) => void;
  onSpeedChange: (speed: number) => void;
}

const VOICES = [
  { id: "sarah", name: "Sarah", desc: "Warm, conversational" },
  { id: "george", name: "George", desc: "Deep, authoritative" },
  { id: "lily", name: "Lily", desc: "Gentle, soothing" },
  { id: "brian", name: "Brian", desc: "Clear, professional" },
  { id: "alice", name: "Alice", desc: "Bright, engaging" },
  { id: "daniel", name: "Daniel", desc: "Rich, narrative" },
];

const SPEEDS = [
  { value: 0.8, label: "0.8×" },
  { value: 0.9, label: "0.9×" },
  { value: 1.0, label: "1.0×" },
  { value: 1.1, label: "1.1×" },
  { value: 1.2, label: "1.2×" },
];

export function VoiceSettings({ voice, speed, onVoiceChange, onSpeedChange }: VoiceSettingsProps) {
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
            <button
              key={v.id}
              onClick={() => onVoiceChange(v.id)}
              className={`
                p-3 rounded-xl text-left transition-all duration-200 border
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
            </button>
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
