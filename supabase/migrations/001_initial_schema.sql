-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'member', 'viewer');
CREATE TYPE sprint_status AS ENUM ('planned', 'active', 'completed');
CREATE TYPE use_case_status AS ENUM ('backlog', 'todo', 'in_progress', 'done');
CREATE TYPE use_case_category AS ENUM ('IMPACT', 'LAB', 'PRODUCT');
CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE member_role AS ENUM ('owner', 'contributor', 'reviewer');
CREATE TYPE interest_type AS ENUM ('interested', 'want_to_use', 'propose_to_client');
CREATE TYPE interest_status AS ENUM ('pending', 'contacted', 'resolved');

-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'member',
  avatar_url TEXT,
  department TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Sprints
CREATE TABLE sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status sprint_status NOT NULL DEFAULT 'planned',
  created_by UUID REFERENCES profiles(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Use Cases
CREATE TABLE use_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status use_case_status NOT NULL DEFAULT 'backlog',
  category use_case_category NOT NULL DEFAULT 'LAB',
  priority priority_level NOT NULL DEFAULT 'medium',
  sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES profiles(id) NOT NULL,
  documentation TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  cover_image_url TEXT,
  short_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Use Case Members
CREATE TABLE use_case_members (
  use_case_id UUID REFERENCES use_cases(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'contributor',
  PRIMARY KEY (use_case_id, profile_id)
);

-- Tags
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1'
);

-- Use Case Tags (junction table)
CREATE TABLE use_case_tags (
  use_case_id UUID REFERENCES use_cases(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (use_case_id, tag_id)
);

-- Use Case Metrics
CREATE TABLE use_case_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id UUID REFERENCES use_cases(id) ON DELETE CASCADE UNIQUE,
  margin_generated NUMERIC,
  man_days_estimated NUMERIC,
  man_days_actual NUMERIC,
  man_days_saved NUMERIC GENERATED ALWAYS AS (man_days_estimated - man_days_actual) STORED,
  mrr NUMERIC,
  additional_business NUMERIC,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Interest Requests
CREATE TABLE interest_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id UUID REFERENCES use_cases(id) ON DELETE CASCADE NOT NULL,
  requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type interest_type NOT NULL DEFAULT 'interested',
  message TEXT,
  status interest_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER use_cases_updated_at
  BEFORE UPDATE ON use_cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER use_case_metrics_updated_at
  BEFORE UPDATE ON use_case_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes
CREATE INDEX idx_use_cases_sprint ON use_cases(sprint_id);
CREATE INDEX idx_use_cases_owner ON use_cases(owner_id);
CREATE INDEX idx_use_cases_status ON use_cases(status);
CREATE INDEX idx_use_cases_category ON use_cases(category);
CREATE INDEX idx_use_cases_published ON use_cases(is_published) WHERE is_published = true;
CREATE INDEX idx_interest_requests_use_case ON interest_requests(use_case_id);
CREATE INDEX idx_interest_requests_requester ON interest_requests(requester_id);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE use_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE use_case_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE use_case_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE use_case_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE interest_requests ENABLE ROW LEVEL SECURITY;

-- Profiles: everyone can read, only self can update
CREATE POLICY "Profiles are viewable by authenticated users" ON profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Sprints: authenticated can read, admin/member can create/update
CREATE POLICY "Sprints viewable by authenticated" ON sprints
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members can create sprints" ON sprints
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );
CREATE POLICY "Members can update sprints" ON sprints
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );

-- Use Cases: authenticated can read, admin/member can CUD
CREATE POLICY "Use cases viewable by authenticated" ON use_cases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members can create use cases" ON use_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );
CREATE POLICY "Members can update use cases" ON use_cases
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );
CREATE POLICY "Admins can delete use cases" ON use_cases
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Use Case Members: authenticated can read, admin/member can manage
CREATE POLICY "Members viewable by authenticated" ON use_case_members
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members can manage use case members" ON use_case_members
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );

-- Tags: everyone reads, admin/member can manage
CREATE POLICY "Tags viewable by authenticated" ON tags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members can manage tags" ON tags
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );

-- Use Case Tags
CREATE POLICY "Use case tags viewable by authenticated" ON use_case_tags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members can manage use case tags" ON use_case_tags
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );

-- Use Case Metrics
CREATE POLICY "Metrics viewable by authenticated" ON use_case_metrics
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members can manage metrics" ON use_case_metrics
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );

-- Interest Requests: authenticated can read own + use case owners, anyone can create
CREATE POLICY "Interest requests viewable by authenticated" ON interest_requests
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create interest requests" ON interest_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Owners can update interest request status" ON interest_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM use_cases
      WHERE use_cases.id = interest_requests.use_case_id
      AND use_cases.owner_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
