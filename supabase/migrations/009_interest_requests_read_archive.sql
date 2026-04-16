-- Add is_read and is_archived columns to interest_requests
-- Enables marking notifications as read/unread and archiving them

ALTER TABLE interest_requests ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE interest_requests ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;

-- Add DELETE policy for interest_requests (members/admins can delete)
CREATE POLICY "Members can delete interest requests" ON interest_requests
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );
