import { useState, useCallback, useRef } from 'react'
import type { Message, ChatSession, ConversationMemory, VoiceSettings } from '../types'
import { ZegoService } from '../services/zego'
import { agentAPI } from '../services/api'
import { memoryService } from '../services/memory'
import { voiceService } from '../services/voice'

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [session, setSession] = useState<ChatSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [conversation, setConversation] = useState<ConversationMemory | null>(null)
  
  const zegoService = useRef(ZegoService.getInstance())

  const defaultVoiceSettings: VoiceSettings = {
    isEnabled: true,
    autoPlay: true,
    speechRate: 1.0,
    speechPitch: 1.0,
  }

  const initializeConversation = useCallback((conversationId?: string) => {
    const conv = memoryService.createOrGetConversation(conversationId)
    setConversation(conv)
    setMessages(conv.messages)
    return conv
  }, [])

  const startSession = useCallback(async (existingConversationId?: string): Promise<boolean> => {
    setIsLoading(true)
    try {
      const roomId = `room_${Math.random().toString(36).substr(2, 9)}`
      const userId = `user_${Math.random().toString(36).substr(2, 9)}`

      await zegoService.current.initialize()
      const joinResult = await zegoService.current.joinRoom(roomId, userId)
      
      if (!joinResult) throw new Error('Failed to join room')

      const { agentInstanceId } = await agentAPI.startSession(roomId, userId)
      
      const conv = initializeConversation(existingConversationId)
      
      const newSession: ChatSession = {
        roomId,
        userId,
        agentInstanceId,
        isActive: true,
        conversationId: conv.id,
        voiceSettings: defaultVoiceSettings
      }
      
      setSession(newSession)
      setIsConnected(true)
      setupMessageHandlers()
      
      return true
    } catch (error) {
      console.error('Failed to start session:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [initializeConversation])

  const setupMessageHandlers = useCallback(() => {
    zegoService.current.onRoomMessage((data: any) => {
      if (data.Cmd === 4 && conversation) {
        const messageId = data.Data.MessageId
        const content = data.Data.Text
        const isComplete = data.Data.EndFlag

        setMessages(prev => {
          const existing = prev.find(m => m.id === messageId)
          
          if (existing) {
            return prev.map(m => 
              m.id === messageId 
                ? { ...m, content, isStreaming: !isComplete }
                : m
            )
          } else {
            const aiMessage: Message = {
              id: messageId,
              content,
              sender: 'ai',
              timestamp: Date.now(),
              type: 'text',
              isStreaming: !isComplete
            }
            return [...prev, aiMessage]
          }
        })

        if (isComplete && session?.voiceSettings.autoPlay) {
          const finalMessage: Message = {
            id: messageId,
            content,
            sender: 'ai',
            timestamp: Date.now(),
            type: 'text'
          }
          
          memoryService.addMessage(conversation.id, finalMessage)
          voiceService.speak(content, session.voiceSettings)
        }
      }
    })
  }, [conversation, session])

  const sendTextMessage = useCallback(async (content: string) => {
    if (!session?.agentInstanceId || !conversation) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      content,
      sender: 'user',
      timestamp: Date.now(),
      type: 'text'
    }
    
    setMessages(prev => [...prev, userMessage])
    memoryService.addMessage(conversation.id, userMessage)
    
    try {
      await agentAPI.sendMessage(session.agentInstanceId, content)
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }, [session, conversation])

  const startVoiceRecording = useCallback(async () => {
    const success = await voiceService.startRecording(
      (transcript, isFinal) => {
        setCurrentTranscript(transcript)
        if (isFinal && transcript.trim()) {
          sendTextMessage(transcript)
          setCurrentTranscript('')
        }
      },
      (error) => {
        console.error('Voice recording error:', error)
        setIsRecording(false)
      }
    )

    if (success) {
      setIsRecording(true)
    }
  }, [sendTextMessage])

  const stopVoiceRecording = useCallback(async () => {
    await voiceService.stopRecording()
    setIsRecording(false)
    setCurrentTranscript('')
  }, [])

  const toggleVoiceRecording = useCallback(async () => {
    if (isRecording) {
      await stopVoiceRecording()
    } else {
      await startVoiceRecording()
    }
  }, [isRecording, startVoiceRecording, stopVoiceRecording])

  const toggleVoiceSettings = useCallback(() => {
    if (session) {
      setSession({
        ...session,
        voiceSettings: {
          ...session.voiceSettings,
          isEnabled: !session.voiceSettings.isEnabled
        }
      })
    }
  }, [session])

  const endSession = useCallback(async () => {
    if (!session) return
    
    try {
      if (isRecording) {
        await stopVoiceRecording()
      }
      
      if (session.agentInstanceId) {
        await agentAPI.stopSession(session.agentInstanceId)
      }
      await zegoService.current.leaveRoom()
      
      setSession(null)
      setIsConnected(false)
    } catch (error) {
      console.error('Failed to end session:', error)
    }
  }, [session, isRecording, stopVoiceRecording])

  return {
    messages,
    session,
    conversation,
    isLoading,
    isConnected,
    isRecording,
    currentTranscript,
    startSession,
    sendTextMessage,
    toggleVoiceRecording,
    toggleVoiceSettings,
    endSession,
    initializeConversation
  }
}