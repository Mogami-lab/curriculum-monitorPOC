-- ============================================================
-- ROW-LEVEL SECURITY POLICIES
-- ============================================================

-- Enable RLS on all sensitive tables
ALTER TABLE user_profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_topics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_subtopics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_cognitive_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_evidence        ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications              ENABLE ROW LEVEL SECURITY;

-- Reference tables are readable by all authenticated users
ALTER TABLE provinces     ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools       ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE weeks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE atp_topics    ENABLE ROW LEVEL SECURITY;
ALTER TABLE atp_subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_expectations ENABLE ROW LEVEL SECURITY;

-- Helper: get calling user's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT STABLE LANGUAGE SQL AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$;

-- Helper: get calling user's school_id
CREATE OR REPLACE FUNCTION get_my_school_id()
RETURNS UUID STABLE LANGUAGE SQL AS $$
  SELECT school_id FROM user_profiles WHERE id = auth.uid()
$$;

-- ============================================================
-- REFERENCE TABLES — read for all authenticated
-- ============================================================

CREATE POLICY "ref_read" ON provinces     FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ref_read" ON districts     FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ref_read" ON circuits      FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ref_read" ON schools       FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ref_read" ON grades        FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ref_read" ON subjects      FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ref_read" ON terms         FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ref_read" ON weeks         FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ref_read" ON atp_topics    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ref_read" ON atp_subtopics FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ref_read" ON weekly_expectations FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- USER PROFILES
-- ============================================================

-- Users can read their own profile
CREATE POLICY "profile_read_own" ON user_profiles
  FOR SELECT USING (id = auth.uid());

-- Curriculum officials can read all profiles
CREATE POLICY "profile_read_official" ON user_profiles
  FOR SELECT USING (get_my_role() = 'curriculum_official');

-- DH can read profiles in their school
CREATE POLICY "profile_read_dh" ON user_profiles
  FOR SELECT USING (
    get_my_role() = 'departmental_head'
    AND school_id = get_my_school_id()
  );

-- Users can update their own profile
CREATE POLICY "profile_update_own" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- ============================================================
-- SUBMISSIONS
-- ============================================================

-- Educators: see only own school submissions
CREATE POLICY "submissions_educator" ON submissions
  FOR SELECT USING (
    get_my_role() = 'educator'
    AND school_id = get_my_school_id()
  );

-- DH: see own school
CREATE POLICY "submissions_dh" ON submissions
  FOR SELECT USING (
    get_my_role() = 'departmental_head'
    AND school_id = get_my_school_id()
  );

-- Curriculum official: see all
CREATE POLICY "submissions_official" ON submissions
  FOR SELECT USING (get_my_role() = 'curriculum_official');

-- Educators: insert/update their own submissions
CREATE POLICY "submissions_insert" ON submissions
  FOR INSERT WITH CHECK (
    get_my_role() = 'educator'
    AND school_id = get_my_school_id()
    AND submitted_by = auth.uid()
  );

CREATE POLICY "submissions_update_own" ON submissions
  FOR UPDATE USING (
    get_my_role() = 'educator'
    AND submitted_by = auth.uid()
    AND status IN ('draft','submitted')
  );

-- ============================================================
-- SUBMISSION CHILD TABLES (topics, subtopics, levels, evidence)
-- ============================================================

-- Helper macro pattern: gate on submissions access
CREATE POLICY "sub_topics_read" ON submission_topics
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM submissions s WHERE s.id = submission_id AND (
      (get_my_role() = 'educator'             AND s.school_id = get_my_school_id()) OR
      (get_my_role() = 'departmental_head'    AND s.school_id = get_my_school_id()) OR
      (get_my_role() = 'curriculum_official')
    ))
  );

CREATE POLICY "sub_topics_insert" ON submission_topics
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM submissions s
            WHERE s.id = submission_id AND s.submitted_by = auth.uid())
  );

CREATE POLICY "sub_topics_delete" ON submission_topics
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM submissions s
            WHERE s.id = submission_id AND s.submitted_by = auth.uid())
  );

CREATE POLICY "sub_subtopics_read" ON submission_subtopics
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM submissions s WHERE s.id = submission_id AND (
      (get_my_role() = 'educator'             AND s.school_id = get_my_school_id()) OR
      (get_my_role() = 'departmental_head'    AND s.school_id = get_my_school_id()) OR
      (get_my_role() = 'curriculum_official')
    ))
  );

CREATE POLICY "sub_subtopics_insert" ON submission_subtopics
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM submissions s
            WHERE s.id = submission_id AND s.submitted_by = auth.uid())
  );

CREATE POLICY "sub_subtopics_delete" ON submission_subtopics
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM submissions s
            WHERE s.id = submission_id AND s.submitted_by = auth.uid())
  );

CREATE POLICY "sub_cog_read" ON submission_cognitive_levels
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM submissions s WHERE s.id = submission_id AND (
      (get_my_role() = 'educator'             AND s.school_id = get_my_school_id()) OR
      (get_my_role() = 'departmental_head'    AND s.school_id = get_my_school_id()) OR
      (get_my_role() = 'curriculum_official')
    ))
  );

CREATE POLICY "sub_cog_insert" ON submission_cognitive_levels
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM submissions s
            WHERE s.id = submission_id AND s.submitted_by = auth.uid())
  );

CREATE POLICY "sub_cog_delete" ON submission_cognitive_levels
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM submissions s
            WHERE s.id = submission_id AND s.submitted_by = auth.uid())
  );

CREATE POLICY "evidence_read" ON submission_evidence
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM submissions s WHERE s.id = submission_id AND (
      (get_my_role() = 'educator'             AND s.school_id = get_my_school_id()) OR
      (get_my_role() = 'departmental_head'    AND s.school_id = get_my_school_id()) OR
      (get_my_role() = 'curriculum_official')
    ))
  );

CREATE POLICY "evidence_insert" ON submission_evidence
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM submissions s
            WHERE s.id = submission_id AND s.submitted_by = auth.uid())
  );

-- ============================================================
-- VERIFICATIONS
-- ============================================================

-- DH can insert verifications for own school
CREATE POLICY "verification_insert" ON verifications
  FOR INSERT WITH CHECK (
    get_my_role() = 'departmental_head'
    AND EXISTS (
      SELECT 1 FROM submissions s WHERE s.id = submission_id
      AND s.school_id = get_my_school_id()
    )
  );

-- DH can update own verifications
CREATE POLICY "verification_update" ON verifications
  FOR UPDATE USING (
    get_my_role() = 'departmental_head'
    AND verified_by = auth.uid()
  );

-- All roles can read verifications for accessible submissions
CREATE POLICY "verification_read" ON verifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM submissions s WHERE s.id = submission_id AND (
      (get_my_role() = 'educator'             AND s.school_id = get_my_school_id()) OR
      (get_my_role() = 'departmental_head'    AND s.school_id = get_my_school_id()) OR
      (get_my_role() = 'curriculum_official')
    ))
  );

-- ============================================================
-- STORAGE BUCKET POLICY (run in Supabase dashboard or via API)
-- ============================================================
-- Create a bucket called "evidence" with the following settings:
-- Public: false
-- File size limit: 10MB
-- Allowed MIME types: image/jpeg, image/png, image/webp, application/pdf

-- Then add these storage policies in the dashboard:
-- INSERT: authenticated users only, path must start with their user ID
-- SELECT: users in same school OR curriculum officials

-- Example storage RLS (pseudo-SQL for Supabase storage):
-- CREATE POLICY "evidence_upload" ON storage.objects
--   FOR INSERT WITH CHECK (
--     bucket_id = 'evidence' AND auth.uid() IS NOT NULL
--   );
-- CREATE POLICY "evidence_read" ON storage.objects
--   FOR SELECT USING (
--     bucket_id = 'evidence' AND auth.uid() IS NOT NULL
--   );
