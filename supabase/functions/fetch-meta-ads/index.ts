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
        const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN") || "";
        const META_ACCOUNT_ID = Deno.env.get("META_ACCOUNT_ID") || "";

        if (!META_ACCESS_TOKEN || !META_ACCOUNT_ID) {
            throw new Error("Missing META_ACCESS_TOKEN or META_ACCOUNT_ID environment variables");
        }

        log("🚀 Function started: fetch-meta-ads (ENV CONFIG)");
        log(`Context: Account ${META_ACCOUNT_ID}`);

        const reqData = await req.json().catch(() => ({}));
        let timeFilter = "&date_preset=maximum";

        if (reqData.startDate && reqData.endDate) {
            timeFilter = `&time_range={'since':'${reqData.startDate}','until':'${reqData.endDate}'}`;
        }

        log(`📅 Time Filter: ${timeFilter}`);

        const apiVersion = "v19.0";
        const fields = "id,name,status,start_time,stop_time,insights{impressions,clicks,spend,ctr,cpc,cpm,reach,frequency,actions,action_values}";
        const url = `https://graph.facebook.com/${apiVersion}/${META_ACCOUNT_ID}/campaigns?fields=${fields}&access_token=${META_ACCESS_TOKEN}&limit=100&sort=updated_time_descending${timeFilter}`;

        log(`Querying Meta Graph API...`);

        const response = await fetch(url);

        if (!response.ok) {
            const errorTxt = await response.text();
            throw new Error(`Meta API Error ${response.status}: ${errorTxt}`);
        }

        const data = await response.json();
        const campaigns = data.data || [];
        log(`Found ${campaigns.length} campaigns.`);

        const campaignsToUpsert = campaigns.map((camp: any) => {
            const insightData = camp.insights && camp.insights.data ? camp.insights.data : [];
            const insight = insightData.length > 0 ? insightData[0] : {};

            let status = 'paused';
            const s = camp.status.toUpperCase();
            if (s === 'ACTIVE') status = 'active';
            if (s === 'PAUSED') status = 'paused';
            if (s === 'ARCHIVED' || s === 'DELETED') status = 'completed';

            const spend = insight.spend ? parseFloat(insight.spend) : 0;
            const impressions = insight.impressions ? parseInt(insight.impressions) : 0;
            const clicks = insight.clicks ? parseInt(insight.clicks) : 0;
            const ctr = insight.ctr ? parseFloat(insight.ctr) * 100 : 0;
            const cpc = insight.cpc ? parseFloat(insight.cpc) : 0;
            const cpm = insight.cpm ? parseFloat(insight.cpm) : 0;
            const reach = insight.reach ? parseInt(insight.reach) : 0;
            const frequency = insight.frequency ? parseFloat(insight.frequency) : 0;

            let conversions = 0;
            if (insight.actions) {
                const convTypes = ['purchase', 'lead', 'contact', 'schedule', 'submit_application', 'mobile_app_install'];
                conversions = insight.actions
                    .filter((a: any) => convTypes.includes(a.action_type))
                    .reduce((sum: number, a: any) => sum + (parseInt(a.value) || 0), 0);
            }

            let conversionValue = 0;
            if (insight.action_values) {
                conversionValue = insight.action_values
                    .filter((a: any) => ['purchase_roas', 'purchase'].includes(a.action_type))
                    .reduce((sum: number, a: any) => sum + (parseFloat(a.value) || 0), 0);
            }

            return {
                external_id: camp.id,
                name: camp.name,
                platform: 'Meta Ads',
                status: status,
                impressions: impressions,
                clicks: clicks,
                spend: spend,
                start_date: camp.start_time ? camp.start_time.split('T')[0] : null,
                end_date: camp.stop_time ? camp.stop_time.split('T')[0] : null,
                raw_data: {
                    meta_status: camp.status,
                    insights: { ...insight, cpc, cpm, reach, frequency, conversions, conversionValue }
                },
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

            if (error) {
                errLog(`Supabase Upsert Error: ${JSON.stringify(error)}`);
                throw error;
            }
            log(`✅ Upserted ${campaignsToUpsert.length} campaigns to DB.`);
        }

        return new Response(JSON.stringify({
            success: true,
            processed: campaignsToUpsert.length,
            data: campaignsToUpsert,
            logs
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });

    } catch (error: any) {
        errLog(`Global Fail: ${error.message}`);
        return new Response(JSON.stringify({
            error: error.message,
            stack: error.stack,
            logs
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
