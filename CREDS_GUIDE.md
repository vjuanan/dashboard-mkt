# Cómo obtener tus Credenciales de Google Ads

Necesitas 5 valores clave. Sigue estos pasos exactos:

## 1. Google Ads Developer Token
1. Entra a tu [Google Ads Manager Account (MCC)](https://ads.google.com/).
2. Ve a **Herramientas y Configuración** > **Configuración** > **Centro de API**.
3. Copia el **Token de desarrollador**.
   * *Nota: Si es "Acceso de prueba", solo podrás acceder a cuentas de prueba o a la misma cuenta de producción vinculada, lo cual sirve para esto.*

## 2. Customer ID
1. Es el número de 10 dígitos arriba a la derecha en tu cuenta de Google Ads (ej: `123-456-7890`).
2. Úsalo **sin guiones** (ej: `1234567890`).

## 3. Client ID y Client Secret (OAuth2)
1. Ve a la [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un proyecto nuevo (o usa uno existente).
3. Ve a **APIs y Servicios** > **Biblioteca**. Busca **Google Ads API** y habilítala.
4. Ve a **APIs y Servicios** > **Pantalla de consentimiento OAuth**:
   * Tipo: **Externo**.
   * Rellena nombre y correo.
   * Agrega tu correo como **Usuario de prueba**.
5. Ve a **Credenciales** > **Crear Credenciales** > **ID de cliente de OAuth**.
   * Tipo: **Aplicación web**.
   * URIs de redirección autorizados: `https://developers.google.com/oauthplayground` (Esto es para obtener el refresh token fácil).
6. Copia el **ID de cliente** y el **Secreto de cliente**.

## 4. Refresh Token (El paso difícil, simplificado)
1. Entra al [OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
2. A la derecha, haz clic en el engranaje ⚙️.
   * Marca "Use your own OAuth credentials".
   * Pega tu **OAuth Client ID** y **OAuth Client Secret**.
3. A la izquierda, en "Input your own scopes", pega: `https://www.googleapis.com/auth/adwords`.
4. Haz clic en **Authorize APIs**.
5. Inicia sesión con tu cuenta de Google (ignora la advertencia de "App no verificada", es tu propia app).
6. Haz clic en **Exchange authorization code for tokens**.
7. Copia el **Refresh Token** (el que es largo).

---

## 5. Dónde ponerlos
He creado un archivo `.env` en tu proyecto. Completa los valores ahí:

```bash
GOOGLE_ADS_CLIENT_ID=...
GOOGLE_ADS_CLIENT_SECRET=...
GOOGLE_ADS_REFRESH_TOKEN=...
GOOGLE_ADS_DEVELOPER_TOKEN=...
GOOGLE_ADS_CUSTOMER_ID=...
```
