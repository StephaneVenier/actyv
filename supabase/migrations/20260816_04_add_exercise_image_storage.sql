BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'exercise-images'
  ) THEN
    UPDATE storage.buckets
    SET
      name = 'exercise-images',
      public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/webp']
    WHERE id = 'exercise-images';
  ELSE
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    VALUES (
      'exercise-images',
      'exercise-images',
      true,
      5242880,
      ARRAY['image/webp']
    );
  END IF;
END
$$;

COMMIT;
