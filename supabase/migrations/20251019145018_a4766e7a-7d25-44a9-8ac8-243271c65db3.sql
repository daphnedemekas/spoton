-- Allow authenticated users to insert events (needed for discover-events function)
CREATE POLICY "Authenticated users can insert events"
ON public.events
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update events (for future updates)
CREATE POLICY "Authenticated users can update events"
ON public.events
FOR UPDATE
TO authenticated
USING (true);