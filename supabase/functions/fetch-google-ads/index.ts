import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const logs: string[] = [];
    const log = (msg: string) => { console.log(msg); logs.push(msg); };
    const errLog = (msg: string) => { console.error(msg); logs.push(`ERROR: ${msg}`); };

    try {
        // ═══ ENV-BASED CONFIG ═══
        const DEVELOPER_TOKEN = Deno.env.get("GOOGLE_DEVELOPER_TOKEN") || "";
        const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
        const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
        const REFRESH_TOKEN = Deno.env.get("GOOGLE_REFRESH_TOKEN") || "";
        const CUSTOMER_ID = Deno.env.get("GOOGLE_CUSTOMER_ID") || "";

        if (!DEVELOPER_TOKEN || !CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !CUSTOMER_ID) {
            throw new Error("Missing Google Ads environment variables");
        }

        log("🚀 Function started: fetch-google-ads (ENV CONFIG)");

        log("Refreshing Google Ads access token...");
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                refresh_token: REFRESH_TOKEN,
                grant_type: "refresh_token",
            }),
        });

        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            throw new Error(`Failed to refresh token: ${JSON.stringify(tokenData)}`);
        }
        const accessToken = tokenData.access_token;
        log("Token refreshed successfully.");

        const mccUrl = `https://googleads.googleapis.com/v19/customers/${CUSTOMER_ID}/googleAds:search`;
        const webQuery = `SELECT customer_client.id, customer_client.descriptive_name FROM customer_client WHERE customer_client.manager = false LIMIT 1`;

        log(`Resolving Child Account from Manager ${CUSTOMER_ID}...`);
        const clientResp = await fetch(mccUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "developer-token": DEVELOPER_TOKEN,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ query: webQuery }),
        });

        let targetCustomerId = CUSTOMER_ID;

        if (clientResp.ok) {
            const clientData = await clientResp.json();
            const childNode = clientData.results?.[0]?.customerClient;
            if (childNode) {
                targetCustomerId = String(childNode.id);
                log(`✅ Found active child account: ${childNode.descriptiveName} (${targetCustomerId}).`);
            } else {
                log("⚠️ No child accounts found. Returning empty list.");
                return new Response(JSON.stringify({ success: true, processed: 0, data: [], logs }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
                });
            }
        } else {
            log(`MCC Lookup note: Continuing with raw ID.`);
        }

        const finalUrl = `https://googleads.googleapis.com/v19/customers/${targetCustomerId}/googleAds:search`;
        const queryHeaders: any = {
            "Authorization": `Bearer ${accessToken}`,
            "developer-token": DEVELOPER_TOKEN,
            "Content-Type": "application/json",
        };
        if (targetCustomerId !== CUSTOMER_ID) {
            queryHeaders["login-customer-id"] = CUSTOMER_ID;
        }

        const reqData = await req.json().catch(() => ({}));
        const startDate = reqData.startDate || '2020-01-01';
        const endDate = reqData.endDate || new Date().toISOString().split('T')[0];

        log(`📅 Date Filter Applied: ${startDate} to ${endDate}`);

        const query = `
          SELECT campaign.id, campaign.name, campaign.status, campaign.start_date, campaign.end_date,
                 metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros,
                 metrics.conversions, metrics.conversions_value, metrics.average_cpc,
                 metrics.cost_per_conversion, metrics.search_impression_share
          FROM campaign WHERE campaign.status != 'REMOVED' AND segments.date BETWEEN '${startDate}' AND '${endDate}'
          ORDER BY campaign.start_date DESC LIMIT 100
        `;

        const searchResponse = await fetch(finalUrl, {
            method: "POST",
            headers: queryHeaders,
            body: JSON.stringify({ query }),
        });

        if (!searchResponse.ok) {
            const errorText = await searchResponse.text();
            throw new Error(`Google Ads API Error ${searchResponse.status}: ${errorText.substring(0, 300)}`);
        }

        const searchData = await searchResponse.json();
        const rows = searchData.results || [];
        log(`Found ${rows.length} campaigns.`);

        const campaignsToUpsert = rows.map((row: any) => {
            const camp = row.campaign;
            const metrics = row.metrics;
            let status = 'paused';
            if (camp.status === 'ENABLED') status = 'active';
            if (camp.status === 'PAUSED') status = 'paused';
            if (camp.status === 'REMOVED') status = 'completed';
            const costMicros = metrics.costMicros || metrics.cost_micros;
            const spend = costMicros ? (parseInt(costMicros) / 1000000) : 0;
            return {
                external_id: String(camp.id),
                name: camp.name,
                platform: 'Google Ads',
                status: status,
                impressions: metrics.impressions ?? 0,
                clicks: metrics.clicks ?? 0,
                spend: spend,
                start_date: camp.start_date || null,
                end_date: camp.end_date || null,
                raw_data: { cost_micros: costMicros, google_status: camp.status, metrics },
                updated_at: new Date().toISOString()
            };
        });

        const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").trim();
        const supabaseServiceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();

        if (campaignsToUpsert.length > 0 && supabaseUrl && supabaseServiceKey) {
            log("Connecting to Supabase...");
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            const { error } = await supabase.from('campaigns').upsert(campaignsToUpsert, {
                onConflict: 'platform, external_id',
                ignoreDuplicates: false
            });
            if (error) throw error;
        }

        return new Response(JSON.stringify({ success: true, processed: campaignsToUpsert.length, data: campaignsToUpsert, logs }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
        });

    } catch (error: any) {
        errLog(`Global Fail: ${error.message}`);
        return new Response(JSON.stringify({ error: error.message, stack: error.stack, logs }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        });
    }
});
