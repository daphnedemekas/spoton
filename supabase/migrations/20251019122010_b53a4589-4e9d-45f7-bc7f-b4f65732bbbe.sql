-- Create events table
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  date date NOT NULL,
  location text NOT NULL,
  vibes text[] NOT NULL,
  interests text[] NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create event attendance table
CREATE TABLE public.event_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL CHECK (status IN ('suggested', 'will_attend', 'attended')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, event_id)
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attendance ENABLE ROW LEVEL SECURITY;

-- Events are publicly readable
CREATE POLICY "Anyone can view events"
  ON public.events FOR SELECT
  USING (true);

-- RLS Policies for event_attendance
CREATE POLICY "Users can view own attendance"
  ON public.event_attendance FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own attendance"
  ON public.event_attendance FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own attendance"
  ON public.event_attendance FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own attendance"
  ON public.event_attendance FOR DELETE
  USING (auth.uid() = user_id);

-- Allow public viewing of attendance for will_attend and attended events
CREATE POLICY "Anyone can view public attendance"
  ON public.event_attendance FOR SELECT
  USING (status IN ('will_attend', 'attended'));

-- Make profiles publicly readable for user search
CREATE POLICY "Anyone can view profiles"
  ON public.profiles FOR SELECT
  USING (true);

-- Add trigger for event_attendance updated_at
CREATE TRIGGER update_event_attendance_updated_at
  BEFORE UPDATE ON public.event_attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample events
INSERT INTO public.events (title, description, date, location, vibes, interests) VALUES
  ('Sunset Yoga in the Park', 'Join us for a peaceful outdoor yoga session as the sun sets', '2025-10-20', 'Golden Gate Park', ARRAY['Peaceful', 'Recurring'], ARRAY['Yoga', 'Meditation']),
  ('Live Jazz Night', 'Experience incredible live jazz performances from local artists', '2025-10-19', 'The Blue Note', ARRAY['Epic', 'Exciting'], ARRAY['Music']),
  ('Art Gallery Opening', 'Discover new contemporary art at this exclusive gallery opening', '2025-10-21', 'SFMOMA', ARRAY['Unique', 'Exciting'], ARRAY['Arts']),
  ('Community Basketball Tournament', 'Watch or participate in friendly basketball games', '2025-10-19', 'Mission Recreation Center', ARRAY['Epic', 'Recurring'], ARRAY['Sports']),
  ('Guided Meditation Workshop', 'Learn mindfulness techniques in this beginner-friendly workshop', '2025-10-22', 'Zen Center', ARRAY['Peaceful'], ARRAY['Meditation']),
  ('Outdoor Music Festival', 'All-day music festival featuring local bands', '2025-10-23', 'Dolores Park', ARRAY['Epic', 'Exciting'], ARRAY['Music']),
  ('Weekly Running Club', 'Join our community for a morning run', '2025-10-20', 'Marina Green', ARRAY['Recurring'], ARRAY['Sports']),
  ('Pottery Making Class', 'Learn to create beautiful ceramics', '2025-10-24', 'Art Studio SF', ARRAY['Unique', 'Peaceful'], ARRAY['Arts']);