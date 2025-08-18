import express, { type Request, type Response, type NextFunction } from 'express'
import crypto from 'crypto'
import axios, { type AxiosResponse } from 'axios'
import cors from 'cors'
import dotenv from 'dotenv'
import {
  type Config, type ZegoSignatureParams, type ZegoSignature, type ZegoResponse,
  type AgentConfig, type InstanceConfig, type StartSessionRequest,
  type SendMessageRequest, type StopSessionRequest, type TTSRequest,
  type TokenResponse
} from './types.js'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { generateToken04 } = require('../zego-token.cjs')

dotenv.config()

const app = express()
app.use(express.json())
app.use(cors())

const CONFIG: Config = {
  ZEGO_APP_ID: process.env.ZEGO_APP_ID!,
  ZEGO_SERVER_SECRET: process.env.ZEGO_SERVER_SECRET!,
  ZEGO_API_BASE_URL: process.env.ZEGO_API_BASE_URL!, // e.g. https://ai-agent-api.zegocloud.com/v2
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY || '',
  PORT: parseInt(process.env.PORT || '8080', 10),
  PROXY_AUTH: process.env.PROXY_AUTH_TOKEN || 'secure_proxy_token_123',
  NODE_ENV: process.env.NODE_ENV || 'development',
  SERVER_URL: process.env.SERVER_URL || 'http://localhost:8080'
}

let REGISTERED_AGENT_ID: string | null = null

function generateZegoSignature(params: ZegoSignatureParams): ZegoSignature {
  const Timestamp = Math.floor(Date.now() / 1000)
  const SignatureNonce = crypto.randomBytes(16).toString('hex')

  const base: ZegoSignatureParams = {
    ...params,
    AppId: CONFIG.ZEGO_APP_ID,
    SignatureNonce,
    Timestamp,
    SignatureVersion: '2.0'
  }

  const query = Object.keys(base).sort().map(k => `${k}=${base[k]}`).join('&')
  const Signature = crypto.createHmac('sha256', CONFIG.ZEGO_SERVER_SECRET).update(query).digest('hex')

  return { ...(base as any), Signature } as ZegoSignature
}

async function makeZegoRequest(action: string, body: object = {}): Promise<ZegoResponse> {
  const q = generateZegoSignature({ Action: action })
  const url = `${CONFIG.ZEGO_API_BASE_URL}?${Object.keys(q).map(k => `${k}=${encodeURIComponent(String((q as any)[k]))}`).join('&')}`
  const res: AxiosResponse<ZegoResponse> = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 })
  return res.data
}

async function registerAgent(): Promise<string> {
  if (REGISTERED_AGENT_ID) return REGISTERED_AGENT_ID
  const agentId = `agent_${Date.now()}`
  const agentConfig: AgentConfig = {
    AgentId: agentId,
    Name: 'AI Assistant',
    LLM: {
      Url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      ApiKey: CONFIG.DASHSCOPE_API_KEY,
      Model: 'qwen-plus',
      SystemPrompt: 'You are a helpful assistant.',
      Temperature: 0.7,
      TopP: 0.9,
      Params: { max_tokens: 300 }
    },
    TTS: {
      Vendor: 'CosyVoice',
      Url: '',
      Params: {
        app: { api_key: CONFIG.DASHSCOPE_API_KEY || 'zego_test' },
        voice: 'longxiaochun_v2',
        encoding: 'linear16'
      }
    },
    ASR: {
      HotWord: 'AI|10,Assistant|8,ZEGOCLOUD|10',
      VADSilenceSegmentation: 800,
      PauseInterval: 1200
    }
  }
  const r = await makeZegoRequest('RegisterAgent', agentConfig)
  if (r.Code !== 0) throw new Error(`ZEGO RegisterAgent ${r.Code} ${r.Message}`)
  REGISTERED_AGENT_ID = agentId
  return agentId
}

app.post('/api/start', async (req: Request<{}, {}, StartSessionRequest>, res: Response) => {
  try {
    const { room_id, user_id } = req.body
    if (!room_id || !user_id) { res.status(400).json({ error: 'room_id and user_id are required' }); return }

    const agentId = await registerAgent()
    const instance: InstanceConfig = {
      AgentId: agentId,
      UserId: user_id,
      RTC: { RoomId: room_id, StreamId: `${user_id}_stream` },
      MessageHistory: { SyncMode: 1, Messages: [], WindowSize: 10 },
      CallbackConfig: { ASRResult: 1, LLMResult: 1, Exception: 1, Interrupted: 1, UserSpeakAction: 1, AgentSpeakAction: 1 },
      AdvancedConfig: { InterruptMode: 0 }
    }

    const r = await makeZegoRequest('CreateAgentInstance', instance)
    if (r.Code !== 0) { res.status(400).json({ error: r.Message || 'CreateAgentInstance failed' }); return }
    res.json({ success: true, agentInstanceId: r.Data?.AgentInstanceId, agentId })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'start failed' })
  }
})

app.post('/api/send-message', async (req: Request<{}, {}, SendMessageRequest>, res: Response) => {
  try {
    const { agent_instance_id, message } = req.body
    if (!agent_instance_id || !message) { res.status(400).json({ error: 'agent_instance_id and message are required' }); return }

    const payload = { AgentInstanceId: agent_instance_id, Text: message, AddQuestionToHistory: true, AddAnswerToHistory: true }
    const r = await makeZegoRequest('SendAgentInstanceLLM', payload)
    if (r.Code !== 0) { res.status(400).json({ error: r.Message || 'send failed' }); return }
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'send failed' })
  }
})

app.post('/api/stop', async (req: Request<{}, {}, StopSessionRequest>, res: Response) => {
  try {
    const { agent_instance_id } = req.body
    if (!agent_instance_id) { res.status(400).json({ error: 'agent_instance_id is required' }); return }

    const r = await makeZegoRequest('DeleteAgentInstance', { AgentInstanceId: agent_instance_id })
    if (r.Code !== 0) { res.status(400).json({ error: r.Message || 'stop failed' }); return }
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'stop failed' })
  }
})

app.post('/api/callbacks', (req: Request, res: Response) => {
  res.json({ success: true })
})

app.post('/proxy/tts', async (req: Request<{}, {}, TTSRequest>, res: Response) => {
  res.status(501).json({ error: 'not used' })
})

app.get('/api/token', (req: Request, res: Response<TokenResponse | { error: string }>) => {
  try {
    const userId = req.query.user_id as string
    if (!userId) { res.status(400).json({ error: 'user_id is required' }); return }

    const payloadObject = { room_id: null, privilege: { 1: 1, 2: 1 }, stream_id_list: null }
    const token = generateToken04(
      parseInt(CONFIG.ZEGO_APP_ID, 10),
      userId,
      CONFIG.ZEGO_SERVER_SECRET,
      3600,
      JSON.stringify(payloadObject)
    )
    res.json({ token })
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to generate token' })
  }
})

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    registeredAgent: !!REGISTERED_AGENT_ID,
    config: {
      hasDashScope: !!CONFIG.DASHSCOPE_API_KEY,
      hasZego: !!CONFIG.ZEGO_APP_ID
    }
  })
})

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(CONFIG.PORT, () => {
  console.log(`server on :${CONFIG.PORT}`)
})