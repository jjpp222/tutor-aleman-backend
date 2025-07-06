# Despliegue Rápido - Pasos Siguientes

## 1. Después de instalar Azure CLI, ejecuta:

```bash
# Login a Azure
az login

# Verificar que estás en el directorio correcto
cd /Users/jjpp/TutorAlemanBackend

# Verificar tu suscripción
az account show
```

## 2. Crear Function App

```bash
# Usar tu Resource Group existente
RESOURCE_GROUP="TutorAleman-RG"
FUNCTION_APP_NAME="tutor-aleman-api-jjpp"
STORAGE_ACCOUNT="tutoralemanstoragejjpp"

# Crear Function App
az functionapp create \
  --resource-group $RESOURCE_GROUP \
  --consumption-plan-location "East US" \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4 \
  --name $FUNCTION_APP_NAME \
  --storage-account $STORAGE_ACCOUNT \
  --os-type Linux
```

## 3. Configurar variables de entorno

```bash
# Obtener credenciales de Cosmos DB
COSMOS_ENDPOINT=$(az cosmosdb show --name tutor-aleman-db-jjpp --resource-group TutorAleman-RG --query documentEndpoint --output tsv)
COSMOS_KEY=$(az cosmosdb keys list --name tutor-aleman-db-jjpp --resource-group TutorAleman-RG --query primaryMasterKey --output tsv)

# Generar JWT secret
JWT_SECRET=$(openssl rand -base64 32)

# Configurar la Function App
az functionapp config appsettings set \
  --name $FUNCTION_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings \
  COSMOS_DB_ENDPOINT="$COSMOS_ENDPOINT" \
  COSMOS_DB_KEY="$COSMOS_KEY" \
  JWT_SECRET="$JWT_SECRET" \
  NODE_ENV="production" \
  AZURE_AI_ENDPOINT="https://jorge-mchkyps4-swedencentral.services.ai.azure.com" \
  AZURE_AI_KEY="[Tu clave de Azure AI - la que vimos en el portal]"
```

## 4. Crear base de datos y contenedores

```bash
# Crear database
az cosmosdb sql database create \
  --account-name tutor-aleman-db-jjpp \
  --resource-group TutorAleman-RG \
  --name TutorAlemanDB

# Crear container para usuarios
az cosmosdb sql container create \
  --account-name tutor-aleman-db-jjpp \
  --resource-group TutorAleman-RG \
  --database-name TutorAlemanDB \
  --name users \
  --partition-key-path "/id" \
  --throughput 400

# Crear container para conversaciones
az cosmosdb sql container create \
  --account-name tutor-aleman-db-jjpp \
  --resource-group TutorAleman-RG \
  --database-name TutorAlemanDB \
  --name conversations \
  --partition-key-path "/id" \
  --throughput 400

# Crear container para sesiones de habla
az cosmosdb sql container create \
  --account-name tutor-aleman-db-jjpp \
  --resource-group TutorAleman-RG \
  --database-name TutorAlemanDB \
  --name speechSessions \
  --partition-key-path "/id" \
  --throughput 400
```

## 5. Instalar Azure Functions Core Tools

Si no puedes instalar globalmente, usa npx:

```bash
# En lugar de instalar globalmente, usa npx
npx azure-functions-core-tools@4 azure functionapp publish tutor-aleman-api-jjpp
```

## 6. Desplegar el código

```bash
# Desde el directorio TutorAlemanBackend
npm install

# Desplegar usando npx si no tienes func instalado globalmente
npx azure-functions-core-tools@4 azure functionapp publish tutor-aleman-api-jjpp

# O si tienes func instalado:
# func azure functionapp publish tutor-aleman-api-jjpp
```

## 7. Probar el despliegue

Tu API estará disponible en:
`https://tutor-aleman-api-jjpp.azurewebsites.net/api`

Probar endpoints:
```bash
# Registrar usuario
curl -X POST https://tutor-aleman-api-jjpp.azurewebsites.net/api/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"TestPass123!"}'

# Login
curl -X POST https://tutor-aleman-api-jjpp.azurewebsites.net/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}'
```

## 8. Actualizar frontend

Edita `/Users/jjpp/TutorAlemanFrontend/script.js`:

```javascript
// Cambiar esta línea:
const API_BASE_URL = 'http://localhost:7071/api';

// Por esta:
const API_BASE_URL = 'https://tutor-aleman-api-jjpp.azurewebsites.net/api';
```

## 9. Desplegar frontend

### Opción más fácil - Netlify:
1. Ve a https://app.netlify.com
2. Arrastra la carpeta `TutorAlemanFrontend` 
3. ¡Listo!

### O GitHub Pages:
1. Sube el frontend a un repo de GitHub
2. Habilita GitHub Pages en settings
3. Tu sitio estará en `https://yourusername.github.io/repo-name`

¡Una vez hecho esto tendrás tu aplicación completa funcionando en Azure! 🚀