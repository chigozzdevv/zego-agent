# ZEGO Conversational AI

A real-time voice and text conversational AI built with ZEGOCLOUD AI Agent, featuring voice recognition, memory persistence, and natural conversation flow.

## ✨ Features

- **Voice + Text Chat**: Real-time conversation with speech recognition and text-to-speech
- **Memory Persistence**: Conversations saved locally, resume anytime  
- **Voice Interruption**: Natural conversation flow - interrupt AI mid-response
- **Responsive UI**: Works on desktop and mobile with smooth animations

## 🚀 Quick Setup

### 1. Prerequisites

- **ZEGO Account**: Get AppID and ServerSecret from [ZEGO Console](https://console.zegocloud.com)
- **OpenAI API Key**: For the AI responses ([Get one here](https://platform.openai.com/api-keys))
- **Node.js 18+**

### 2. Backend Setup

```bash
cd server
npm install
```

**Update `server/.env`:**
```env
ZEGO_APP_ID=your_zego_app_id
ZEGO_SERVER_SECRET=your_zego_server_secret
ZEGO_API_BASE_URL=https://aigc-aiagent-api.zegotech.cn

LLM_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=your_openai_api_key
LLM_MODEL=gpt-4o-mini

PORT=8080
```

```bash
npm start
```

### 3. Frontend Setup

```bash
# In project root
npm install
```

**Update `.env`:**
```env
VITE_ZEGO_APP_ID=your_zego_app_id
VITE_ZEGO_SERVER=your_zego_websocket_url
VITE_API_BASE_URL=http://localhost:8080
```

```bash
npm run dev
```

### 4. Test the Application

1. Open `http://localhost:5173`
2. Click **"Start Chat"**
3. Try both text and voice input
4. Check conversation persistence in sidebar

## 🔧 Configuration Options

### LLM Providers

**OpenAI (Default):**
```env
LLM_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=your_openai_key
LLM_MODEL=gpt-4o-mini
```

**Azure OpenAI:**
```env
LLM_URL=https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2023-12-01-preview
LLM_API_KEY=your_azure_key
LLM_MODEL=gpt-4
```

**Other Providers:** Any OpenAI-compatible endpoint works.

## 🛠 Development

### Project Structure
```
├── src/
│   ├── components/     # UI components
│   ├── hooks/         # React hooks
│   ├── services/      # API services
│   └── types/         # TypeScript types
└── server/
    └── server.js      # Backend API
```

## 🔍 Troubleshooting

**Backend not starting:**
- Check ZEGO credentials are correct
- Ensure port 8080 is available

**Voice not working:**
- Use HTTPS in production (required for microphone access)
- Check browser supports Web Speech API

**No AI responses:**
- Verify OpenAI API key is valid
- Check backend logs for errors
