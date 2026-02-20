import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Accept JSON body with storage path instead of the actual file
    const { storagePath, voiceName, userId } = await req.json();

    if (!storagePath) throw new Error("No storagePath provided");

    const finalUserId = userId || "00000000-0000-0000-0000-000000000000";
    const finalName = voiceName || "My Voice";

    // Create voice clone record
    const { data: cloneRecord, error: dbError } = await supabase
      .from("voice_clones")
      .insert({
        user_id: finalUserId,
        name: finalName,
        sample_storage_path: storagePath,
        status: "processing",
      })
      .select()
      .single();
    if (dbError) throw new Error(`DB insert failed: ${dbError.message}`);

    // Download file from storage (streamed)
    console.log(`clone-voice: downloading sample from voice-samples bucket, path="${storagePath}"`);
    const { data: fileData, error: dlError } = await supabase.storage
      .from("voice-samples")
      .download(storagePath);
    if (dlError || !fileData) {
      console.error(`clone-voice: voice-samples download failed for path="${storagePath}":`, dlError?.message);
      await supabase.from("voice_clones").update({ status: "failed" }).eq("id", cloneRecord.id);
      throw new Error(`Storage download failed: ${dlError?.message}`);
    }
    console.log(`clone-voice: successfully downloaded sample from voice-samples, path="${storagePath}"`);

    // Send to ElevenLabs for cloning
    const elFormData = new FormData();
    elFormData.append("name", `audioloveletter_${finalUserId.slice(0, 8)}_${finalName}`);
    elFormData.append("files", fileData, "sample.webm");
    elFormData.append("description", `Audio Love Letter voice clone for ${finalName}`);

    console.log(`clone-voice: sending voice sample to ElevenLabs API for userId="${finalUserId}", name="${finalName}"`);
    const elResponse = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      body: elFormData,
    });

    if (!elResponse.ok) {
      const errBody = await elResponse.text();
      console.error(`clone-voice: ElevenLabs API error [${elResponse.status}]:`, errBody);
      await supabase.from("voice_clones").update({ status: "failed" }).eq("id", cloneRecord.id);
      throw new Error(`ElevenLabs clone failed [${elResponse.status}]: ${errBody}`);
    }

    const elData = await elResponse.json();
    console.log(`clone-voice: ElevenLabs voice created successfully, voice_id="${elData.voice_id}"`);

    await supabase.from("voice_clones").update({
      elevenlabs_voice_id: elData.voice_id,
      status: "ready",
    }).eq("id", cloneRecord.id);

    return new Response(JSON.stringify({
      id: cloneRecord.id,
      voice_id: elData.voice_id,
      status: "ready",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("clone-voice error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
