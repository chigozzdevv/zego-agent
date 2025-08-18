import express, { Request, Response, NextFunction } from 'express'
import type { AxiosResponse } from 'axios'
import axios from 'axios'
import cors from 'cors'
import dotenv from 'dotenv'
import crypto from 'crypto'
import {
  Config,
  ZegoSignatureParams,
  ZegoSignature,
  ZegoResponse,
  AgentConfig,
  InstanceConfig,
  StartSessionRequest,
  SendMessageRequest,
  StopSessionRequest,
  TokenResponse
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
  ZEGO_API_BASE_URL: process.env.ZEGO_API_BASE_URL!,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY!,
  PORT: parseInt(process.env.PORT || '8080', 10),
  PROXY_AUTH: process.env.PROXY_AUTH_TOKEN || 'secure_proxy_token_123',
  NODE_ENV: process.env.NODE_ENV || 'development',
  SERVER_URL: process.env.SERVER_URL || 'https://zego-agent.onrender.com'
}

let REGISTERED_AGENT_ID: string | null = null

function generateZegoSignature(params: ZegoSignatureParams): ZegoSignature {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomBytes(16).toString('hex')
  const signatureParams: ZegoSignatureParams = {
    ...params,
    AppId: CONFIG.ZEGO_APP_ID,
    SignatureNonce: nonce,
    Timestamp: timestamp,
    SignatureVersion: '2.0'
  }
  const sortedKeys = Object.keys(signatureParams).sort()
  const queryString = sortedKeys.map(k => `${k}=${signatureParams[k]}`).join('&')
  const signature = crypto.createHmac('sha256', CONFIG.ZEGO_SERVER_SECRET).update(queryString).digest('hex')
  return { ...signatureParams, Signature: signature } as ZegoSignature
}

async function makeZegoRequest(action: string, bodyParams: object = {}): Promise<ZegoResponse> {
  const qp = generateZegoSignature({ Action: action })
  const url = `${CONFIG.ZEGO_API_BASE_URL}?${Object.keys(qp).map(k => `${k}=${encodeURIComponent(String(qp[k]))}`).join('&')}`
  try {
    const response: AxiosResponse<ZegoResponse> = await axios.post(url, bodyParams, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    })
    return response.data
  } catch (err: any) {
    const status = err.response?.status
    const body = err.response?.data
    throw new Error(`ZEGO ${action} ${status || ''} ${body ? JSON.stringify(body) : err.message}`)
  }
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
      SystemPrompt: 'You are a helpful AI assistant.',
      Temperature: 0.7,
      TopP: 0.9,
      Params: { max_tokens: 512 }
    },
    TTS: {
      Vendor: 'CosyVoice',
      Url: 'https://dashscope.aliyuncs.com',
      Params: {
        app: { api_key: CONFIG.DASHSCOPE_API_KEY },
        encoding: 'linear16',
        payload: {
          model: 'cosyvoice-v2',
          parameters: { voice: 'longxiaochun_v2' }
        }
      }
    },
    ASR: {
      HotWord: 'AI|10,Assistant|8,ZEGOCLOUD|10',
      VADSilenceSegmentation: 800,
      PauseInterval: 1200
    }
  }
  const result = await makeZegoRequest('RegisterAgent', agentConfig)
  if (result.Code !== 0) throw new Error(result.Message || 'RegisterAgent failed')
  REGISTERED_AGENT_ID = agentId
  return agentId
}

app.post('/api/start', async (req: Request<{}, {}, StartSessionRequest>, res: Response) => {
  try {
    const { room_id, user_id } = req.body
    if (!room_id || !user_id) return res.status(400).json({ error: 'room_id and user_id are required' })
    const agentId = await registerAgent()
    const instanceConfig: InstanceConfig = {
      AgentId: agentId,
      UserId: user_id,
      RTC: { RoomId: room_id, StreamId: `${user_id}_stream` },
      MessageHistory: { SyncMode: 1, Messages: [], WindowSize: 10 },
      CallbackConfig: { ASRResult: 1, LLMResult: 1, Exception: 1, Interrupted: 1, UserSpeakAction: 1, AgentSpeakAction: 1 },
      AdvancedConfig: { InterruptMode: 0 }
    }
    const result = await makeZegoRequest('CreateAgentInstance', instanceConfig)
    if (result.Code === 0) {
      return res.json({ success: true, agentInstanceId: result.Data?.AgentInstanceId, agentId })
    }
    return res.status(400).json({ error: result.Message || 'CreateAgentInstance failed', zego: result })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'start failed' })
  }
})

app.post('/api/send-message', async (req: Request<{}, {}, SendMessageRequest>, res: Response) => {
  try {
    const { agent_instance_id, message } = req.body
    if (!agent_instance_id || !message) return res.status(400).json({ error: 'agent_instance_id and message are required' })
    const msg = { AgentInstanceId: agent_instance_id, Text: message, AddQuestionToHistory: true, AddAnswerToHistory: true }
    const result = await makeZegoRequest('SendAgentInstanceLLM', msg)
    if (result.Code === 0) return res.json({ success: true })
    return res.status(400).json({ error: result.Message || 'SendAgentInstanceLLM failed', zego: result })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'send failed' })
  }
})

app.post('/api/stop', async (req: Request<{}, {}, StopSessionRequest>, res: Response) => {
  try {
    const { agent_instance_id } = req.body
    if (!agent_instance_id) return res.status(400).json({ error: 'agent_instance_id is required' })
    const result = await makeZegoRequest('DeleteAgentInstance', { AgentInstanceId: agent_instance_id })
    if (result.Code === 0) return res.json({ success: true })
    return res.status(400).json({ error: result.Message || 'DeleteAgentInstance failed', zego: result })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'stop failed' })
  }
})

app.post('/api/callbacks', (req: Request, res: Response) => {
  res.json({ success: true })
})

app.get('/api/token', (req: Request, res: Response<TokenResponse | { error: string }>) => {
  try {
    const userId = req.query.user_id as string
    if (!userId) {
      res.status(400).json({ error: 'user_id is required' })
      return
    }
    const payloadObject = { room_id: null, privilege: { 1: 1, 2: 1 }, stream_id_list: null }
    const token = generateToken04(parseInt(CONFIG.ZEGO_APP_ID, 10), userId, CONFIG.ZEGO_SERVER_SECRET, 3600, JSON.stringify(payloadObject))
    res.json({ token })
  } catch {
    res.status(500).json({ error: 'Failed to generate token' })
  }
})

app.get('/health', (req: Request, res: Response) => {
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

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(CONFIG.PORT, () => {
  if (!CONFIG.DASHSCOPE_API_KEY) console.error('Missing DASHSCOPE_API_KEY')
  if (!CONFIG.ZEGO_APP_ID || !CONFIG.ZEGO_SERVER_SECRET) console.error('Missing ZEGO credentials')
})
