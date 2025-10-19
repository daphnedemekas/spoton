-- Add image_url and event_link columns to events table
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS event_link TEXT;