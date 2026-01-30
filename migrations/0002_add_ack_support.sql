-- Migration number: 0002 	 2026-01-25T09:00:00.000Z
-- Add Acknowledgement support

ALTER TABLE reminders ADD COLUMN ack_required INTEGER DEFAULT 0; -- boolean 0/1
ALTER TABLE reminders ADD COLUMN ack_status TEXT DEFAULT 'none'; -- none, pending, completed
ALTER TABLE reminders ADD COLUMN last_ack_at INTEGER;
