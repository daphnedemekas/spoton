-- Create user_connections table for managing connections between users
CREATE TABLE public.user_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connected_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, connected_user_id)
);

-- Enable RLS
ALTER TABLE public.user_connections ENABLE ROW LEVEL SECURITY;

-- Users can view their own connections (sent and received)
CREATE POLICY "Users can view own connections"
ON public.user_connections
FOR SELECT
USING (auth.uid() = user_id OR auth.uid() = connected_user_id);

-- Users can create connection requests
CREATE POLICY "Users can create connections"
ON public.user_connections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update connections they received (to accept/decline)
CREATE POLICY "Users can update received connections"
ON public.user_connections
FOR UPDATE
USING (auth.uid() = connected_user_id);

-- Users can delete their own connection requests
CREATE POLICY "Users can delete own connections"
ON public.user_connections
FOR DELETE
USING (auth.uid() = user_id OR auth.uid() = connected_user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_connections_updated_at
BEFORE UPDATE ON public.user_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();