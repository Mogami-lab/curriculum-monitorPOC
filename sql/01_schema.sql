-- ============================================================
-- CURRICULUM COVERAGE MONITOR — SUPABASE SCHEMA
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- REFERENCE / LOOKUP TABLES
-- ============================================================

CREATE TABLE provinces (
  id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE districts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  province_id UUID NOT NULL REFERENCES provinces(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(province_id, code)
);

CREATE TABLE circuits (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(district_id, code)
);

CREATE TABLE schools (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  circuit_id UUID NOT NULL REFERENCES circuits(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  emis_no    TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE grades (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  sort_order INT  NOT NULL DEFAULT 0
);

CREATE TABLE subjects (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  code       TEXT NOT NULL UNIQUE
);

CREATE TABLE terms (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  sort_order INT  NOT NULL DEFAULT 0
);

CREATE TABLE weeks (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  term_id    UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  week_number INT NOT NULL,
  label      TEXT NOT NULL,
  UNIQUE(term_id, week_number)
);

-- ============================================================
-- ATP CURRICULUM STRUCTURE
-- ============================================================

CREATE TABLE atp_topics (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grade_id   UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  code       TEXT,
  title      TEXT NOT NULL,
  sort_order INT  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE atp_subtopics (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id   UUID NOT NULL REFERENCES atp_topics(id) ON DELETE CASCADE,
  code       TEXT,
  title      TEXT NOT NULL,
  sort_order INT  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Which topics are expected in which week
CREATE TABLE weekly_expectations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id   UUID NOT NULL REFERENCES atp_topics(id) ON DELETE CASCADE,
  week_id    UUID NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  term_id    UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(topic_id, week_id)
);

-- ============================================================
-- USER PROFILES (extends Supabase auth.users)
-- ============================================================

CREATE TABLE user_profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id  UUID REFERENCES schools(id),
  full_name  TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('educator','departmental_head','curriculum_official')),
  subject_id UUID REFERENCES subjects(id),
  grade_id   UUID REFERENCES grades(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUBMISSIONS
-- ============================================================

CREATE TABLE submissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID NOT NULL REFERENCES schools(id),
  grade_id        UUID NOT NULL REFERENCES grades(id),
  subject_id      UUID NOT NULL REFERENCES subjects(id),
  term_id         UUID NOT NULL REFERENCES terms(id),
  week_id         UUID NOT NULL REFERENCES weeks(id),
  submitted_by    UUID NOT NULL REFERENCES auth.users(id),
  status          TEXT NOT NULL DEFAULT 'submitted'
                    CHECK (status IN ('draft','submitted','verified','flagged')),
  has_evidence    BOOLEAN NOT NULL DEFAULT FALSE,
  coverage_pct    NUMERIC(5,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, grade_id, subject_id, term_id, week_id)
);

CREATE TABLE submission_topics (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  topic_id      UUID NOT NULL REFERENCES atp_topics(id),
  UNIQUE(submission_id, topic_id)
);

CREATE TABLE submission_subtopics (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  subtopic_id   UUID NOT NULL REFERENCES atp_subtopics(id),
  UNIQUE(submission_id, subtopic_id)
);

CREATE TABLE submission_cognitive_levels (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  level         INT  NOT NULL CHECK (level IN (1,2,3,4)),
  UNIQUE(submission_id, level)
);

CREATE TABLE submission_evidence (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id  UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  evidence_type  TEXT NOT NULL CHECK (evidence_type IN ('learner_script','workbook','classwork','homework','test','other')),
  file_name      TEXT NOT NULL,
  storage_path   TEXT NOT NULL,
  mime_type      TEXT,
  file_size_kb   INT,
  uploaded_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VERIFICATION
-- ============================================================

CREATE TABLE verifications (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id         UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  verified_by           UUID NOT NULL REFERENCES auth.users(id),
  verified_at           TIMESTAMPTZ DEFAULT NOW(),
  decision              TEXT NOT NULL CHECK (decision IN ('verified','flagged')),
  verification_comment  TEXT,
  UNIQUE(submission_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_submissions_school    ON submissions(school_id);
CREATE INDEX idx_submissions_grade     ON submissions(grade_id);
CREATE INDEX idx_submissions_subject   ON submissions(subject_id);
CREATE INDEX idx_submissions_term_week ON submissions(term_id, week_id);
CREATE INDEX idx_submissions_status    ON submissions(status);
CREATE INDEX idx_atp_topics_grade_subj ON atp_topics(grade_id, subject_id);
CREATE INDEX idx_atp_subtopics_topic   ON atp_subtopics(topic_id);
CREATE INDEX idx_weekly_exp_week       ON weekly_expectations(week_id);
CREATE INDEX idx_schools_circuit       ON schools(circuit_id);
CREATE INDEX idx_user_profiles_school  ON user_profiles(school_id);

-- ============================================================
-- COVERAGE CALCULATION FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_coverage(p_submission_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_covered   INT;
  v_expected  INT;
  v_topic_id  UUID;
  v_week_id   UUID;
  v_term_id   UUID;
BEGIN
  SELECT week_id, term_id INTO v_week_id, v_term_id
  FROM submissions WHERE id = p_submission_id;

  SELECT COUNT(DISTINCT ss.subtopic_id) INTO v_covered
  FROM submission_subtopics ss
  WHERE ss.submission_id = p_submission_id;

  SELECT COUNT(DISTINCT ast.id) INTO v_expected
  FROM submission_topics st
  JOIN atp_subtopics ast ON ast.topic_id = st.topic_id
  WHERE st.submission_id = p_submission_id;

  IF v_expected = 0 THEN RETURN 0; END IF;
  RETURN ROUND((v_covered::NUMERIC / v_expected::NUMERIC) * 100, 2);
END;
$$ LANGUAGE plpgsql;
