-- =====================================================
-- EPN MARKETING OPS CENTER - FULL SCHEMA (CLEAN INSTALL)
-- =====================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLAS

-- A. CAMPAIGNS (Ads Manager - Multi-platform)
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id TEXT, -- ID original en Google/Meta (string para compatibilidad)
    platform TEXT NOT NULL, -- 'Google Ads', 'Meta Ads', 'LinkedIn', etc.
    name TEXT NOT NULL,
    status TEXT DEFAULT 'draft', -- 'active', 'paused', 'completed', 'draft'
    
    -- Métricas financieras
    budget DECIMAL(12,2) DEFAULT 0,
    daily_budget DECIMAL(12,2) DEFAULT 0,
    spend DECIMAL(12,2) DEFAULT 0,
    
    -- Métricas de rendimiento
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    
    -- Fechas
    start_date DATE,
    end_date DATE,
    
    -- Datos técnicos/crudos
    raw_data JSONB DEFAULT '{}', -- Store full API response here
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices únicos para evitar duplicados al sincronizar
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_platform_id ON campaigns(platform, external_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- B. CONTENT CALENDAR (Content Engine & Kanban)
CREATE TABLE IF NOT EXISTS content_calendar (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    channel TEXT NOT NULL, -- 'Instagram', 'TikTok', 'YouTube', etc.
    format TEXT NOT NULL, -- 'Reel', 'Post', 'Story', etc.
    
    -- Workflow
    production_stage TEXT DEFAULT 'idea', -- 'idea', 'scripting', 'production', 'editing', 'review', 'scheduled'
    status TEXT DEFAULT 'idea', -- Legacy status field (sync with production_stage if needed)
    assigned_to TEXT, -- 'Meli', 'Agus', etc.
    strategy_angle TEXT, -- 'Educativo', 'Venta', 'Lifestyle'
    
    -- Content details
    scheduled_date DATE,
    assets_link TEXT,
    copy_text TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_stage ON content_calendar(production_stage);
CREATE INDEX IF NOT EXISTS idx_content_date ON content_calendar(scheduled_date);

-- C. INPUTS & REQUESTS
CREATE TABLE IF NOT EXISTS inputs_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL, -- 'Brief', 'Request', 'Report'
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'medium', -- 'high', 'medium', 'low'
    status TEXT DEFAULT 'pending', -- 'pending', 'done'
    requester_name TEXT,
    assigned_to UUID, -- Reference to profiles.id
    due_date DATE,
    form_data JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- D. TEAM DOCS (Wiki)
CREATE TABLE IF NOT EXISTS team_docs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    category TEXT CHECK (category IN ('Roles', 'Metodología', 'Accesos', 'Otro')),
    content TEXT,
    last_updated_by TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SEGURIDAD (Row Level Security)
-- Permitimos acceso público para esta demo (ajustar en prod)
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE inputs_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access campaigns" ON campaigns FOR ALL USING (true);
CREATE POLICY "Public access content" ON content_calendar FOR ALL USING (true);
CREATE POLICY "Public access inputs" ON inputs_requests FOR ALL USING (true);
CREATE POLICY "Public access docs" ON team_docs FOR ALL USING (true);

-- E. PROFILES (Team)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'Member',
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial users (Example for new installs)
INSERT INTO profiles (full_name, role) VALUES 
('Juanan', 'Admin'),
('Meli', 'Content'),
('Agus', 'Design'),
('Santi', 'Media Buying')
ON CONFLICT DO NOTHING;

-- ALTER inputs_requests to support assignment if not exists
-- (This line is for doc purposes, in prod run: ALTER TABLE inputs_requests ADD COLUMN assigned_to UUID;)
-- We add it to the CREATE definition below if it was a fresh install, 
-- but here we assume the table might exist. 
-- Best practice in this file is to define the final state.

-- 5. SEGURIDAD (Row Level Security)
-- 4. DATOS DE EJEMPLO (ELIMINADO - PROD ONLY)
-- INSERT INTO campaigns ... (Removed for clean install)

