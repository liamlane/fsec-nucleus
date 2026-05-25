-- Nucleus Personal OS — Database Schema

-- ─────────────────────────────────────────
-- FINANCE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('current','savings','credit','investment','cash','loan')),
  balance NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'GBP',
  colour TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'bank',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  colour TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'tag',
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
  description TEXT,
  merchant TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  recurring BOOLEAN DEFAULT FALSE,
  recurring_interval TEXT CHECK (recurring_interval IN ('daily','weekly','monthly','yearly')),
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('weekly','monthly','yearly')),
  start_date DATE DEFAULT CURRENT_DATE,
  colour TEXT DEFAULT '#6366f1'
);

CREATE TABLE IF NOT EXISTS financial_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  target_amount NUMERIC(12,2) NOT NULL,
  current_amount NUMERIC(12,2) DEFAULT 0,
  target_date DATE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  colour TEXT DEFAULT '#10b981',
  icon TEXT DEFAULT 'target',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- LIFE GOALS & OKRs
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS life_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  colour TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'compass'
);

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  life_area_id UUID REFERENCES life_areas(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','paused','abandoned')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  target_date DATE,
  progress INT DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  parent_goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  due_date DATE,
  completed_at TIMESTAMPTZ
);

-- ─────────────────────────────────────────
-- HABITS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  frequency_days INT[] DEFAULT '{1,2,3,4,5,6,7}',
  colour TEXT DEFAULT '#f59e0b',
  icon TEXT DEFAULT 'zap',
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  target_streak INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed BOOLEAN DEFAULT TRUE,
  notes TEXT,
  UNIQUE(habit_id, date)
);

-- ─────────────────────────────────────────
-- NOTES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  colour TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'book'
);

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID REFERENCES notebooks(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Untitled',
  content TEXT DEFAULT '',
  tags TEXT[],
  pinned BOOLEAN DEFAULT FALSE,
  colour TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- CALENDAR & EVENTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT FALSE,
  colour TEXT DEFAULT '#6366f1',
  category TEXT DEFAULT 'personal',
  location TEXT,
  url TEXT,
  recurring BOOLEAN DEFAULT FALSE,
  recurring_rule TEXT,
  reminder_minutes INT,
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- JOURNAL & MOOD
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  content TEXT,
  mood INT CHECK (mood BETWEEN 1 AND 10),
  mood_label TEXT,
  energy INT CHECK (energy BETWEEN 1 AND 5),
  gratitude TEXT[],
  tags TEXT[],
  weather TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date)
);

-- ─────────────────────────────────────────
-- TIME TRACKING
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  colour TEXT DEFAULT '#6366f1',
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES time_projects(id) ON DELETE CASCADE,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_seconds INT,
  tags TEXT[]
);

-- ─────────────────────────────────────────
-- DEFAULT DATA
-- ─────────────────────────────────────────
INSERT INTO life_areas (name, colour, icon) VALUES
  ('Health & Fitness', '#10b981', 'heart'),
  ('Finance & Wealth', '#f59e0b', 'pound-sterling'),
  ('Career & Skills', '#6366f1', 'briefcase'),
  ('Relationships', '#ec4899', 'users'),
  ('Personal Growth', '#8b5cf6', 'sparkles'),
  ('Fun & Recreation', '#f97316', 'gamepad-2')
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, type, colour, icon) VALUES
  ('Salary', 'income', '#10b981', 'briefcase'),
  ('Freelance', 'income', '#6366f1', 'laptop'),
  ('Benefits', 'income', '#f59e0b', 'landmark'),
  ('Other Income', 'income', '#14b8a6', 'plus'),
  ('Rent / Mortgage', 'expense', '#ef4444', 'home'),
  ('Groceries', 'expense', '#f97316', 'shopping-cart'),
  ('Transport', 'expense', '#3b82f6', 'car'),
  ('Entertainment', 'expense', '#8b5cf6', 'film'),
  ('Eating Out', 'expense', '#ec4899', 'utensils'),
  ('Utilities', 'expense', '#6b7280', 'zap'),
  ('Health', 'expense', '#10b981', 'stethoscope'),
  ('Clothing', 'expense', '#f59e0b', 'shirt'),
  ('Subscriptions', 'expense', '#6366f1', 'repeat'),
  ('Savings', 'expense', '#14b8a6', 'piggy-bank'),
  ('Childcare', 'expense', '#ec4899', 'baby'),
  ('Alcohol & Tobacco', 'expense', '#92400e', 'wine'),
  ('Personal Care', 'expense', '#d946ef', 'scissors'),
  ('Miscellaneous', 'expense', '#6b7280', 'more-horizontal')
ON CONFLICT DO NOTHING;

INSERT INTO notebooks (name, colour, icon) VALUES
  ('Personal', '#6366f1', 'user'),
  ('Work', '#3b82f6', 'briefcase'),
  ('Ideas', '#f59e0b', 'lightbulb')
ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS payees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'person' CHECK (type IN ('person','company','service')),
  notes TEXT,
  colour TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payee_id UUID REFERENCES payees(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS next_due DATE;
-- ============================================================
-- STAGE 4 MIGRATION – additive, safe to run multiple times
-- ============================================================

-- 1. App logs (for the log viewer)
CREATE TABLE IF NOT EXISTS app_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level         TEXT NOT NULL CHECK (level IN ('info','warn','error','debug')),
    module        TEXT,
    message       TEXT NOT NULL,
    meta          JSONB,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON app_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);

-- 2. Earl list ("My Name Is Earl" style)
CREATE TABLE IF NOT EXISTS earl_list (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person      TEXT NOT NULL,
    situation   TEXT NOT NULL,
    resolved    BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Sleep logs
CREATE TABLE IF NOT EXISTS sleep_logs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date             DATE NOT NULL UNIQUE,
    bed_time         TIMESTAMPTZ,
    wake_time        TIMESTAMPTZ,
    duration_minutes INT,
    quality          INT CHECK (quality BETWEEN 1 AND 5),
    notes            TEXT
);
CREATE INDEX IF NOT EXISTS idx_sleep_logs_date ON sleep_logs(date);

-- 4. Media list (books, films, series, etc.)
CREATE TABLE IF NOT EXISTS media_list (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    type        TEXT CHECK (type IN ('book','film','series','podcast','game')),
    status      TEXT DEFAULT 'want' CHECK (status IN ('want','in_progress','done')),
    rating      INT CHECK (rating BETWEEN 1 AND 5),
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Contacts tracker
CREATE TABLE IF NOT EXISTS contacts_tracker (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    TEXT NOT NULL,
    relationship            TEXT,
    last_contacted          DATE,
    contact_frequency_days  INT DEFAULT 30,
    notes                   TEXT
);

-- 6. Reference data management – add soft‑delete flags and user_managed columns
ALTER TABLE life_areas ADD COLUMN IF NOT EXISTS user_managed BOOLEAN DEFAULT TRUE;
ALTER TABLE life_areas ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
-- Mark the default seeded areas as not user‑managed (so they can be hidden but not deleted)
UPDATE life_areas SET user_managed = FALSE WHERE name IN ('Health','Finance','Career','Relationships','Personal Growth','Fun');

ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- 7. Goal linking – add goal_id to time_projects if not already present
ALTER TABLE time_projects ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_time_projects_goal_id ON time_projects(goal_id);

-- (habits already has goal_id – just ensure index exists)
CREATE INDEX IF NOT EXISTS idx_habits_goal_id ON habits(goal_id);

-- 8. Add updated_at triggers for all main tables (optional but useful)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('goals','habits','notes','events','time_projects','time_entries','journal_entries','transactions')
    LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()', tbl);
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = format('update_%I_updated_at', tbl)) THEN
            EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', tbl, tbl);
        END IF;
    END LOOP;
END;
$$;
