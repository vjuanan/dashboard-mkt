#!/bin/bash
PROJECT_REF="auqnzxrysuzypquebtpy"
SERVICE_KEY=$(grep "SUPABASE_SERVICE_ROLE_KEY" .env | cut -d '=' -f2 | tr -d '\n' | tr -d '\r')

echo "🧹 Limpiando datos falsos..."
curl -X DELETE "https://$PROJECT_REF.supabase.co/rest/v1/campaigns?external_id=like.dummy_*" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY"

echo ""
echo "🔄 Sincronizando datos REALES de Google Ads..."
curl -X POST "https://$PROJECT_REF.supabase.co/functions/v1/fetch-google-ads" \
  -H "Authorization: Bearer $SERVICE_KEY"

echo ""
echo "✅ Base de datos limpia y actualizada."
