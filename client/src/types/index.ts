export interface Message {
  id: string
  content: string
  sender: 'user' | 'ai'
  timestamp: number
  type: 'text' | 'voice'
  isStreaming?: boolean
  audioUrl?: string
  duration?: number
  transcript?: string
}

export interface ConversationMemory {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  metadata: {
    totalMessages: number
    lastAIResponse: string
    topics: string[]
  }
}

export interface VoiceSettings {
  isEnabled: boolean
  autoPlay: boolean
  speechRate: number
  speechPitch: number
  preferredVoice?: string
}

export interface ChatSession {
  roomId: string
  userId: string
  agentInstanceId?: string
  isActive: boolean
  conversationId?: string
  voiceSettings: VoiceSettings
}

export interface AIAgent {
  id: string
  name: string
  personality: string
  voiceCharacteristics: {
    language: 'en-US' | 'en-GB'
    gender: 'male' | 'female'
    speed: number
    pitch: number
  }
}