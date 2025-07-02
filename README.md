# TutorAleman Backend

Backend Azure Functions para la plataforma de práctica oral de alemán con IA.

## 🚀 Funciones Disponibles

### 1. `hello` - Función de prueba
- **Endpoint:** `/api/hello`
- **Método:** GET
- **Descripción:** Función de prueba básica

### 2. `test-chat` - Chat con IA
- **Endpoint:** `/api/test-chat`
- **Método:** POST
- **Descripción:** Conversación con tutor virtual de alemán usando Azure OpenAI
- **Variables requeridas:**
  - `AZURE_OPENAI_ENDPOINT`
  - `AZURE_OPENAI_KEY`
  - `AZURE_OPENAI_DEPLOYMENT_NAME`

### 3. `voice-conversation` - Conversación por voz
- **Endpoint:** `/api/voice-conversation`
- **Método:** POST
- **Descripción:** Función básica para manejar conversaciones por voz

### 4. `speech-synthesize-url` - Síntesis de voz
- **Endpoint:** `/api/speech-synthesize-url`
- **Método:** POST
- **Descripción:** Convierte texto a audio usando Azure Speech Services
- **Variables requeridas:**
  - `AZURE_SPEECH_KEY`
  - `AZURE_SPEECH_REGION`

## 🛠️ Configuración

### Variables de Entorno Requeridas
```
AZURE_OPENAI_ENDPOINT=https://your-openai-resource.openai.azure.com/
AZURE_OPENAI_KEY=your-openai-key
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
AZURE_SPEECH_KEY=your-speech-key
AZURE_SPEECH_REGION=your-region
```

## 📁 Estructura del Proyecto
```
├── hello/                  # Función de prueba
├── test-chat/             # Chat con IA
├── voice-conversation/    # Conversación por voz
├── speech-synthesize-url/ # Síntesis de voz
├── host.json             # Configuración Azure Functions
├── package.json          # Dependencias Node.js
└── .funcignore          # Archivos ignorados en deployment
```

## 🚀 Deployment

Este proyecto se despliega automáticamente en Azure Functions mediante GitHub Actions cuando se hace push a la rama `main`.

## 🔧 Desarrollo Local

```bash
# Instalar dependencias
npm install

# Iniciar funciones localmente
npm start
```

## 📝 Logs y Debugging

Las funciones incluyen logging detallado para facilitar el debugging en Azure.