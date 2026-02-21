import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

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

    const { conversionId, title, author, isbn, language, publisher } = await req.json();
    if (!conversionId) throw new Error("Missing conversionId");

    const { data: conversion, error: convError } = await supabase
      .from("conversions")
      .select("*, voice_clones(*)")
      .eq("id", conversionId)
      .eq("user_id", user.id)
      .single();
    if (convError || !conversion) throw new Error("Conversion not found");
    if (conversion.status !== "done") throw new Error("Conversion not complete");

    const chapters = (conversion.chapters as Array<{
      title: string;
      startSeconds: number;
      durationSeconds: number;
    }>) || [];

    // Build KDP/ACX-compatible metadata JSON
    const kdpJson = {
      version: "1.0",
      format: "acx-audiobook-metadata",
      metadata: {
        title: title || conversion.original_filename.replace(/\.[^/.]+$/, ""),
        author: author || "Unknown Author",
        narrator: conversion.voice_clones?.name || "AI Narrator",
        language: language || "en",
        publisher: publisher || "",
        isbn: isbn || "",
        totalDuration: formatDuration(conversion.total_duration_seconds || 0),
        totalDurationSeconds: Math.round(conversion.total_duration_seconds || 0),
        createdAt: conversion.created_at,
        audioFormat: "MP3",
        sampleRate: 44100,
        bitRate: 128,
        channels: "mono",
      },
      chapters: chapters.map((ch, i) => ({
        index: i + 1,
        title: ch.title,
        startTime: formatDuration(ch.startSeconds),
        startTimeSeconds: Math.round(ch.startSeconds),
        duration: formatDuration(ch.durationSeconds),
        durationSeconds: Math.round(ch.durationSeconds),
        endTime: formatDuration(ch.startSeconds + ch.durationSeconds),
        endTimeSeconds: Math.round(ch.startSeconds + ch.durationSeconds),
      })),
      acxRequirements: {
        peakValues: "Must not exceed -3dB",
        rmsLevels: "Between -23dB and -18dB RMS",
        noiseFloor: "Below -60dB",
        format: "MP3 at 192kbps or higher CBR, 44.1kHz, mono",
        sectionHeaders: "Each chapter should have a separate file for ACX",
        openingCredits: "Title, author, narrator at the beginning",
        closingCredits: "End of audiobook, produced by [publisher]",
        note: "This metadata file assists with ACX upload. Audio may need mastering to meet ACX technical specs.",
      },
    };

    return new Response(JSON.stringify(kdpJson, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${(title || "audiobook")}-kdp-metadata.json"`,
      },
    });
  } catch (error: unknown) {
    console.error("export-kdp-json error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
