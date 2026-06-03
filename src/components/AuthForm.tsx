import { useState } from "react";
import { motion } from "framer-motion";
import { LogIn, UserPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AuthFormProps {
  onAuthSuccess: () => void;
}

export function AuthForm({ onAuthSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const isLogin = mode === "login";
  const isForgot = mode === "forgot";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isForgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({
          title: "Check your email",
          description: "We sent you a link to reset your password.",
        });
        setMode("login");
      } else if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuthSuccess();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast({
          title: "Check your email",
          description: "We sent you a confirmation link. Please verify your email to continue.",
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-8 rounded-2xl bg-card border border-border max-w-sm mx-auto"
    >
      <h2 className="text-xl font-bold text-foreground text-center mb-1">
        {isForgot ? "Reset password" : isLogin ? "Welcome back" : "Create account"}
      </h2>
      <p className="text-sm text-muted-foreground text-center mb-6">
        {isForgot
          ? "Enter your email and we'll send you a reset link"
          : isLogin
          ? "Sign in to access your voice clones"
          : "Sign up to start creating audiobooks"}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {!isForgot && (
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        )}
        <Button variant="hero" type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isForgot ? (
            "Send reset link"
          ) : isLogin ? (
            <>
              <LogIn className="w-4 h-4" />
              Sign In
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              Sign Up
            </>
          )}
        </Button>
      </form>

      {isLogin && (
        <button
          type="button"
          onClick={() => setMode("forgot")}
          className="w-full text-sm text-muted-foreground hover:text-foreground mt-4 transition-colors"
        >
          Forgot password?
        </button>
      )}

      <button
        type="button"
        onClick={() => setMode(isLogin || isForgot ? (isForgot ? "login" : "signup") : "login")}
        className="w-full text-sm text-muted-foreground hover:text-foreground mt-2 transition-colors"
      >
        {isForgot
          ? "Back to sign in"
          : isLogin
          ? "Don't have an account? Sign up"
          : "Already have an account? Sign in"}
      </button>
    </motion.div>
  );
}
