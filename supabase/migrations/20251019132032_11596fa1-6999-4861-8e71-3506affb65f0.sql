-- Delete all events
DELETE FROM public.events;

-- Remove image_url column from events table
ALTER TABLE public.events DROP COLUMN IF EXISTS image_url;