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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const url = new URL(req.url);
    const conversionId = url.searchParams.get("conversionId");
    if (!conversionId) throw new Error("Missing conversionId");

    const { data: conversion, error: convError } = await supabase
      .from("conversions")
      .select("audio_storage_path")
      .eq("id", conversionId)
      .eq("user_id", user.id)
      .single();
    if (convError || !conversion?.audio_storage_path) throw new Error("Audio not found");

    const { data: audioData, error: dlError } = await supabase.storage
      .from("audiobooks")
      .download(conversion.audio_storage_path);
    if (dlError || !audioData) {
      console.error("get-audiobook-audio storage download error:", dlError?.message, "path:", conversion.audio_storage_path);
      throw new Error(`Download failed: ${dlError?.message ?? "no data returned"}`);
    }

    return new Response(audioData, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="audiobook-${conversionId}.mp3"`,
      },
    });
  } catch (error) {
    console.error("get-audiobook-audio error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
