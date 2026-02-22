import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";
import { extractText } from "npm:unpdf";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Extract plain text from .docx XML content
function extractTextFromDocxXml(xml: string): string {
  const paragraphs: string[] = [];
  const pMatches = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
  for (const p of pMatches) {
    const texts: string[] = [];
    const tMatches = p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
    for (const t of tMatches) {
      const content = t.replace(/<[^>]+>/g, "");
      texts.push(content);
    }
    if (texts.length > 0) {
      paragraphs.push(texts.join(""));
    }
  }
  return paragraphs.join("\n\n");
}

async function extractTextFromDocument(fileData: Blob, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop() || "";
  if (ext === "txt") return await fileData.text();
  if (ext === "docx") {
    const buffer = new Uint8Array(await fileData.arrayBuffer());
    const unzipped = unzipSync(buffer);
    const docXmlBytes = unzipped["word/document.xml"];
    if (!docXmlBytes) throw new Error("Invalid .docx file: missing word/document.xml");
    return extractTextFromDocxXml(new TextDecoder().decode(docXmlBytes));
  }
  if (ext === "pdf") {
    const buffer = new Uint8Array(await fileData.arrayBuffer());
    const result = await extractText(buffer);
    return typeof result === "string" ? result : (result?.text ?? String(result ?? ""));
  }
  if (ext === "epub") throw new Error("EPUB files are not yet supported.");
  throw new Error(`Unsupported file type: .${ext}`);
}

const MAX_CHUNK_CHARS = 4500;

function splitTextIntoChunks(text: string, baseTitle: string): Array<{ title: string; content: string }> {
  if (text.length <= MAX_CHUNK_CHARS) return [{ title: baseTitle, content: text }];
  const chunks: Array<{ title: string; content: string }> = [];
  let remaining = text;
  let partIdx = 1;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_CHARS) {
      chunks.push({ title: `${baseTitle} (Part ${partIdx})`, content: remaining.trim() });
      break;
    }
    let cutoff = MAX_CHUNK_CHARS;
    const slice = remaining.slice(0, cutoff);
    const lastSentenceEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(".\n"), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
    if (lastSentenceEnd > MAX_CHUNK_CHARS * 0.3) cutoff = lastSentenceEnd + 1;
    chunks.push({ title: `${baseTitle} (Part ${partIdx})`, content: remaining.slice(0, cutoff).trim() });
    remaining = remaining.slice(cutoff).trim();
    partIdx++;
  }
  return chunks;
}

function splitIntoChapters(text: string): Array<{ title: string; content: string }> {
  const chapterPattern = /(?:^|\n)(Chapter\s+\d+[^\n]*|CHAPTER\s+\d+[^\n]*)/gi;
  const matches = [...text.matchAll(chapterPattern)];
  let rawChapters: Array<{ title: string; content: string }> = [];
  if (matches.length >= 2) {
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index!;
      const end = i < matches.length - 1 ? matches[i + 1].index! : text.length;
      rawChapters.push({ title: matches[i][1].trim(), content: text.slice(start, end).trim() });
    }
  } else {
    rawChapters = [{ title: "Full Text", content: text }];
  }
  const finalChapters: Array<{ title: string; content: string }> = [];
  for (const ch of rawChapters) {
    finalChapters.push(...splitTextIntoChunks(ch.content, ch.title));
  }
  return finalChapters.length > 0 ? finalChapters : [{ title: "Full Text", content: text }];
}

// Background TTS processing — runs after response is sent
async function processConversion(
  conversionId: string,
  chapters: Array<{ title: string; content: string }>,
  voiceId: string,
  speed: number,
  userId: string,
  apiKey: string,
) {
  // Use service role to bypass RLS for background updates
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const audioChunks: Uint8Array[] = [];
    const chapterMeta: Array<{ title: string; startSeconds: number; durationSeconds: number }> = [];
    let totalDuration = 0;

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const progress = 20 + Math.round(((i + 1) / chapters.length) * 70);
      await supabase.from("conversions").update({ progress, status: "converting" }).eq("id", conversionId);

      const previousText = i > 0 ? chapters[i - 1].content.slice(-200) : undefined;
      const nextText = i < chapters.length - 1 ? chapters[i + 1].content.slice(0, 200) : undefined;

      const ttsBody: Record<string, unknown> = {
        text: chapter.content,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
      };
      if (speed && speed !== 1.0) ttsBody.speed = speed;
      if (previousText) ttsBody.previous_text = previousText;
      if (nextText) ttsBody.next_text = nextText;

      const ttsResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(ttsBody),
        }
      );

      if (!ttsResponse.ok) {
        const errText = await ttsResponse.text();
        console.error(`TTS failed for chunk ${i + 1}: ${errText}`);
        await supabase.from("conversions").update({ status: "failed" }).eq("id", conversionId);
        return;
      }

      const audioBuffer = await ttsResponse.arrayBuffer();
      audioChunks.push(new Uint8Array(audioBuffer));
      const estimatedDuration = audioBuffer.byteLength / 16000;
      chapterMeta.push({ title: chapter.title, startSeconds: totalDuration, durationSeconds: estimatedDuration });
      totalDuration += estimatedDuration;
    }

    // Combine audio
    const totalLength = audioChunks.reduce((acc, c) => acc + c.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunks) { combined.set(chunk, offset); offset += chunk.length; }

    // Upload
    const audioPath = `${userId}/${conversionId}.mp3`;
    const { error: uploadErr } = await supabase.storage
      .from("audiobooks")
      .upload(audioPath, combined, { contentType: "audio/mpeg" });
    if (uploadErr) {
      console.error(`Audio upload failed: ${uploadErr.message}`);
      await supabase.from("conversions").update({ status: "failed" }).eq("id", conversionId);
      return;
    }

    await supabase.from("conversions").update({
      status: "done",
      progress: 100,
      audio_storage_path: audioPath,
      total_duration_seconds: totalDuration,
      chapters: chapterMeta,
    }).eq("id", conversionId);

    console.log(`Conversion ${conversionId} completed successfully`);
  } catch (err) {
    console.error(`Background processing error: ${err}`);
    await supabase.from("conversions").update({ status: "failed" }).eq("id", conversionId);
  }
}

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

    const { documentPath, voiceCloneId, filename, speed } = await req.json();
    if (!documentPath || !voiceCloneId) throw new Error("Missing documentPath or voiceCloneId");

    const { data: voice, error: voiceError } = await supabase
      .from("voice_clones").select("*").eq("id", voiceCloneId).eq("user_id", user.id).single();
    if (voiceError || !voice) throw new Error("Voice clone not found");
    if (!voice.elevenlabs_voice_id) throw new Error("Voice clone not ready");

    // Download & parse document
    const { data: fileData, error: dlError } = await supabase.storage.from("audiobooks").download(documentPath);
    if (dlError || !fileData) throw new Error(`Document download failed: ${dlError?.message}`);

    const rawText = await extractTextFromDocument(fileData, filename || documentPath);
    const text = typeof rawText === "string" ? rawText : String(rawText ?? "");
    if (!text.trim()) throw new Error("No text could be extracted from the document");

    const chapters = splitIntoChapters(text);

    // Create conversion record
    const { data: conversion, error: convError } = await supabase
      .from("conversions")
      .insert({
        user_id: user.id,
        voice_clone_id: voiceCloneId,
        original_filename: filename || "document.txt",
        document_storage_path: documentPath,
        status: "converting",
        progress: 15,
        chapters: chapters.map((c, i) => ({ index: i, title: c.title, charCount: c.content.length })),
      })
      .select()
      .single();
    if (convError) throw new Error(`Failed to create conversion: ${convError.message}`);

    // Fire-and-forget: start background processing (won't block the response)
    const bgPromise = processConversion(
      conversion.id,
      chapters,
      voice.elevenlabs_voice_id,
      speed || 1.0,
      user.id,
      ELEVENLABS_API_KEY,
    );
    // Keep the edge function alive for the background work using EdgeRuntime.waitUntil if available
    // @ts-ignore - Deno Deploy / Supabase Edge Runtime may expose this
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(bgPromise);
    } else {
      // Fallback: just let it run (the edge function process stays alive for the request)
      bgPromise.catch((e) => console.error("Background error:", e));
    }

    // Return immediately with conversion ID so client can poll
    return new Response(JSON.stringify({
      id: conversion.id,
      status: "converting",
      totalChunks: chapters.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("convert-to-audiobook error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
