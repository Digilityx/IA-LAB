-- 002_extend_schema.sql
-- Extend schema for Airtable Excel import

-- 1. Add 'abandoned' to use_case_status enum
ALTER TYPE use_case_status ADD VALUE 'abandoned';

-- 2. Add new columns to use_cases for Airtable fields
ALTER TABLE use_cases
  ADD COLUMN deliverable_type TEXT,    -- "Build" / "Bonnes pratiques"
  ADD COLUMN usage_type TEXT,          -- "Interne Digi" / "Productivité missions" / "Vente"
  ADD COLUMN tools TEXT,               -- Outils pressentis (free text)
  ADD COLUMN target_users TEXT,        -- Utilisateur de la solution (free text)
  ADD COLUMN benchmark_url TEXT,       -- Lien du benchmark solutions existantes
  ADD COLUMN journey_url TEXT;         -- Lien parcours

-- 3. Handle placeholder profiles (team members without auth accounts)
-- Drop FK to auth.users to allow placeholder profile creation
ALTER TABLE profiles DROP CONSTRAINT profiles_id_fkey;

-- Add placeholder marker column
ALTER TABLE profiles ADD COLUMN is_placeholder BOOLEAN NOT NULL DEFAULT false;

-- Index for quick lookup of placeholders
CREATE INDEX idx_profiles_placeholder ON profiles(is_placeholder) WHERE is_placeholder = true;

-- 4. Allow admins to create profiles directly (for placeholder creation from UI)
CREATE POLICY "Admins can create placeholder profiles" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
