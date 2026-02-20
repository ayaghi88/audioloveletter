import { motion } from "framer-motion";
import { Headphones } from "lucide-react";

export function Header() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between py-6"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10 glow-amber">
          <Headphones className="w-6 h-6 text-primary" />
        </div>
        <span className="text-xl font-bold text-foreground tracking-tight">
          Vox<span className="text-primary">Press</span>
        </span>
      </div>
      <p className="text-sm text-muted-foreground hidden sm:block">
        Document → Audiobook → KDP
      </p>
    </motion.header>
  );
}
