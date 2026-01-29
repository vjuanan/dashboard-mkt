/**
 * Supabase Client Configuration
 * EPN Marketing Ops Center
 * 
 * INSTRUCTIONS:
 * 1. Go to your Supabase project dashboard
 * 2. Navigate to Project Settings → API
 * 3. Copy your Project URL and anon/public key
 * 4. Replace the values below
 */

// ===== CONFIGURATION - UPDATE THESE VALUES =====
const SUPABASE_URL = 'https://auqnzxrysuzypquebtpy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cW56eHJ5c3V6eXBxdWVidHB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwOTg5NTAsImV4cCI6MjA4NDY3NDk1MH0.7xdzjqUjjHZXG-YdXfKmAlFNecze4hSUBS3t55jpLbE';

// ===== Supabase Client Singleton =====
let supabaseInstance = null;

function getSupabaseClient() {
    if (supabaseInstance) {
        return supabaseInstance;
    }

    if (!window.supabase) {
        console.error('Supabase library not loaded. Make sure to include the Supabase CDN script.');
        return null;
    }

    if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
        console.warn('⚠️ Supabase credentials not configured. Please update lib/supabase.js with your credentials.');
        return null;
    }

    supabaseInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseInstance;
}

// ===== Database API =====
const db = {
    // ===== CAMPAIGNS =====
    campaigns: {
        async getAll(filter = {}) {
            const client = getSupabaseClient();
            if (!client) return { data: [], error: 'Not connected' };

            let query = client.from('campaigns').select('*');

            if (filter.status) {
                query = query.eq('status', filter.status);
            }
            if (filter.platform) {
                query = query.eq('platform', filter.platform);
            }

            const { data, error } = await query.order('updated_at', { ascending: false });
            return { data: data || [], error };
        },

        async getById(id) {
            const client = getSupabaseClient();
            if (!client) return { data: null, error: 'Not connected' };

            const { data, error } = await client
                .from('campaigns')
                .select('*')
                .eq('id', id)
                .single();
            return { data, error };
        },

        async create(campaignData) {
            const client = getSupabaseClient();
            if (!client) return { data: null, error: 'Not connected' };

            const { data, error } = await client
                .from('campaigns')
                .insert([campaignData])
                .select()
                .single();
            return { data, error };
        },

        async update(id, updates) {
            const client = getSupabaseClient();
            if (!client) return { data: null, error: 'Not connected' };

            const { data, error } = await client
                .from('campaigns')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            return { data, error };
        },

        async delete(id) {
            const client = getSupabaseClient();
            if (!client) return { error: 'Not connected' };

            const { error } = await client
                .from('campaigns')
                .delete()
                .eq('id', id);
            return { error };
        },

        async getStats() {
            const client = getSupabaseClient();
            if (!client) return { data: null, error: 'Not connected' };

            const { data, error } = await client
                .from('campaigns')
                .select('status, spend, impressions, clicks');

            if (error) return { data: null, error };

            const stats = {
                totalActive: data.filter(c => c.status === 'active').length,
                totalSpend: data.reduce((sum, c) => sum + (parseFloat(c.spend) || 0), 0),
                totalImpressions: data.reduce((sum, c) => sum + (c.impressions || 0), 0),
                totalClicks: data.reduce((sum, c) => sum + (c.clicks || 0), 0),
                avgCTR: 0
            };

            if (stats.totalImpressions > 0) {
                stats.avgCTR = ((stats.totalClicks / stats.totalImpressions) * 100).toFixed(2);
            }

            return { data: stats, error: null };
        }
    },

    // ===== CONTENT CALENDAR =====
    content: {
        async getAll(filter = {}) {
            const client = getSupabaseClient();
            if (!client) return { data: [], error: 'Not connected' };

            let query = client.from('content_calendar').select('*');

            if (filter.status) {
                query = query.eq('status', filter.status);
            }
            if (filter.channel) {
                query = query.eq('channel', filter.channel);
            }
            if (filter.startDate && filter.endDate) {
                query = query.gte('scheduled_date', filter.startDate).lte('scheduled_date', filter.endDate);
            }

            const { data, error } = await query.order('scheduled_date', { ascending: true });
            return { data: data || [], error };
        },

        async getByMonth(year, month) {
            const startDate = new Date(year, month, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

            return this.getAll({ startDate, endDate });
        },

        async create(contentData) {
            const client = getSupabaseClient();
            if (!client) return { data: null, error: 'Not connected' };

            const { data, error } = await client
                .from('content_calendar')
                .insert([contentData])
                .select()
                .single();
            return { data, error };
        },

        async update(id, updates) {
            const client = getSupabaseClient();
            if (!client) return { data: null, error: 'Not connected' };

            const { data, error } = await client
                .from('content_calendar')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            return { data, error };
        },

        async delete(id) {
            const client = getSupabaseClient();
            if (!client) return { error: 'Not connected' };

            const { error } = await client
                .from('content_calendar')
                .delete()
                .eq('id', id);
            return { error };
        },

        async updateDate(id, newDate) {
            return this.update(id, { scheduled_date: newDate });
        },

        async updateStage(id, newStage) {
            return this.update(id, { production_stage: newStage });
        },

        async getByStage() {
            const client = getSupabaseClient();
            if (!client) return { data: {}, error: 'Not connected' };

            const { data, error } = await client
                .from('content_calendar')
                .select('*')
                .order('updated_at', { ascending: false });

            if (error) return { data: {}, error };

            // Group by production_stage
            const grouped = {
                idea: [],
                scripting: [],
                production: [],
                editing: [],
                review: [],
                scheduled: []
            };

            (data || []).forEach(item => {
                const stage = item.production_stage || 'idea';
                if (grouped[stage]) {
                    grouped[stage].push(item);
                } else {
                    grouped.idea.push(item);
                }
            });

            return { data: grouped, error: null };
        }
    },

    // ===== INPUTS REQUESTS =====
    inputs: {
        async getAll(filter = {}) {
            const client = getSupabaseClient();
            if (!client) return { data: [], error: 'Not connected' };

            let query = client.from('inputs_requests').select('*');

            if (filter.status) {
                query = query.eq('status', filter.status);
            }
            if (filter.type) {
                query = query.eq('type', filter.type);
            }

            const { data, error } = await query.order('created_at', { ascending: false });
            return { data: data || [], error };
        },

        async create(inputData) {
            const client = getSupabaseClient();
            if (!client) return { data: null, error: 'Not connected' };

            const { data, error } = await client
                .from('inputs_requests')
                .insert([inputData])
                .select()
                .single();
            return { data, error };
        },

        async update(id, updates) {
            const client = getSupabaseClient();
            if (!client) return { data: null, error: 'Not connected' };

            const { data, error } = await client
                .from('inputs_requests')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            return { data, error };
        },

        async delete(id) {
            const client = getSupabaseClient();
            if (!client) return { error: 'Not connected' };

            const { error } = await client
                .from('inputs_requests')
                .delete()
                .eq('id', id);
            return { error };
        },

        async toggleStatus(id, currentStatus) {
            const newStatus = currentStatus === 'done' ? 'pending' : 'done';
            return this.update(id, { status: newStatus });
        }
    },

    // ===== TEAM DOCS (Wiki) =====
    teamDocs: {
        async getAll(filter = {}) {
            const client = getSupabaseClient();
            if (!client) return { data: [], error: 'Not connected' };

            let query = client.from('team_docs').select('*');

            if (filter.category) {
                query = query.eq('category', filter.category);
            }

            const { data, error } = await query.order('created_at', { ascending: true });
            return { data: data || [], error };
        },

        async create(docData) {
            const client = getSupabaseClient();
            if (!client) return { data: null, error: 'Not connected' };

            const { data, error } = await client
                .from('team_docs')
                .insert([docData])
                .select()
                .single();
            return { data, error };
        },

        async update(id, updates) {
            const client = getSupabaseClient();
            if (!client) return { data: null, error: 'Not connected' };

            const { data, error } = await client
                .from('team_docs')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            return { data, error };
        },

        async delete(id) {
            const client = getSupabaseClient();
            if (!client) return { error: 'Not connected' };

            const { error } = await client
                .from('team_docs')
                .delete()
                .eq('id', id);
            return { error };
        }
    },

    // ===== PROFILES (Team) =====
    profiles: {
        async getAll() {
            const client = getSupabaseClient();
            if (!client) return { data: [], error: 'Not connected' };

            const { data, error } = await client
                .from('profiles')
                .select('*')
                .order('full_name', { ascending: true });
            return { data: data || [], error };
        }
    },

    // ===== COMMUNITIES =====
    communities: {
        async getAll() {
            const client = getSupabaseClient();
            if (!client) return { data: [], error: 'Not connected' };

            const { data, error } = await client
                .from('communities')
                .select('*')
                .order('name');
            return { data: data || [], error };
        }
    },

    // ===== CONTACTS =====
    contacts: {
        async getAll() {
            const client = getSupabaseClient();
            if (!client) return { data: [], error: 'Not connected' };

            const { data, error } = await client
                .from('contacts')
                .select('*')
                .order('full_name');
            return { data: data || [], error };
        },

        async getByCommunity(communityId) {
            const client = getSupabaseClient();
            if (!client) return { data: [], error: 'Not connected' };

            // If 'all' or special ID, or if we want to filter by join
            // Assuming community_members join table
            const { data, error } = await client
                .from('contacts')
                .select(`
                    *,
                    community_members!inner(community_id)
                `)
                .eq('community_members.community_id', communityId);

            return { data: data || [], error };
        },

        async create(contactData) {
            const client = getSupabaseClient();
            if (!client) return { data: null, error: 'Not connected' };

            const { data, error } = await client
                .from('contacts')
                .insert([contactData])
                .select()
                .single();
            return { data, error };
        }
    },

    // ===== BUDGETS =====
    budgets: {
        async get(month) {
            const client = getSupabaseClient();
            if (!client) return { data: null, error: 'Not connected' };

            const { data, error } = await client
                .from('monthly_budgets')
                .select('*')
                .eq('month', month)
                .single();
            return { data, error };
        },

        async upsert(budgetData) {
            const client = getSupabaseClient();
            if (!client) return { data: null, error: 'Not connected' };

            // Upsert based on month check
            // First try update if exists (since month is unique key)
            const { data, error } = await client
                .from('monthly_budgets')
                .upsert(budgetData, { onConflict: 'month' })
                .select()
                .single();
            return { data, error };
        }
    },

    // ===== UNIFIED ACTIVITY =====
    async getRecentActivity(limit = 5) {
        const client = getSupabaseClient();
        if (!client) return { data: [], error: 'Not connected' };

        // Get recent campaigns
        const { data: campaigns } = await client
            .from('campaigns')
            .select('id, name, platform, status, updated_at')
            .order('updated_at', { ascending: false })
            .limit(limit);

        // Get recent content
        const { data: content } = await client
            .from('content_calendar')
            .select('id, title, channel, status, updated_at')
            .order('updated_at', { ascending: false })
            .limit(limit);

        // Combine and sort
        const combined = [
            ...(campaigns || []).map(c => ({ ...c, type: 'Ads', name: c.name })),
            ...(content || []).map(c => ({ ...c, type: 'Content', name: c.title }))
        ].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
            .slice(0, limit);

        return { data: combined, error: null };
    },

    // ===== REAL-TIME SUBSCRIPTIONS =====
    subscriptions: [],

    subscribeToChanges(table, callback) {
        const client = getSupabaseClient();
        if (!client) return null;

        const subscription = client
            .channel(`${table}_changes`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table },
                (payload) => callback(payload)
            )
            .subscribe();

        this.subscriptions.push(subscription);
        return subscription;
    },

    unsubscribeAll() {
        const client = getSupabaseClient();
        if (!client) return;

        this.subscriptions.forEach(sub => {
            client.removeChannel(sub);
        });
        this.subscriptions = [];
    },

    // ===== INTEGRATIONS =====
    async syncGoogleAds(dateRange = {}) {
        const client = getSupabaseClient();
        if (!client) return { error: 'Client not initialized' };

        try {
            console.log("Triggering Google Ads Sync with dates:", dateRange);
            const { data, error } = await client.functions.invoke('fetch-google-ads', {
                body: {
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate
                }
            });
            if (error) throw error;
            return { data, error: null };
        } catch (e) {
            console.error("Sync Error:", e);
            return { data: null, error: e.message };
        }
    },

    async syncMetaAds() {
        const client = getSupabaseClient();
        if (!client) return { error: 'Client not initialized' };

        try {
            console.log("Triggering Meta Ads Sync...");
            const { data, error } = await client.functions.invoke('fetch-meta-ads');
            if (error) throw error;
            return { data, error: null };
        } catch (e) {
            console.error("Meta Sync Error:", e);
            return { data: null, error: e.message };
        }
    },

    // ===== CONNECTION TEST =====
    async testConnection() {
        const client = getSupabaseClient();
        if (!client) return { connected: false, error: 'Client not initialized' };

        try {
            const { error } = await client.from('campaigns').select('id').limit(1);
            return { connected: !error, error };
        } catch (e) {
            return { connected: false, error: e.message };
        }
    }
};

// Export for use in app.js
window.db = db;
window.getSupabaseClient = getSupabaseClient;
