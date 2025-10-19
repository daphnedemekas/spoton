-- Create table to track event interactions for personalization
CREATE TABLE public.event_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_title TEXT NOT NULL,
  event_description TEXT NOT NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('saved', 'removed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_interactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own interactions"
ON public.event_interactions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own interactions"
ON public.event_interactions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_event_interactions_user_id ON public.event_interactions(user_id);
CREATE INDEX idx_event_interactions_created_at ON public.event_interactions(created_at DESC);

COMMENT ON TABLE public.event_interactions IS 'Tracks user interactions with events (saved/removed) for personalization';