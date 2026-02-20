
-- Storage buckets for voice samples and generated audiobooks
INSERT INTO storage.buckets (id, name, public) VALUES ('voice-samples', 'voice-samples', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('audiobooks', 'audiobooks', false);

-- Voice clones table
CREATE TABLE public.voice_clones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  elevenlabs_voice_id TEXT,
  sample_storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_clones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clones" ON public.voice_clones FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own clones" ON public.voice_clones FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own clones" ON public.voice_clones FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own clones" ON public.voice_clones FOR DELETE USING (auth.uid() = user_id);

-- Conversions table
CREATE TABLE public.conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  voice_clone_id UUID REFERENCES public.voice_clones(id),
  original_filename TEXT NOT NULL,
  document_storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'parsing', 'converting', 'encoding', 'done', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0,
  chapters JSONB DEFAULT '[]'::jsonb,
  audio_storage_path TEXT,
  total_duration_seconds NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversions" ON public.conversions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own conversions" ON public.conversions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversions" ON public.conversions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conversions" ON public.conversions FOR DELETE USING (auth.uid() = user_id);

-- Storage policies
CREATE POLICY "Users can upload voice samples" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'voice-samples' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can read own voice samples" ON storage.objects FOR SELECT USING (bucket_id = 'voice-samples' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own voice samples" ON storage.objects FOR DELETE USING (bucket_id = 'voice-samples' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload audiobooks" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'audiobooks' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can read own audiobooks" ON storage.objects FOR SELECT USING (bucket_id = 'audiobooks' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own audiobooks" ON storage.objects FOR DELETE USING (bucket_id = 'audiobooks' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_conversions_updated_at
BEFORE UPDATE ON public.conversions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
