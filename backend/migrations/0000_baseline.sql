-- Up Migration
--
-- Baseline schema captured from live DB on 2026-06-06T11:41:26-07:00.
-- This represents the schema state at the moment node-pg-migrate
-- was adopted. DO NOT EDIT — future changes go in new migration files.
--

--
-- PostgreSQL database dump
--

\restrict WxHU9rc09typGDh44jPLGo7hveIpdPB1oHdmufzQCFD1qYcY1zN1iYji9AahSks

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    balance numeric(12,2) DEFAULT 0,
    currency text DEFAULT 'GBP'::text,
    colour text DEFAULT '#6366f1'::text,
    icon text DEFAULT 'bank'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT accounts_type_check CHECK ((type = ANY (ARRAY['current'::text, 'savings'::text, 'credit'::text, 'investment'::text, 'cash'::text, 'loan'::text])))
);


--
-- Name: app_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level text NOT NULL,
    module text,
    message text NOT NULL,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT app_logs_level_check CHECK ((level = ANY (ARRAY['info'::text, 'warn'::text, 'error'::text, 'debug'::text])))
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text NOT NULL
);


--
-- Name: budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    amount numeric(12,2) NOT NULL,
    period text NOT NULL,
    start_date date DEFAULT CURRENT_DATE,
    colour text DEFAULT '#6366f1'::text,
    CONSTRAINT budgets_period_check CHECK ((period = ANY (ARRAY['weekly'::text, 'monthly'::text, 'yearly'::text])))
);


--
-- Name: business_client_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_client_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    type text NOT NULL,
    date timestamp with time zone DEFAULT now() NOT NULL,
    summary text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT business_client_interactions_type_check CHECK ((type = ANY (ARRAY['call'::text, 'email'::text, 'meeting'::text, 'message'::text, 'note'::text, 'other'::text])))
);


--
-- Name: business_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    address text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    colour text DEFAULT '#6366f1'::text,
    company text,
    website text,
    status text DEFAULT 'lead'::text,
    hourly_rate numeric(10,2),
    notes text,
    tags text[] DEFAULT '{}'::text[],
    is_deleted boolean DEFAULT false,
    client_type text DEFAULT 'commercial'::text,
    CONSTRAINT business_clients_type_check CHECK ((client_type = ANY (ARRAY['commercial'::text, 'residential'::text])))
);


--
-- Name: business_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    project_id uuid,
    date date DEFAULT CURRENT_DATE NOT NULL,
    description text NOT NULL,
    category text,
    amount numeric(12,2) NOT NULL,
    vat_amount numeric(12,2) DEFAULT 0,
    claimable boolean DEFAULT true,
    receipt_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: business_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    project_id uuid,
    invoice_number text NOT NULL,
    issue_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date,
    amount numeric(12,2) NOT NULL,
    vat_amount numeric(12,2) DEFAULT 0,
    status text DEFAULT 'draft'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    notes text,
    line_items jsonb,
    paid_date date
);


--
-- Name: business_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    name text NOT NULL,
    description text,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean DEFAULT false,
    billing_type text DEFAULT 'fixed'::text,
    value numeric(12,2),
    start_date date,
    end_date date,
    notes text,
    colour text DEFAULT '#6366f1'::text
);


--
-- Name: business_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    project_id uuid,
    quote_number text NOT NULL,
    issue_date date DEFAULT CURRENT_DATE NOT NULL,
    valid_until date,
    amount numeric(12,2) NOT NULL,
    vat_amount numeric(12,2) DEFAULT 0,
    status text DEFAULT 'draft'::text,
    notes text,
    line_items jsonb,
    converted_to_invoice_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT business_quotes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'declined'::text, 'expired'::text])))
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    colour text DEFAULT '#6366f1'::text,
    icon text DEFAULT 'tag'::text,
    parent_id uuid,
    is_deleted boolean DEFAULT false,
    CONSTRAINT categories_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])))
);


--
-- Name: contacts_tracker; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts_tracker (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    relationship text,
    last_contacted date,
    contact_frequency_days integer DEFAULT 30,
    notes text
);


--
-- Name: content_ideas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_ideas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    notes text,
    tags text[],
    priority text DEFAULT 'medium'::text,
    used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT content_ideas_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
);


--
-- Name: earl_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.earl_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    person text NOT NULL,
    situation text NOT NULL,
    resolved boolean DEFAULT false,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    all_day boolean DEFAULT false,
    colour text DEFAULT '#6366f1'::text,
    category text DEFAULT 'personal'::text,
    location text,
    url text,
    recurring boolean DEFAULT false,
    recurring_rule text,
    reminder_minutes integer,
    goal_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: financial_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    target_amount numeric(12,2) NOT NULL,
    current_amount numeric(12,2) DEFAULT 0,
    target_date date,
    account_id uuid,
    colour text DEFAULT '#10b981'::text,
    icon text DEFAULT 'target'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    life_area_id uuid,
    title text NOT NULL,
    description text,
    status text DEFAULT 'active'::text,
    priority text DEFAULT 'medium'::text,
    target_date date,
    progress integer DEFAULT 0,
    parent_goal_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT goals_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT goals_progress_check CHECK (((progress >= 0) AND (progress <= 100))),
    CONSTRAINT goals_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'paused'::text, 'abandoned'::text])))
);


--
-- Name: habit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.habit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    habit_id uuid,
    date date DEFAULT CURRENT_DATE NOT NULL,
    completed boolean DEFAULT true,
    notes text
);


--
-- Name: habits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.habits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    frequency text NOT NULL,
    frequency_days integer[] DEFAULT '{1,2,3,4,5,6,7}'::integer[],
    colour text DEFAULT '#f59e0b'::text,
    icon text DEFAULT 'zap'::text,
    goal_id uuid,
    target_streak integer DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT habits_frequency_check CHECK ((frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text])))
);


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    content text,
    mood integer,
    mood_label text,
    energy integer,
    gratitude text[],
    tags text[],
    weather text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_checkin boolean DEFAULT false,
    CONSTRAINT journal_entries_energy_check CHECK (((energy >= 1) AND (energy <= 5))),
    CONSTRAINT journal_entries_mood_check CHECK (((mood >= 1) AND (mood <= 10)))
);


--
-- Name: life_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.life_areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    colour text DEFAULT '#6366f1'::text,
    icon text DEFAULT 'compass'::text,
    user_managed boolean DEFAULT true,
    is_deleted boolean DEFAULT false
);


--
-- Name: marketing_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    goal text,
    start_date date,
    end_date date,
    status text DEFAULT 'planning'::text,
    colour text DEFAULT '#6366f1'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketing_campaigns_status_check CHECK ((status = ANY (ARRAY['planning'::text, 'active'::text, 'completed'::text, 'paused'::text])))
);


--
-- Name: media_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    type text,
    status text DEFAULT 'want'::text,
    rating integer,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT media_list_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT media_list_status_check CHECK ((status = ANY (ARRAY['want'::text, 'in_progress'::text, 'done'::text]))),
    CONSTRAINT media_list_type_check CHECK ((type = ANY (ARRAY['book'::text, 'film'::text, 'series'::text, 'podcast'::text, 'game'::text])))
);


--
-- Name: milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_id uuid,
    title text NOT NULL,
    completed boolean DEFAULT false,
    due_date date,
    completed_at timestamp with time zone
);


--
-- Name: notebooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notebooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    colour text DEFAULT '#6366f1'::text,
    icon text DEFAULT 'book'::text,
    is_deleted boolean DEFAULT false
);


--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notebook_id uuid,
    title text DEFAULT 'Untitled'::text NOT NULL,
    content text DEFAULT ''::text,
    tags text[],
    pinned boolean DEFAULT false,
    colour text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: payees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'person'::text,
    notes text,
    colour text DEFAULT '#6366f1'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT payees_type_check CHECK ((type = ANY (ARRAY['person'::text, 'company'::text, 'service'::text])))
);


--
-- Name: post_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text,
    template text NOT NULL,
    platforms text[],
    notes text,
    is_seeded boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: sleep_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sleep_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date date NOT NULL,
    bed_time timestamp with time zone,
    wake_time timestamp with time zone,
    duration_minutes integer,
    quality integer,
    notes text,
    CONSTRAINT sleep_logs_quality_check CHECK (((quality >= 1) AND (quality <= 5)))
);


--
-- Name: social_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid,
    platform text NOT NULL,
    content text NOT NULL,
    hashtags text[],
    status text DEFAULT 'idea'::text,
    scheduled_for timestamp with time zone,
    posted_at timestamp with time zone,
    post_url text,
    engagement_likes integer DEFAULT 0,
    engagement_comments integer DEFAULT 0,
    engagement_shares integer DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT social_posts_platform_check CHECK ((platform = ANY (ARRAY['linkedin'::text, 'twitter'::text, 'facebook'::text, 'instagram'::text, 'blog'::text, 'youtube'::text, 'tiktok'::text, 'other'::text]))),
    CONSTRAINT social_posts_status_check CHECK ((status = ANY (ARRAY['idea'::text, 'drafted'::text, 'scheduled'::text, 'posted'::text, 'archived'::text])))
);


--
-- Name: substance_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.substance_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    substance_id uuid,
    date date DEFAULT CURRENT_DATE NOT NULL,
    quantity numeric(12,2),
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: substances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.substances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    unit text,
    colour text DEFAULT '#6366f1'::text,
    abstinence_mode boolean DEFAULT false,
    abstinence_since date,
    active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: time_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    description text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    duration_seconds integer,
    tags text[],
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: time_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    colour text DEFAULT '#6366f1'::text,
    goal_id uuid,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid,
    category_id uuid,
    amount numeric(12,2) NOT NULL,
    type text NOT NULL,
    description text,
    merchant text,
    date date DEFAULT CURRENT_DATE NOT NULL,
    recurring boolean DEFAULT false,
    recurring_interval text,
    tags text[],
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    payee_id uuid,
    next_due date,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT transactions_recurring_interval_check CHECK ((recurring_interval = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'yearly'::text]))),
    CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text, 'transfer'::text])))
);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: app_logs app_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_logs
    ADD CONSTRAINT app_logs_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);


--
-- Name: business_client_interactions business_client_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_client_interactions
    ADD CONSTRAINT business_client_interactions_pkey PRIMARY KEY (id);


--
-- Name: business_clients business_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_clients
    ADD CONSTRAINT business_clients_pkey PRIMARY KEY (id);


--
-- Name: business_expenses business_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_expenses
    ADD CONSTRAINT business_expenses_pkey PRIMARY KEY (id);


--
-- Name: business_invoices business_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invoices
    ADD CONSTRAINT business_invoices_pkey PRIMARY KEY (id);


--
-- Name: business_projects business_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_projects
    ADD CONSTRAINT business_projects_pkey PRIMARY KEY (id);


--
-- Name: business_quotes business_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_quotes
    ADD CONSTRAINT business_quotes_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: contacts_tracker contacts_tracker_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts_tracker
    ADD CONSTRAINT contacts_tracker_pkey PRIMARY KEY (id);


--
-- Name: content_ideas content_ideas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_ideas
    ADD CONSTRAINT content_ideas_pkey PRIMARY KEY (id);


--
-- Name: earl_list earl_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earl_list
    ADD CONSTRAINT earl_list_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: financial_goals financial_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_goals
    ADD CONSTRAINT financial_goals_pkey PRIMARY KEY (id);


--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);


--
-- Name: habit_logs habit_logs_habit_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habit_logs
    ADD CONSTRAINT habit_logs_habit_id_date_key UNIQUE (habit_id, date);


--
-- Name: habit_logs habit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habit_logs
    ADD CONSTRAINT habit_logs_pkey PRIMARY KEY (id);


--
-- Name: habits habits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habits
    ADD CONSTRAINT habits_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_date_key UNIQUE (date);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: life_areas life_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.life_areas
    ADD CONSTRAINT life_areas_pkey PRIMARY KEY (id);


--
-- Name: marketing_campaigns marketing_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_pkey PRIMARY KEY (id);


--
-- Name: media_list media_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_list
    ADD CONSTRAINT media_list_pkey PRIMARY KEY (id);


--
-- Name: milestones milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milestones
    ADD CONSTRAINT milestones_pkey PRIMARY KEY (id);


--
-- Name: notebooks notebooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notebooks
    ADD CONSTRAINT notebooks_pkey PRIMARY KEY (id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
-- Name: payees payees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payees
    ADD CONSTRAINT payees_pkey PRIMARY KEY (id);


--
-- Name: post_templates post_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_templates
    ADD CONSTRAINT post_templates_pkey PRIMARY KEY (id);


--
-- Name: sleep_logs sleep_logs_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_logs
    ADD CONSTRAINT sleep_logs_date_key UNIQUE (date);


--
-- Name: sleep_logs sleep_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_logs
    ADD CONSTRAINT sleep_logs_pkey PRIMARY KEY (id);


--
-- Name: social_posts social_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_pkey PRIMARY KEY (id);


--
-- Name: substance_logs substance_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substance_logs
    ADD CONSTRAINT substance_logs_pkey PRIMARY KEY (id);


--
-- Name: substances substances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substances
    ADD CONSTRAINT substances_pkey PRIMARY KEY (id);


--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);


--
-- Name: time_projects time_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_projects
    ADD CONSTRAINT time_projects_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: idx_app_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_logs_created_at ON public.app_logs USING btree (created_at DESC);


--
-- Name: idx_app_logs_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_logs_level ON public.app_logs USING btree (level);


--
-- Name: idx_business_clients_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_clients_type ON public.business_clients USING btree (client_type) WHERE (is_deleted = false);


--
-- Name: idx_business_quotes_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_quotes_client ON public.business_quotes USING btree (client_id);


--
-- Name: idx_business_quotes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_quotes_status ON public.business_quotes USING btree (status);


--
-- Name: idx_content_ideas_used; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_ideas_used ON public.content_ideas USING btree (used) WHERE (used = false);


--
-- Name: idx_habits_goal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_habits_goal_id ON public.habits USING btree (goal_id);


--
-- Name: idx_interactions_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interactions_client ON public.business_client_interactions USING btree (client_id, date DESC);


--
-- Name: idx_sleep_logs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sleep_logs_date ON public.sleep_logs USING btree (date);


--
-- Name: idx_social_posts_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_campaign ON public.social_posts USING btree (campaign_id);


--
-- Name: idx_social_posts_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_scheduled ON public.social_posts USING btree (scheduled_for) WHERE (status = 'scheduled'::text);


--
-- Name: idx_social_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_status ON public.social_posts USING btree (status);


--
-- Name: idx_substance_logs_substance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_substance_logs_substance ON public.substance_logs USING btree (substance_id, date DESC);


--
-- Name: idx_substances_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_substances_active ON public.substances USING btree (active) WHERE (active = true);


--
-- Name: idx_time_projects_goal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_projects_goal_id ON public.time_projects USING btree (goal_id);


--
-- Name: events update_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: goals update_goals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: habits update_habits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_habits_updated_at BEFORE UPDATE ON public.habits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: journal_entries update_journal_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_journal_entries_updated_at BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notes update_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: time_entries update_time_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_time_entries_updated_at BEFORE UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: time_projects update_time_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_time_projects_updated_at BEFORE UPDATE ON public.time_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: transactions update_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: budgets budgets_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: business_client_interactions business_client_interactions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_client_interactions
    ADD CONSTRAINT business_client_interactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.business_clients(id) ON DELETE CASCADE;


--
-- Name: business_expenses business_expenses_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_expenses
    ADD CONSTRAINT business_expenses_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.business_clients(id) ON DELETE SET NULL;


--
-- Name: business_expenses business_expenses_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_expenses
    ADD CONSTRAINT business_expenses_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.business_projects(id) ON DELETE SET NULL;


--
-- Name: business_invoices business_invoices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invoices
    ADD CONSTRAINT business_invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.business_clients(id) ON DELETE SET NULL;


--
-- Name: business_invoices business_invoices_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invoices
    ADD CONSTRAINT business_invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.business_projects(id) ON DELETE SET NULL;


--
-- Name: business_projects business_projects_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_projects
    ADD CONSTRAINT business_projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.business_clients(id) ON DELETE SET NULL;


--
-- Name: business_quotes business_quotes_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_quotes
    ADD CONSTRAINT business_quotes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.business_clients(id) ON DELETE SET NULL;


--
-- Name: business_quotes business_quotes_converted_to_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_quotes
    ADD CONSTRAINT business_quotes_converted_to_invoice_id_fkey FOREIGN KEY (converted_to_invoice_id) REFERENCES public.business_invoices(id) ON DELETE SET NULL;


--
-- Name: business_quotes business_quotes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_quotes
    ADD CONSTRAINT business_quotes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.business_projects(id) ON DELETE SET NULL;


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: events events_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: financial_goals financial_goals_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_goals
    ADD CONSTRAINT financial_goals_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: goals goals_life_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_life_area_id_fkey FOREIGN KEY (life_area_id) REFERENCES public.life_areas(id) ON DELETE SET NULL;


--
-- Name: goals goals_parent_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_parent_goal_id_fkey FOREIGN KEY (parent_goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: habit_logs habit_logs_habit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habit_logs
    ADD CONSTRAINT habit_logs_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES public.habits(id) ON DELETE CASCADE;


--
-- Name: habits habits_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habits
    ADD CONSTRAINT habits_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: milestones milestones_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milestones
    ADD CONSTRAINT milestones_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;


--
-- Name: notes notes_notebook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_notebook_id_fkey FOREIGN KEY (notebook_id) REFERENCES public.notebooks(id) ON DELETE SET NULL;


--
-- Name: social_posts social_posts_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;


--
-- Name: substance_logs substance_logs_substance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substance_logs
    ADD CONSTRAINT substance_logs_substance_id_fkey FOREIGN KEY (substance_id) REFERENCES public.substances(id) ON DELETE CASCADE;


--
-- Name: time_entries time_entries_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.time_projects(id) ON DELETE CASCADE;


--
-- Name: time_projects time_projects_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_projects
    ADD CONSTRAINT time_projects_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_payee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_payee_id_fkey FOREIGN KEY (payee_id) REFERENCES public.payees(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict WxHU9rc09typGDh44jPLGo7hveIpdPB1oHdmufzQCFD1qYcY1zN1iYji9AahSks


-- Down Migration
-- Intentionally empty — there is no 'down' from the baseline.
