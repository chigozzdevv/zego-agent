import express, { type Request, type Response, type NextFunction } from 'express'
import crypto from 'crypto'
import axios, { type AxiosError, type AxiosResponse } from 'axios'
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
app.use(express.json({ limit: '1mb' }))
app.use(cors())

const CONFIG: Config = {
  ZEGO_APP_ID: process.env.ZEGO_APP_ID!,
  ZEGO_SERVER_SECRET: process.env.ZEGO_SERVER_SECRET!,
  ZEGO_API_BASE_URL: process.env.ZEGO_API_BASE_URL!,
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY || '',
  PORT: parseInt(process.env.PORT || '8080', 10),
  PROXY_AUTH: process.env.PROXY_AUTH_TOKEN || 'secure_proxy_token_123',
  NODE_ENV: process.env.NODE_ENV || 'development',
  SERVER_URL: process.env.SERVER_URL || 'http://localhost:8080'
}

function mask(val: any, show = 6) {
  if (val == null) return val
  const s = String(val)
  if (s.length <= show) return '*'.repeat(Math.max(0, s.length))
  return s.slice(0, show) + '…' + '*'.repeat(Math.max(0, s.length - show - 1))
}

function log(event: string, meta: Record<string, any> = {}, level: 'info' | 'error' = 'info') {
  const row = { ts: new Date().toISOString(), level, event, ...meta }
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(row))
}

app.use((req, res, next) => {
  ;(req as any)._rid = crypto.randomUUID()
  const start = Date.now()
  log('http.request', {
    rid: (req as any)._rid,
    method: req.method,
    url: req.originalUrl,
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    ua: req.headers['user-agent'],
    origin: req.headers.origin,
    body: req.method !== 'GET' ? req.body : undefined
  })
  res.on('finish', () => {
    log('http.response', {
      rid: (req as any)._rid,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - start
    })
  })
  next()
})

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

  const sortedKeys = Object.keys(base).sort()
  const query = sortedKeys.map(k => `${k}=${base[k]}`).join('&')
  const Signature = crypto.createHmac('sha256', CONFIG.ZEGO_SERVER_SECRET).update(query).digest('hex')

  log('zego.signature.built', {
    action: params['Action'],
    timestamp: Timestamp,
    nonce: SignatureNonce,
    query_string: query,
    app_id: CONFIG.ZEGO_APP_ID,
    server_secret_masked: mask(CONFIG.ZEGO_SERVER_SECRET)
  })

  return { ...(base as any), Signature } as ZegoSignature
}

async function makeZegoRequest(action: string, body: object = {}): Promise<ZegoResponse> {
  const q = generateZegoSignature({ Action: action })
  const url = `${CONFIG.ZEGO_API_BASE_URL}?${Object.keys(q).map(k => `${k}=${encodeURIComponent(String((q as any)[k]))}`).join('&')}`

  log('zego.request', {
    action,
    url,
    body,
    base_url: CONFIG.ZEGO_API_BASE_URL
  })

  try {
    const res: AxiosResponse<ZegoResponse> = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
      validateStatus: () => true
    })

    log('zego.response', {
      action,
      status: res.status,
      code: res.data?.Code,
      message: res.data?.Message,
      request_id: res.data?.RequestId,
      data_present: !!res.data?.Data
    })

    return res.data
  } catch (err) {
    const e = err as AxiosError
    log('zego.error', {
      action,
      code: (e as any).code,
      status: e.response?.status,
      status_text: e.response?.statusText,
      resp_headers: e.response?.headers,
      resp_data: e.response?.data,
      message: e.message,
    }, 'error')
    throw e
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

  log('zego.registerAgent.call', {
    agent_id: agentId,
    llm_url: agentConfig.LLM.Url,
    llm_model: agentConfig.LLM.Model,
    llm_api_key_masked: mask(agentConfig.LLM.ApiKey),
    tts_vendor: agentConfig.TTS.Vendor,
    tts_voice: agentConfig.TTS.Params.voice
  })

  const r = await makeZegoRequest('RegisterAgent', agentConfig)

  if (r.Code !== 0) {
    log('zego.registerAgent.failed', { code: r.Code, message: r.Message, req_id: r.RequestId }, 'error')
    throw new Error(`ZEGO RegisterAgent ${r.Code} ${r.Message}`)
  }

  REGISTERED_AGENT_ID = agentId
  log('zego.registerAgent.ok', { agent_id: agentId })
  return agentId
}

app.post('/api/start', async (req: Request<{}, {}, StartSessionRequest>, res: Response) => {
  const rid = (req as any)._rid
  try {
    const { room_id, user_id } = req.body
    if (!room_id || !user_id) { res.status(400).json({ error: 'room_id and user_id are required' }); return }

    log('api.start.input', { rid, room_id, user_id })

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

    if (r.Code !== 0) {
      log('api.start.zego_fail', { rid, code: r.Code, message: r.Message, req_id: r.RequestId, data: r.Data }, 'error')
      res.status(400).json({ error: r.Message || 'CreateAgentInstance failed', code: r.Code, requestId: r.RequestId, data: r.Data })
      return
    }

    const agentInstanceId = r.Data?.AgentInstanceId
    log('api.start.ok', { rid, agent_id: agentId, agent_instance_id: agentInstanceId })
    res.json({ success: true, agentInstanceId, agentId })
  } catch (e: any) {
    log('api.start.error', { rid, message: e?.message, stack: e?.stack }, 'error')
    res.status(500).json({ error: e?.message || 'start failed' })
  }
})

app.post('/api/send-message', async (req: Request<{}, {}, SendMessageRequest>, res: Response) => {
  const rid = (req as any)._rid
  try {
    const { agent_instance_id, message } = req.body
    if (!agent_instance_id || !message) { res.status(400).json({ error: 'agent_instance_id and message are required' }); return }

    log('api.send.input', { rid, agent_instance_id, message_len: String(message).length })

    const payload = { AgentInstanceId: agent_instance_id, Text: message, AddQuestionToHistory: true, AddAnswerToHistory: true }
    const r = await makeZegoRequest('SendAgentInstanceLLM', payload)

    if (r.Code !== 0) {
      log('api.send.zego_fail', { rid, code: r.Code, message: r.Message, req_id: r.RequestId }, 'error')
      res.status(400).json({ error: r.Message || 'send failed', code: r.Code, requestId: r.RequestId })
      return
    }

    log('api.send.ok', { rid })
    res.json({ success: true })
  } catch (e: any) {
    log('api.send.error', { rid, message: e?.message, stack: e?.stack }, 'error')
    res.status(500).json({ error: e?.message || 'send failed' })
  }
})

app.post('/api/stop', async (req: Request<{}, {}, StopSessionRequest>, res: Response) => {
  const rid = (req as any)._rid
  try {
    const { agent_instance_id } = req.body
    if (!agent_instance_id) { res.status(400).json({ error: 'agent_instance_id is required' }); return }

    log('api.stop.input', { rid, agent_instance_id })

    const r = await makeZegoRequest('DeleteAgentInstance', { AgentInstanceId: agent_instance_id })

    if (r.Code !== 0) {
      log('api.stop.zego_fail', { rid, code: r.Code, message: r.Message, req_id: r.RequestId }, 'error')
      res.status(400).json({ error: r.Message || 'stop failed', code: r.Code, requestId: r.RequestId })
      return
    }

    log('api.stop.ok', { rid })
    res.json({ success: true })
  } catch (e: any) {
    log('api.stop.error', { rid, message: e?.message, stack: e?.stack }, 'error')
    res.status(500).json({ error: e?.message || 'stop failed' })
  }
})

app.post('/api/callbacks', (req: Request, res: Response) => {
  log('api.callbacks', { event: req.body?.Event, data_keys: Object.keys(req.body || {}) })
  res.json({ success: true })
})

app.post('/proxy/tts', async (_req: Request<{}, {}, TTSRequest>, res: Response) => {
  res.status(501).json({ error: 'not used' })
})

app.get('/api/token', (req: Request, res: Response<TokenResponse | { error: string }>) => {
  const rid = (req as any)._rid
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
    log('api.token.ok', { rid, user_id: userId, app_id: CONFIG.ZEGO_APP_ID })
    res.json({ token })
  } catch (e: any) {
    log('api.token.error', { rid, message: e?.message, stack: e?.stack }, 'error')
    res.status(500).json({ error: 'Failed to generate token' })
  }
})

app.get('/debug/signature', (req: Request, res: Response) => {
  try {
    const action = String(req.query.action || 'RegisterAgent')
    const sig = generateZegoSignature({ Action: action })
    const query = Object.keys(sig).sort().map(k => `${k}=${(sig as any)[k]}`).join('&')
    res.json({ action, signature: sig.Signature, params: sig, query })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'debug failed' })
  }
})

app.get('/health', (_req: Request, res: Response) => {
  const nowSec = Math.floor(Date.now() / 1000)
  res.json({
    status: 'healthy',
    timestamp_iso: new Date().toISOString(),
    timestamp_sec: nowSec,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    registeredAgent: !!REGISTERED_AGENT_ID,
    config: {
      app_id: CONFIG.ZEGO_APP_ID,
      api_base_url: CONFIG.ZEGO_API_BASE_URL,
      dashscope_key_masked: mask(CONFIG.DASHSCOPE_API_KEY),
      server_secret_len: CONFIG.ZEGO_SERVER_SECRET?.length || 0,
      node_env: CONFIG.NODE_ENV
    }
  })
})

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log('express.unhandled', { message: err.message, stack: err.stack }, 'error')
  res.status(500).json({ error: 'Internal server error' })
})

function dumpStartup() {
  log('startup.config', {
    app_id: CONFIG.ZEGO_APP_ID,
    api_base_url: CONFIG.ZEGO_API_BASE_URL,
    server_secret_masked: mask(CONFIG.ZEGO_SERVER_SECRET),
    dashscope_key_masked: mask(CONFIG.DASHSCOPE_API_KEY),
    node_env: CONFIG.NODE_ENV,
    server_url: CONFIG.SERVER_URL
  })
  log('startup.clock', {
    now_iso: new Date().toISOString(),
    now_sec: Math.floor(Date.now() / 1000),
    process_uptime_sec: Math.floor(process.uptime())
  })
}

app.listen(CONFIG.PORT, () => {
  dumpStartup()
  // eslint-disable-next-line no-console
  console.log(`server on :${CONFIG.PORT}`)
})
