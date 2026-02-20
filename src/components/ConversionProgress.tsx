import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface ConversionProgressProps {
  progress: number;
  stage: string;
}

export function ConversionProgress({ progress, stage }: ConversionProgressProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6 p-8 rounded-2xl bg-card border border-border"
    >
      <div className="flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
        <span className="text-sm font-medium text-foreground">{stage}</span>
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* Waveform Animation */}
      <div className="flex items-center justify-center gap-1 h-16">
        {Array.from({ length: 40 }).map((_, i) => (
          <motion.div
            key={i}
            className="w-1 rounded-full bg-primary/60"
            animate={{
              height: [4, Math.random() * 50 + 8, 4],
            }}
            transition={{
              duration: 0.8 + Math.random() * 0.6,
              repeat: Infinity,
              delay: i * 0.03,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {Math.round(progress)}% complete
      </p>
    </motion.div>
  );
}
