-- Add time field to events table
ALTER TABLE public.events
ADD COLUMN time text;

-- Add comment explaining the time format
COMMENT ON COLUMN public.events.time IS 'Event time in format like "7:00 PM" or "2:00 PM - 4:00 PM"';