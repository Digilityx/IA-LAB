-- Add missing DELETE policy on sprints table
-- Previously only SELECT, INSERT, UPDATE were defined, so RLS silently blocked deletions

CREATE POLICY "Members can delete sprints" ON sprints
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );
