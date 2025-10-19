-- Create table to cache website suggestions
CREATE TABLE IF NOT EXISTS public.website_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  interests TEXT[] NOT NULL,
  websites JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_website_suggestions_city ON public.website_suggestions(city);

-- Enable RLS
ALTER TABLE public.website_suggestions ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read cached suggestions
CREATE POLICY "Anyone can view cached suggestions"
ON public.website_suggestions
FOR SELECT
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_website_suggestions_updated_at
BEFORE UPDATE ON public.website_suggestions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();