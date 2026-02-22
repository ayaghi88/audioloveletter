import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VOICE_MAP: Record<string, string> = {
  george: "JBFqnCBsd6RMkjVDRZzb",
  sarah: "EXAVITQu4vr4xnSDxMaL",
  roger: "CwhRBWXzGAHq8TQ4Fs17",
  laura: "FGY2WhTYpPnrIDTdsKH5",
  charlie: "IKne3meq5aSn9XLyUdCD",
  liam: "TX3LPaxmHKxFdv7VOQHJ",
};

const PREVIEW_TEXT =
  "Hello, I'll be your audiobook narrator. Let me read you a short passage from your manuscript.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");

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

    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: PREVIEW_TEXT,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      throw new Error(`TTS preview failed: ${errText}`);
    }

    const audioBuffer = await ttsResponse.arrayBuffer();

    return new Response(audioBuffer, {
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
