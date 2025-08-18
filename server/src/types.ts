export interface Config {
  ZEGO_APP_ID: string
  ZEGO_SERVER_SECRET: string
  ZEGO_API_BASE_URL: string
  DASHSCOPE_API_KEY: string
  PORT: number
  PROXY_AUTH: string
  NODE_ENV: string
  SERVER_URL: string
}

export interface ZegoSignatureParams {
  [key: string]: string | number
}

export interface ZegoSignature extends ZegoSignatureParams {
  AppId: string
  SignatureNonce: string
  Timestamp: number
  SignatureVersion: string
  Signature: string
}

export interface ZegoResponse {
  Code: number
  Message: string
  RequestId: string
  Data?: any
}

export interface LLMConfig {
  Url: string
  ApiKey: string
  Model: string
  SystemPrompt: string
  Temperature: number
  TopP: number
  Params: { max_tokens: number }
}

export interface TTSConfig {
  Vendor: string
  Url: string
  Params: {
    app: { api_key: string }
    voice: string
    encoding: string
  }
}

export interface ASRConfig {
  HotWord: string
  VADSilenceSegmentation: number
  PauseInterval: number
}

export interface AgentConfig {
  AgentId: string
  Name: string
  LLM: LLMConfig
  TTS: TTSConfig
  ASR: ASRConfig
}

export interface InstanceConfig {
  AgentId: string
  UserId: string
  RTC: { RoomId: string; StreamId: string }
  MessageHistory: { SyncMode: number; Messages: any[]; WindowSize: number }
  CallbackConfig: {
    ASRResult: number
    LLMResult: number
    Exception: number
    Interrupted: number
    UserSpeakAction: number
    AgentSpeakAction: number
  }
  AdvancedConfig: { InterruptMode: number }
}

export interface StartSessionRequest { room_id: string; user_id: string }
export interface SendMessageRequest { agent_instance_id: string; message: string }
export interface StopSessionRequest { agent_instance_id: string }

export interface TTSRequest { text: string; voice?: string; encoding?: string }

export interface CallbackData {
  Event: string
  Data: any
  AppId?: number
  AgentInstanceId?: string
  AgentUserId?: string
  RoomId?: string
  Sequence?: number
  Timestamp?: number
}

export interface TokenResponse { token: string }