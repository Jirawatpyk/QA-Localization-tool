-- Enable Realtime for user_roles table so useRoleSync hook receives
-- postgres_changes events when admin updates a user's role.
-- Without this, the Realtime channel subscribes but never fires,
-- silently degrading to the 5-minute poll-only fallback.

ALTER PUBLICATION supabase_realtime ADD TABLE user_roles;
