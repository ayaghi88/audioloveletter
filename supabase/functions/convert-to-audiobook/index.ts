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
  // Remove XML tags except paragraph breaks
  // <w:p> = paragraph, <w:t> = text run
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

// Extract text from uploaded document based on file type
async function extractTextFromDocument(fileData: Blob, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop() || "";

  if (ext === "txt") {
    return await fileData.text();
  }

  if (ext === "docx") {
    const buffer = new Uint8Array(await fileData.arrayBuffer());
    const unzipped = unzipSync(buffer);
    const docXmlBytes = unzipped["word/document.xml"];
    if (!docXmlBytes) throw new Error("Invalid .docx file: missing word/document.xml");
    const decoder = new TextDecoder();
    const xml = decoder.decode(docXmlBytes);
    return extractTextFromDocxXml(xml);
  }

  if (ext === "pdf") {
    const buffer = new Uint8Array(await fileData.arrayBuffer());
    const result = await extractText(buffer);
    const text = typeof result === "string" ? result : (result?.text ?? String(result ?? ""));
    return text;
  }

  if (ext === "epub") {
    throw new Error("EPUB files are not yet supported. Please upload a .pdf, .docx, or .txt file.");
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

const MAX_CHUNK_CHARS = 4500; // Stay well under ElevenLabs 10K limit

// Split a single text blob into chunks ≤ MAX_CHUNK_CHARS at sentence boundaries
function splitTextIntoChunks(text: string, baseTitle: string): Array<{ title: string; content: string }> {
  if (text.length <= MAX_CHUNK_CHARS) {
    return [{ title: baseTitle, content: text }];
  }
  const chunks: Array<{ title: string; content: string }> = [];
  let remaining = text;
  let partIdx = 1;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_CHARS) {
      chunks.push({ title: `${baseTitle} (Part ${partIdx})`, content: remaining.trim() });
      break;
    }
    // Find last sentence-ending punctuation within the limit
    let cutoff = MAX_CHUNK_CHARS;
    const slice = remaining.slice(0, cutoff);
    const lastSentenceEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(".\n"), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
    if (lastSentenceEnd > MAX_CHUNK_CHARS * 0.3) {
      cutoff = lastSentenceEnd + 1;
    }
    chunks.push({ title: `${baseTitle} (Part ${partIdx})`, content: remaining.slice(0, cutoff).trim() });
    remaining = remaining.slice(cutoff).trim();
    partIdx++;
  }
  return chunks;
}

// Simple chapter splitter
function splitIntoChapters(text: string): Array<{ title: string; content: string }> {
  const chapterPattern = /(?:^|\n)(Chapter\s+\d+[^\n]*|CHAPTER\s+\d+[^\n]*)/gi;
  const matches = [...text.matchAll(chapterPattern)];

  let rawChapters: Array<{ title: string; content: string }> = [];

  if (matches.length >= 2) {
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index!;
      const end = i < matches.length - 1 ? matches[i + 1].index! : text.length;
      rawChapters.push({
        title: matches[i][1].trim(),
        content: text.slice(start, end).trim(),
      });
    }
  } else {
    // Fallback: treat as single block
    rawChapters = [{ title: "Full Text", content: text }];
  }

  // Sub-split any chapter that exceeds the TTS character limit
  const finalChapters: Array<{ title: string; content: string }> = [];
  for (const ch of rawChapters) {
    finalChapters.push(...splitTextIntoChunks(ch.content, ch.title));
  }

  return finalChapters.length > 0 ? finalChapters : [{ title: "Full Text", content: text }];
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

    // Get the voice clone
    const { data: voice, error: voiceError } = await supabase
      .from("voice_clones")
      .select("*")
      .eq("id", voiceCloneId)
      .eq("user_id", user.id)
      .single();
    if (voiceError || !voice) throw new Error("Voice clone not found");
    if (!voice.elevenlabs_voice_id) throw new Error("Voice clone not ready");

    // Download document from storage
    const { data: fileData, error: dlError } = await supabase.storage
      .from("audiobooks")
      .download(documentPath);
    if (dlError || !fileData) throw new Error(`Document download failed: ${dlError?.message}`);

    // Extract text from document
    const rawText = await extractTextFromDocument(fileData, filename || documentPath);
    const text = typeof rawText === "string" ? rawText : String(rawText ?? "");
    if (!text.trim()) throw new Error("No text could be extracted from the document");

    // Create conversion record
    const { data: conversion, error: convError } = await supabase
      .from("conversions")
      .insert({
        user_id: user.id,
        voice_clone_id: voiceCloneId,
        original_filename: filename || "document.txt",
        document_storage_path: documentPath,
        status: "parsing",
        progress: 10,
      })
      .select()
      .single();
    if (convError) throw new Error(`Failed to create conversion: ${convError.message}`);

    // Split into chapters
    const chapters = splitIntoChapters(text);

    await supabase.from("conversions").update({
      status: "converting",
      progress: 20,
      chapters: chapters.map((c, i) => ({
        index: i,
        title: c.title,
        charCount: c.content.length,
      })),
    }).eq("id", conversion.id);

    // Convert each chapter via ElevenLabs TTS
    const audioChunks: Uint8Array[] = [];
    const chapterMeta: Array<{
      title: string;
      startSeconds: number;
      durationSeconds: number;
    }> = [];
    let totalDuration = 0;

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];

      const progress = 20 + Math.round(((i + 1) / chapters.length) * 60);
      await supabase.from("conversions").update({
        progress,
        status: "converting",
      }).eq("id", conversion.id);

      // TTS with request stitching
      const previousText = i > 0 ? chapters[i - 1].content.slice(-200) : undefined;
      const nextText = i < chapters.length - 1 ? chapters[i + 1].content.slice(0, 200) : undefined;

      const ttsBody: Record<string, unknown> = {
        text: chapter.content,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.8,
          style: 0.3,
          use_speaker_boost: true,
        },
      };
      if (speed && speed !== 1.0) ttsBody.speed = speed;
      if (previousText) ttsBody.previous_text = previousText;
      if (nextText) ttsBody.next_text = nextText;

      const ttsResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice.elevenlabs_voice_id}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(ttsBody),
        }
      );

      if (!ttsResponse.ok) {
        const errText = await ttsResponse.text();
        await supabase.from("conversions").update({ status: "failed" }).eq("id", conversion.id);
        throw new Error(`TTS failed for chapter ${i + 1} [${ttsResponse.status}]: ${errText}`);
      }

      const audioBuffer = await ttsResponse.arrayBuffer();
      const audioBytes = new Uint8Array(audioBuffer);
      audioChunks.push(audioBytes);

      // Estimate duration: ~128kbps MP3
      const estimatedDuration = audioBuffer.byteLength / 16000;
      chapterMeta.push({
        title: chapter.title,
        startSeconds: totalDuration,
        durationSeconds: estimatedDuration,
      });
      totalDuration += estimatedDuration;
    }

    // Combine all audio chunks
    const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    // Upload to storage
    const audioPath = `${user.id}/${conversion.id}.mp3`;
    const { error: audioUploadError } = await supabase.storage
      .from("audiobooks")
      .upload(audioPath, combined, { contentType: "audio/mpeg" });
    if (audioUploadError) throw new Error(`Audio upload failed: ${audioUploadError.message}`);

    // Update conversion as done
    await supabase.from("conversions").update({
      status: "done",
      progress: 100,
      audio_storage_path: audioPath,
      total_duration_seconds: totalDuration,
      chapters: chapterMeta,
    }).eq("id", conversion.id);

    return new Response(JSON.stringify({
      id: conversion.id,
      chapters: chapterMeta,
      totalDuration,
      audioPath,
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
