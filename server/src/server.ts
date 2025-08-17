import express, { type Request, type Response, type NextFunction } from 'express'
import crypto from 'crypto'
import axios, { type AxiosResponse } from 'axios'
import cors from 'cors'
import dotenv from 'dotenv'
import { createRequire } from 'module'
import type {
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

const require = createRequire(import.meta.url)
const { generateToken04 } = require('../zego-token.cjs')

dotenv.config()

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', true)
app.use(express.json())
app.use(cors())

const CONFIG: Config = {
  ZEGO_APP_ID: process.env.ZEGO_APP_ID!,
  ZEGO_SERVER_SECRET: process.env.ZEGO_SERVER_SECRET!,
  ZEGO_API_BASE_URL: (process.env.ZEGO_API_BASE_URL || 'https://aigc-aiagent-api.zegotech.cn').replace(/\/+$/, ''),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY || '',
  PORT: parseInt(process.env.PORT || '8080', 10),
  PROXY_AUTH: process.env.PROXY_AUTH_TOKEN || 'secure_proxy_token_123',
  NODE_ENV: process.env.NODE_ENV || 'development',
  SERVER_URL: (process.env.SERVER_URL || `http://localhost:${process.env.PORT || '8080'}`).replace(/\/+$/, '')
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
  return { ...(signatureParams as any), Signature: signature } as ZegoSignature
}

async function makeZegoRequest(action: string, bodyParams: object = {}): Promise<ZegoResponse> {
  const queryParams = generateZegoSignature({ Action: action })
  const url = `${CONFIG.ZEGO_API_BASE_URL}?${Object.keys(queryParams)
    .map(key => `${key}=${encodeURIComponent((queryParams as any)[key])}`)
    .join('&')}`
  const response: AxiosResponse<ZegoResponse> = await axios.post(url, bodyParams, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000
  })
  return response.data
}

/* ---------- LLM proxy (ZEGO -> your server -> OpenAI) ---------- */
app.post('/proxy/llm', async (req: Request, res: Response): Promise<void> => {
  if (req.headers.authorization !== `Bearer ${CONFIG.PROXY_AUTH}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const upstream = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { ...req.body, stream: true },
      {
        headers: {
          Authorization: `Bearer ${CONFIG.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        timeout: 30000
      }
    )
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    upstream.data.pipe(res)
    upstream.data.on('end', () => res.end())
    upstream.data.on('error', () => res.end())
    req.on('close', () => upstream.data.destroy())
  } catch (err: any) {
    const msg = err?.response?.data || err?.message || 'LLM request failed'
    res.status(500).json({ error: msg })
  }
})

async function registerAgent(): Promise<string> {
  if (REGISTERED_AGENT_ID) return REGISTERED_AGENT_ID

  const agentId = `agent_${Date.now()}`
  const agentConfig: AgentConfig = {
    AgentId: agentId,
    Name: 'AI Assistant',
    LLM: {
      Url: `${CONFIG.SERVER_URL}/proxy/llm`,
      ApiKey: CONFIG.PROXY_AUTH,
      Model: 'gpt-4o-mini',
      SystemPrompt: 'You are a helpful AI assistant. Keep replies concise and natural.',
      Temperature: 0.7,
      TopP: 0.9,
      Params: { max_tokens: 150 }
    },
    TTS: {
      Vendor: 'CosyVoice',
      Params: {
        app: { api_key: CONFIG.DASHSCOPE_API_KEY || 'zego_test' },
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

/* ---------- API ---------- */
app.post('/api/start', async (req: Request<{}, {}, StartSessionRequest>, res: Response) => {
  try {
    const { room_id, user_id } = req.body
    if (!room_id || !user_id) {
      res.status(400).json({ error: 'room_id and user_id are required' })
      return
    }

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
      res.json({ success: true, agentInstanceId: result.Data?.AgentInstanceId, agentId })
      return
    }
    res.status(400).json({ error: result.Message || 'Failed to create agent instance', detail: result })
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'CreateAgentInstance error' })
  }
})

app.post('/api/send-message', async (req: Request<{}, {}, SendMessageRequest>, res: Response) => {
  try {
    const { agent_instance_id, message } = req.body
    if (!agent_instance_id || !message) {
      res.status(400).json({ error: 'agent_instance_id and message are required' })
      return
    }
    const payload = { AgentInstanceId: agent_instance_id, Text: message, AddQuestionToHistory: true, AddAnswerToHistory: true }
    const result = await makeZegoRequest('SendAgentInstanceLLM', payload)
    if (result.Code === 0) {
      res.json({ success: true })
      return
    }
    res.status(400).json({ error: result.Message || 'Failed to send message', detail: result })
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'SendAgentInstanceLLM error' })
  }
})

app.post('/api/stop', async (req: Request<{}, {}, StopSessionRequest>, res: Response) => {
  try {
    const { agent_instance_id } = req.body
    if (!agent_instance_id) {
      res.status(400).json({ error: 'agent_instance_id is required' })
      return
    }
    const result = await makeZegoRequest('DeleteAgentInstance', { AgentInstanceId: agent_instance_id })
    if (result.Code === 0) {
      res.json({ success: true })
      return
    }
    res.status(400).json({ error: result.Message || 'Failed to stop agent instance', detail: result })
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'DeleteAgentInstance error' })
  }
})

app.post('/api/callbacks', (req: Request, res: Response): void => {
  console.log('Callback:', JSON.stringify(req.body))
  res.json({ success: true })
})

app.get(
  '/api/token',
  (req: Request, res: Response<TokenResponse | { error: string }>): void => {
    try {
      const userId = String(req.query.user_id || '')
      if (!userId) {
        res.status(400).json({ error: 'user_id is required' })
        return
      }
      const payloadObject = { room_id: null, privilege: { 1: 1, 2: 1 }, stream_id_list: null }
      const token = generateToken04(
        parseInt(CONFIG.ZEGO_APP_ID, 10),
        userId,
        CONFIG.ZEGO_SERVER_SECRET,
        3600,
        JSON.stringify(payloadObject)
      )
      res.json({ token })
    } catch {
      res.status(500).json({ error: 'Failed to generate token' })
    }
  }
)

app.get('/health', (_: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    registeredAgent: !!REGISTERED_AGENT_ID,
    config: {
      hasOpenAI: !!CONFIG.OPENAI_API_KEY,
      hasZego: !!CONFIG.ZEGO_APP_ID,
      hasDashScope: !!CONFIG.DASHSCOPE_API_KEY
    }
  })
})

app.use((err: Error, _: Request, res: Response, __: NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(CONFIG.PORT, () => {
  console.log(`Server on :${CONFIG.PORT}`)
})