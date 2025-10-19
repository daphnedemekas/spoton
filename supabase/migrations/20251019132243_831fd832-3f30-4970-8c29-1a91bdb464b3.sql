-- Update existing status values to new terminology
UPDATE public.event_attendance 
SET status = 'saved' 
WHERE status = 'will_attend';

UPDATE public.event_attendance 
SET status = 'not_attended' 
WHERE status = 'wont_attend';

-- Add a comment to document the valid status values
COMMENT ON COLUMN public.event_attendance.status IS 'Valid values: saved, attended, not_attended';