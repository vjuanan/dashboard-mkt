
const SURL = 'https://auqnzxrysuzypquebtpy.supabase.co';
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cW56eHJ5c3V6eXBxdWVidHB5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA5ODk1MCwiZXhwIjoyMDg0Njc0OTUwfQ.oKURhuZZaBP7XK8rH651A0CPomVDnqq0A5duxnWQPrI';

async function checkGoogleAds() {
    const url = `${SURL}/rest/v1/campaigns?platform=eq.Google%20Ads&select=*&limit=10&order=impressions.desc`;
    const response = await fetch(url, {
        headers: {
            'apikey': SKEY,
            'Authorization': `Bearer ${SKEY}`
        }
    });

    if (!response.ok) {
        console.error('Error:', await response.text());
        return;
    }

    const data = await response.json();
    console.log(`Fetched ${data.length} Google Ads rows.`);
    data.forEach(c => {
        console.log(`Campaign: ${c.name}`);
        console.log(`  Spend Column: ${c.spend}`);
        if (c.raw_data && c.raw_data.metrics) {
            console.log(`  Raw Cost Micros: ${c.raw_data.metrics.cost_micros}`);
        }
        console.log('---');
    });
}

checkGoogleAds();
