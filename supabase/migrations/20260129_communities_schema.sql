-- =====================================================
-- COMMUNITIES FEATURE SCHEMA
-- =====================================================

-- 1. COMMUNITIES TABLE
CREATE TABLE IF NOT EXISTS communities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT, -- Emoji or icon name
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CONTACTS TABLE
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    status TEXT DEFAULT 'active', -- 'active', 'inactive', 'archived'
    tags TEXT[], -- Array of simple tags if needed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. COMMUNITY MEMBERS (Join/Pivot Table)
CREATE TABLE IF NOT EXISTS community_members (
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (community_id, contact_id)
);

-- Enable RLS
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

-- Public access policies (adjust for production)
CREATE POLICY "Public access communities" ON communities FOR ALL USING (true);
CREATE POLICY "Public access contacts" ON contacts FOR ALL USING (true);
CREATE POLICY "Public access members" ON community_members FOR ALL USING (true);

-- SEED DATA: Communities
INSERT INTO communities (name, slug, icon, description) VALUES
('VIPs', 'vips', '⭐', 'High value contacts'),
('Crossfitters', 'crossfitters', '🏋️‍♂️', 'Fitness enthusiasts'),
('Inactivos', 'inactivos', '⚠️', 'Needs re-engagement'),
('Todos los Contactos', 'all', '👥', 'System group for all contacts')
ON CONFLICT (slug) DO UPDATE SET 
    name = EXCLUDED.name,
    icon = EXCLUDED.icon;

-- SEED DATA: Example Contacts (Optional, for demo)
INSERT INTO contacts (full_name, email, status) VALUES
('Juan Pérez', 'juan@example.com', 'active'),
('Maria Lopez', 'maria@example.com', 'active'),
('Carlos Gym', 'carlos@gym.com', 'active')
ON CONFLICT DO NOTHING;

-- Link logic would be done here if UUIDs were known, but usually done via app or fetched first.
-- For this script we rely on the app to link them or doing it manually if needed.
