
-- Allow anonymous uploads to voice-samples bucket
CREATE POLICY "Allow anonymous voice sample uploads"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'voice-samples');

-- Allow service role to read voice samples (edge function uses service role already)
CREATE POLICY "Allow reading voice samples"
ON storage.objects
FOR SELECT
USING (bucket_id = 'voice-samples');
