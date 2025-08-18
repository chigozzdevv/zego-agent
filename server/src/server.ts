import express, { type Request, type Response, type NextFunction } from 'express'
import crypto from 'crypto'
import axios, { type AxiosResponse } from 'axios'
import cors from 'cors'
import dotenv from 'dotenv'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { generateToken04 } = require('../zego-token.cjs')

dotenv.config()

const app = express()
app.use(express.json())
app.use(cors())

const CONFIG = {
  ZEGO_APP_ID: process.env.ZEGO_APP_ID!,
  ZEGO_SERVER_SECRET: process.env.ZEGO_SERVER_SECRET!,
  ZEGO_API_BASE_URL: 'https://aigc-aiagent-api.zegotech.cn/',
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY || '',
  PORT: parseInt(process.env.PORT || '8080', 10)
}

let REGISTERED_AGENT_ID: string | null = null

function generateZegoSignature(action: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomBytes(8).toString('hex')
  
  const appId = CONFIG.ZEGO_APP_ID
  const serverSecret = CONFIG.ZEGO_SERVER_SECRET
  
  const signString = appId + nonce + serverSecret + timestamp
  const signature = crypto.createHash('md5').update(signString).digest('hex')
  
  return {
    Action: action,
    AppId: appId,
    SignatureNonce: nonce,
    SignatureVersion: '2.0',
    Timestamp: timestamp,
    Signature: signature
  }
}

async function makeZegoRequest(action: string, body: object = {}): Promise<any> {
  const queryParams = generateZegoSignature(action)
  const queryString = Object.entries(queryParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')
  
  const url = `${CONFIG.ZEGO_API_BASE_URL}?${queryString}`
  
  try {
    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    })
    return response.data
  } catch (error: any) {
    console.error('ZEGO API Error:', error.response?.data || error.message)
    throw error
  }
}

async function registerAgent(): Promise<string> {
  if (REGISTERED_AGENT_ID) return REGISTERED_AGENT_ID
  
  const agentId = `agent_${Date.now()}`
  const agentConfig = {
    AgentId: agentId,
    Name: 'AI Assistant',
    LLM: {
      Url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      ApiKey: CONFIG.DASHSCOPE_API_KEY || 'zego_test',
      Model: 'qwen-plus',
      SystemPrompt: 'You are a helpful AI assistant. Be concise and friendly. Respond in the same language as the user.',
      Temperature: 0.7,
      TopP: 0.9,
      Params: { 
        max_tokens: 300
      }
    },
    TTS: {
      Vendor: 'CosyVoice',
      Params: {
        app: { 
          api_key: CONFIG.DASHSCOPE_API_KEY || 'zego_test'
        },
        payload: {
          model: 'cosyvoice-v2',
          parameters: {
            voice: 'longxiaochun_v2'
          }
        }
      }
    },
    ASR: {
      HotWord: 'ZEGOCLOUD|10,AI|8,Assistant|8',
      VADSilenceSegmentation: 800,
      PauseInterval: 1200
    }
  }
  
  const result = await makeZegoRequest('RegisterAgent', agentConfig)
  if (result.Code !== 0) {
    throw new Error(`RegisterAgent failed: ${result.Code} ${result.Message}`)
  }
  
  REGISTERED_AGENT_ID = agentId
  console.log('Agent registered:', agentId)
  return agentId
}

app.post('/api/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const { room_id, user_id, user_stream_id } = req.body
    
    if (!room_id || !user_id) {
      res.status(400).json({ error: 'room_id and user_id required' })
      return
    }
    
    const agentId = await registerAgent()
    
    const userStreamId = user_stream_id || `${user_id}_stream`
    const agentUserId = `agent_${room_id}`
    const agentStreamId = `agent_stream_${room_id}`
    
    const instanceConfig = {
      AgentId: agentId,
      UserId: user_id,
      RTC: {
        RoomId: room_id,
        AgentUserId: agentUserId,
        AgentStreamId: agentStreamId,
        UserStreamId: userStreamId
      },
      MessageHistory: {
        SyncMode: 1,
        Messages: [],
        WindowSize: 20
      },
      CallbackConfig: {
        ASRResult: 1,
        LLMResult: 1,
        Exception: 1,
        Interrupted: 1,
        UserSpeakAction: 1,
        AgentSpeakAction: 1
      },
      AdvancedConfig: {
        InterruptMode: 0
      }
    }
    
    const result = await makeZegoRequest('CreateAgentInstance', instanceConfig)
    
    if (result.Code !== 0) {
      res.status(400).json({ error: result.Message || 'Failed to create instance' })
      return
    }
    
    res.json({
      success: true,
      agentInstanceId: result.Data?.AgentInstanceId,
      agentUserId: agentUserId,
      agentStreamId: agentStreamId,
      userStreamId: userStreamId
    })
    
  } catch (error: any) {
    console.error('Start error:', error)
    res.status(500).json({ error: error.message || 'Internal error' })
  }
})

app.post('/api/stop', async (req: Request, res: Response): Promise<void> => {
  try {
    const { agent_instance_id } = req.body
    
    if (!agent_instance_id) {
      res.status(400).json({ error: 'agent_instance_id required' })
      return
    }
    
    const result = await makeZegoRequest('DeleteAgentInstance', {
      AgentInstanceId: agent_instance_id
    })
    
    if (result.Code !== 0) {
      res.status(400).json({ error: result.Message || 'Failed to delete instance' })
      return
    }
    
    res.json({ success: true })
    
  } catch (error: any) {
    console.error('Stop error:', error)
    res.status(500).json({ error: error.message || 'Internal error' })
  }
})

app.post('/api/send-message', async (req: Request, res: Response): Promise<void> => {
  try {
    const { agent_instance_id, message } = req.body
    
    if (!agent_instance_id || !message) {
      res.status(400).json({ error: 'agent_instance_id and message required' })
      return
    }
    
    const result = await makeZegoRequest('SendAgentInstanceLLM', {
      AgentInstanceId: agent_instance_id,
      Text: message,
      AddQuestionToHistory: true,
      AddAnswerToHistory: true
    })
    
    if (result.Code !== 0) {
      res.status(400).json({ error: result.Message || 'Failed to send message' })
      return
    }
    
    res.json({ success: true })
    
  } catch (error: any) {
    console.error('Send message error:', error)
    res.status(500).json({ error: error.message || 'Internal error' })
  }
})

app.get('/api/token', (req: Request, res: Response): void => {
  try {
    const userId = req.query.user_id as string
    const roomId = req.query.room_id as string
    
    if (!userId) {
      res.status(400).json({ error: 'user_id required' })
      return
    }
    
    const payload = {
      room_id: roomId || '',
      privilege: { 1: 1, 2: 1 },
      stream_id_list: null
    }
    
    const token = generateToken04(
      parseInt(CONFIG.ZEGO_APP_ID, 10),
      userId,
      CONFIG.ZEGO_SERVER_SECRET,
      3600,
      JSON.stringify(payload)
    )
    
    res.json({ token })
    
  } catch (error: any) {
    console.error('Token error:', error)
    res.status(500).json({ error: 'Failed to generate token' })
  }
})

app.post('/api/callbacks', (req: Request, res: Response): void => {
  console.log('Callback received:', req.body.Event)
  res.status(200).json({ success: true })
})

app.get('/health', (_req: Request, res: Response): void => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    registered: !!REGISTERED_AGENT_ID,
    config: {
      appId: !!CONFIG.ZEGO_APP_ID,
      serverSecret: !!CONFIG.ZEGO_SERVER_SECRET,
      dashscope: !!CONFIG.DASHSCOPE_API_KEY
    }
  })
})

app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(CONFIG.PORT, () => {
  console.log(`Server running on port ${CONFIG.PORT}`)
}) 