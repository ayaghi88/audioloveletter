import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { UniversalEdgeTTS } from "jsr:@edge-tts/universal@1.3.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VOICE_MAP: Record<string, string> = {
  guy: "en-US-GuyNeural",
  jenny: "en-US-JennyNeural",
  aria: "en-US-AriaNeural",
  davis: "en-US-DavisNeural",
  jane: "en-US-JaneNeural",
  ryan: "en-GB-RyanNeural",
};

const PREVIEW_TEXT =
  "Hello, I'll be your audiobook narrator. Let me read you a short passage from your manuscript.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { voice } = await req.json();
    if (!voice) throw new Error("Missing voice parameter");

    const voiceId = VOICE_MAP[voice];
    if (!voiceId) throw new Error(`Unknown voice: ${voice}`);

    const tts = new UniversalEdgeTTS(PREVIEW_TEXT, voiceId);
    const result = await tts.synthesize();

    return new Response(result.audio, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (error: unknown) {
    console.error("preview-voice error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
