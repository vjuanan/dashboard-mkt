const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 1. Load env vars manually
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ Missing credentials in .env');
    process.exit(1);
}

// 2. Initialize Supabase
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function run() {
    console.log('🧹 Cleaning dummy data...');
    const { error: deleteError } = await supabase
        .from('campaigns')
        .delete()
        .like('external_id', 'dummy_%');

    if (deleteError) {
        console.error('❌ Error deleting:', deleteError);
    } else {
        console.log('✅ Dummy data removed.');
    }

    console.log('🔄 Triggering fresh sync...');
    const { data, error: invokeError } = await supabase.functions.invoke('fetch-google-ads', {
        headers: { 'Authorization': `Bearer ${SERVICE_KEY}` } // Force usage of service key if needed
    });

    if (invokeError) {
        console.error('❌ Sync Error:', invokeError);
        // Try to read response valid JSON?
    } else {
        console.log('✅ Sync started:', data);
    }
}

run();
