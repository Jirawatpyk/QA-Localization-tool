-- Enable Realtime for scores and findings tables so review page
-- receives postgres_changes events for live score updates and new findings.
-- Without this, Realtime channels subscribe but never fire events,
-- silently degrading to polling-only mode.

ALTER PUBLICATION supabase_realtime ADD TABLE scores;
ALTER PUBLICATION supabase_realtime ADD TABLE findings;
