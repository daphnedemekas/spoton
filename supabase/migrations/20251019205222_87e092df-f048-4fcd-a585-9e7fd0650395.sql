-- Update the event_attendance status check constraint to include 'saved'
ALTER TABLE public.event_attendance 
DROP CONSTRAINT event_attendance_status_check;

ALTER TABLE public.event_attendance 
ADD CONSTRAINT event_attendance_status_check 
CHECK (status IN ('suggested', 'saved', 'will_attend', 'attended'));