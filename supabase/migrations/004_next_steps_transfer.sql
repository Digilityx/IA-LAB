-- 004_next_steps_transfer.sql
-- Ajouter les champs next_steps et transfer_status aux use cases

ALTER TABLE use_cases
  ADD COLUMN next_steps TEXT,
  ADD COLUMN transfer_status TEXT;
