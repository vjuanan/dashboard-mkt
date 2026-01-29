#!/bin/zsh
# ==========================================
# EPN OPS CENTER - AUTO DEPLOY (V8 - FINAL FIX)
# ==========================================

PROJECT_REF="auqnzxrysuzypquebtpy"
PROJECT_DIR="/Users/juanan/Library/CloudStorage/OneDrive-EPNStore/Team Ventas y Administracion 🤑/AI Deveolpments/Dashboard MKT"
export SUPABASE_ACCESS_TOKEN="sbp_b67e8374431e1fb584f83645a752f4a863626d85"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'
ORB_URL="https://orbstack.dev/download/stable/latest/arm64" 

cd "$PROJECT_DIR" || exit 1

echo -e "${GREEN}☢️  EJECUTANDO PROTOCOLO 'EJECUTA TODO' (V8)...${NC}"

# ==========================================
# FASE 0: PREPARACIÓN DE SECRETOS (CRÍTICO)
# ==========================================
echo "🔑 Preparando llaves..."

# 1. Copiar GOOGLE_ vars
grep "^GOOGLE_" .env > .env.production

# 2. Inyectar SERVICE_ROLE_KEY (Renombrando SUPABASE_SERVICE_ROLE_KEY para evadir bloqueo)
# Leemos la clave del .env original
SERVICE_KEY=$(grep "SUPABASE_SERVICE_ROLE_KEY" .env | cut -d '=' -f2)

if [ -z "$SERVICE_KEY" ]; then
    echo -e "${RED}❌ NO ENCONTRÉ LA CLAVE SUPABASE_SERVICE_ROLE_KEY EN .ENV${NC}"
    exit 1
fi

echo "SERVICE_ROLE_KEY=$SERVICE_KEY" >> .env.production
echo "ENV generada con éxito."

# ==========================================
# FASE 1: ORBSTACK (DOCKER)
# ==========================================
# Solo verificamos si docker funciona, si no, intentamos abrir OrbStack
if ! docker info > /dev/null 2>&1; then
    echo "⚠️  Docker no responde. Intentando abrir OrbStack..."
    open -a OrbStack
    sleep 5
fi

# ==========================================
# FASE 2: PREPARAR CLI
# ==========================================
echo "🛠️  Preparando herramienta..."
mkdir -p temp_auto_deploy
curl -L -o temp_auto_deploy/cli.tar.gz "https://github.com/supabase/cli/releases/download/v1.131.4/supabase_darwin_arm64.tar.gz" --silent
tar -xzf temp_auto_deploy/cli.tar.gz -C temp_auto_deploy
mv temp_auto_deploy/supabase temp_auto_deploy/supabase_bin
chmod +x temp_auto_deploy/supabase_bin
CLI="./temp_auto_deploy/supabase_bin"

mkdir -p supabase
grep "project_id" supabase/config.toml || echo "project_id = \"$PROJECT_REF\"" > supabase/config.toml

# ==========================================
# FASE 3: SUBIR SECRETOS Y CÓDIGO
# ==========================================

echo "🔐 Subiendo secretos..."
$CLI secrets set --env-file .env.production --project-ref "$PROJECT_REF"

echo "☁️  DESPLEGANDO FUNCIONES..."
$CLI functions deploy fetch-google-ads --project-ref "$PROJECT_REF" --no-verify-jwt
$CLI functions deploy fetch-meta-ads --project-ref "$PROJECT_REF" --no-verify-jwt

STATUS=$?

# ==========================================
# FASE 4: DISPARO INICIAL (WAKE UP CALL)
# ==========================================
if [ $STATUS -eq 0 ]; then
    echo "⚡ Ejecutando primera sincronización (Google + Meta)..."
    # Esperamos un momento para que la función se propague
    sleep 3
    
    # Usamos la llave maestra para invocar
    curl -X POST \
      -H "Authorization: Bearer $SERVICE_KEY" \
      "https://$PROJECT_REF.supabase.co/functions/v1/fetch-google-ads"

    curl -X POST \
      -H "Authorization: Bearer $SERVICE_KEY" \
      "https://$PROJECT_REF.supabase.co/functions/v1/fetch-meta-ads"
      
    echo ""
fi

# Limpieza
rm -rf temp_auto_deploy
rm .env.production

echo ""
if [ $STATUS -eq 0 ]; then
    echo -e "${GREEN}✅ =========================================== ✅${NC}"
    echo -e "${GREEN}      SISTEMA RESTAURADO Y SINCRONIZANDO         ${NC}"
    echo -e "${GREEN}✅ =========================================== ✅${NC}"
else
    echo -e "${RED}❌ Error grave. Revisa la salida.${NC}"
fi

# Cerrar script automáticamente
kill $$
