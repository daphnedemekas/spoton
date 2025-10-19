-- Clear all existing events
DELETE FROM events;

-- Fix RLS policies for website_suggestions to allow caching
DROP POLICY IF EXISTS "Anyone can view cached suggestions" ON website_suggestions;

CREATE POLICY "Anyone can view cached suggestions"
ON website_suggestions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can cache suggestions"
ON website_suggestions FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update cached suggestions"
ON website_suggestions FOR UPDATE
TO authenticated
USING (true);