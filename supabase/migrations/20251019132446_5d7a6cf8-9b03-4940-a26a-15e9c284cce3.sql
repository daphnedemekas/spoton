-- Update RLS policy to use new status values
DROP POLICY IF EXISTS "Anyone can view public attendance" ON public.event_attendance;

CREATE POLICY "Anyone can view public attendance"
ON public.event_attendance
FOR SELECT
USING (status = ANY (ARRAY['saved'::text, 'attended'::text]));