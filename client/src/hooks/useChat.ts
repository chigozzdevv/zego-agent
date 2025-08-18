import { useState, useCallback, useRef, useEffect } from 'react'
import type { Message, ChatSession, ConversationMemory, VoiceSettings } from '../types'
import { ZegoService } from '../services/zego'
import { agentAPI } from '../services/api'
import { memoryService } from '../services/memory'

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [session, setSession] = useState<ChatSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [conversation, setConversation] = useState<ConversationMemory | null>(null)
  const [agentStatus, setAgentStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle')
  
  const zegoService = useRef(ZegoService.getInstance())
  const processedMessageIds = useRef(new Set<string>())

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
    processedMessageIds.current.clear()
    return conv
  }, [])

  const resetConversation = useCallback(() => {
    setMessages([])
    setConversation(null)
    setCurrentTranscript('')
    setAgentStatus('idle')
    processedMessageIds.current.clear()
  }, [])

  const startSession = useCallback(async (existingConversationId?: string): Promise<boolean> => {
    setIsLoading(true)
    try {
      if (session?.isActive) {
        await endSession()
      }

      const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      await zegoService.current.initialize()
      const joinResult = await zegoService.current.joinRoom(roomId, userId)
      
      if (!joinResult) throw new Error('Failed to join room')

      const result = await agentAPI.startSession(roomId, userId)
      console.log('🎯 Session started:', result)
      
      const conv = initializeConversation(existingConversationId)
      
      const newSession: ChatSession = {
        roomId,
        userId,
        agentInstanceId: result.agentInstanceId,
        isActive: true,
        conversationId: conv.id,
        voiceSettings: defaultVoiceSettings
      }
      
      setSession(newSession)
      setIsConnected(true)
      setupMessageHandlers(conv)
      
      return true
    } catch (error) {
      console.error('Failed to start session:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [initializeConversation])

  const setupMessageHandlers = useCallback((conv: ConversationMemory) => {
    zegoService.current.onRoomMessage((data: any) => {
      const { Cmd, Data: msgData } = data
      console.log('🎯 Room message received:', { Cmd, Data: msgData })
      
      if (Cmd === 3) {
        // ASR Result - Display only, don't send to API
        const { Text: transcript, EndFlag, MessageId } = msgData
        
        if (transcript) {
          setCurrentTranscript(transcript)
          setAgentStatus('listening')
          
          // When user finishes speaking, just save the message for display
          if (EndFlag && transcript.trim()) {
            const messageId = MessageId || `voice_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
            
            if (!processedMessageIds.current.has(messageId)) {
              processedMessageIds.current.add(messageId)
              
              const userMessage: Message = {
                id: messageId,
                content: transcript.trim(),
                sender: 'user',
                timestamp: Date.now(),
                type: 'voice',
                transcript: transcript.trim()
              }
              
              setMessages(prev => {
                const exists = prev.some(m => m.id === messageId)
                if (exists) return prev
                return [...prev, userMessage]
              })
              
              memoryService.addMessage(conv.id, userMessage)
              setCurrentTranscript('')
              setAgentStatus('thinking')
            }
          }
        }
      } else if (Cmd === 4) {
        // LLM Result - AI response
        const { Text: content, MessageId, EndFlag } = msgData
        if (!content || !MessageId) return

        setMessages(prev => {
          const existing = prev.find(m => m.id === MessageId)
          
          if (existing) {
            return prev.map(m => 
              m.id === MessageId 
                ? { ...m, content, isStreaming: !EndFlag }
                : m
            )
          } else {
            const aiMessage: Message = {
              id: MessageId,
              content,
              sender: 'ai',
              timestamp: Date.now(),
              type: 'text',
              isStreaming: !EndFlag
            }
            return [...prev, aiMessage]
          }
        })

        if (EndFlag) {
          setAgentStatus('idle')
          const finalMessage: Message = {
            id: MessageId,
            content,
            sender: 'ai',
            timestamp: Date.now(),
            type: 'text'
          }
          memoryService.addMessage(conv.id, finalMessage)
        } else {
          setAgentStatus('speaking')
        }
      }
    })
  }, [])

  // Text messages still use the API
  const sendTextMessage = useCallback(async (content: string) => {
    if (!session?.agentInstanceId || !conversation) return

    const trimmedContent = content.trim()
    if (!trimmedContent) return
    
    try {
      const messageId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      
      const userMessage: Message = {
        id: messageId,
        content: trimmedContent,
        sender: 'user',
        timestamp: Date.now(),
        type: 'text'
      }
      
      setMessages(prev => [...prev, userMessage])
      memoryService.addMessage(conversation.id, userMessage)
      setAgentStatus('thinking')
      
      console.log('📤 Sending text message via API')
      await agentAPI.sendMessage(session.agentInstanceId, trimmedContent)
    } catch (error) {
      console.error('Failed to send message:', error)
      setAgentStatus('idle')
    }
  }, [session, conversation])

  // Voice recording just enables/disables microphone - no API calls
  const toggleVoiceRecording = useCallback(async () => {
    if (!isConnected) return
    
    try {
      if (isRecording) {
        console.log('🎤 Stopping voice recording')
        await zegoService.current.enableMicrophone(false)
        setIsRecording(false)
        setAgentStatus('idle')
      } else {
        console.log('🎤 Starting voice recording')
        const success = await zegoService.current.enableMicrophone(true)
        if (success) {
          setIsRecording(true)
          setAgentStatus('listening')
        }
      }
    } catch (error) {
      console.error('Failed to toggle recording:', error)
      setIsRecording(false)
      setAgentStatus('idle')
    }
  }, [isRecording, isConnected])

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
        await zegoService.current.enableMicrophone(false)
        setIsRecording(false)
      }
      
      if (session.agentInstanceId) {
        await agentAPI.stopSession(session.agentInstanceId)
      }
      
      await zegoService.current.leaveRoom()
      
      setSession(null)
      setIsConnected(false)
      setAgentStatus('idle')
      setCurrentTranscript('')
    } catch (error) {
      console.error('Failed to end session:', error)
    }
  }, [session, isRecording])

  useEffect(() => {
    return () => {
      if (session?.isActive) {
        endSession()
      }
    }
  }, [])

  return {
    messages,
    session,
    conversation,
    isLoading,
    isConnected,
    isRecording,
    currentTranscript,
    agentStatus,
    startSession,
    sendTextMessage,
    toggleVoiceRecording,
    toggleVoiceSettings,
    endSession,
    initializeConversation,
    resetConversation
  }
}