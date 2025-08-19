import { useCallback, useRef, useEffect, useReducer } from 'react'
import type { Message, ChatSession, ConversationMemory, VoiceSettings } from '../types'
import { ZegoService } from '../services/zego'
import { agentAPI } from '../services/api'
import { memoryService } from '../services/memory'

interface ChatState {
  messages: Message[]
  session: ChatSession | null
  conversation: ConversationMemory | null
  isLoading: boolean
  isConnected: boolean
  isRecording: boolean
  currentTranscript: string
  agentStatus: 'idle' | 'listening' | 'thinking' | 'speaking'
  error: string | null
}

type ChatAction = 
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<Message> } }
  | { type: 'SET_SESSION'; payload: ChatSession | null }
  | { type: 'SET_CONVERSATION'; payload: ConversationMemory | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_RECORDING'; payload: boolean }
  | { type: 'SET_TRANSCRIPT'; payload: string }
  | { type: 'SET_AGENT_STATUS'; payload: 'idle' | 'listening' | 'thinking' | 'speaking' }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_CHAT' }

const initialState: ChatState = {
  messages: [],
  session: null,
  conversation: null,
  isLoading: false,
  isConnected: false,
  isRecording: false,
  currentTranscript: '',
  agentStatus: 'idle',
  error: null
}

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload }
    
    case 'ADD_MESSAGE':
      const exists = state.messages.some(m => m.id === action.payload.id)
      if (exists) {
        return {
          ...state,
          messages: state.messages.map(m => 
            m.id === action.payload.id ? action.payload : m
          )
        }
      }
      return { ...state, messages: [...state.messages, action.payload] }
    
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(m => 
          m.id === action.payload.id ? { ...m, ...action.payload.updates } : m
        )
      }
    
    case 'SET_SESSION':
      return { ...state, session: action.payload }
    
    case 'SET_CONVERSATION':
      return { ...state, conversation: action.payload }
    
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    
    case 'SET_CONNECTED':
      return { ...state, isConnected: action.payload }
    
    case 'SET_RECORDING':
      return { ...state, isRecording: action.payload }
    
    case 'SET_TRANSCRIPT':
      return { ...state, currentTranscript: action.payload }
    
    case 'SET_AGENT_STATUS':
      return { ...state, agentStatus: action.payload }
    
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    
    case 'RESET_CHAT':
      return {
        ...initialState,
        isLoading: state.isLoading
      }
    
    default:
      return state
  }
}

export const useChat = () => {
  const [state, dispatch] = useReducer(chatReducer, initialState)
  
  const zegoService = useRef(ZegoService.getInstance())
  const processedMessageIds = useRef(new Set<string>())
  const messageHandlerSetup = useRef(false)
  const cleanupFunctions = useRef<(() => void)[]>([])
  const currentConversationRef = useRef<string | null>(null)
  const streamingMessages = useRef(new Map<string, string>())

  const defaultVoiceSettings: VoiceSettings = {
    isEnabled: true,
    autoPlay: true,
    speechRate: 1.0,
    speechPitch: 1.0,
  }

  const cleanup = useCallback(() => {
    cleanupFunctions.current.forEach(fn => fn())
    cleanupFunctions.current = []
    processedMessageIds.current.clear()
    messageHandlerSetup.current = false
    streamingMessages.current.clear()
  }, [])

  const addMessageSafely = useCallback((message: Message, conversationId: string) => {
    if (processedMessageIds.current.has(message.id)) {
      console.log('Skipping duplicate message:', message.id)
      return
    }

    processedMessageIds.current.add(message.id)
    dispatch({ type: 'ADD_MESSAGE', payload: message })
    
    try {
      memoryService.addMessage(conversationId, message)
    } catch (error) {
      console.error('Failed to save message to memory:', error)
    }
  }, [])

  const initializeConversation = useCallback((conversationId?: string) => {
    try {
      const conv = memoryService.createOrGetConversation(conversationId)
      dispatch({ type: 'SET_CONVERSATION', payload: conv })
      dispatch({ type: 'SET_MESSAGES', payload: [...conv.messages] })
      processedMessageIds.current.clear()
      streamingMessages.current.clear()
      
      conv.messages.forEach(msg => {
        processedMessageIds.current.add(msg.id)
      })
      
      dispatch({ type: 'SET_ERROR', payload: null })
      currentConversationRef.current = conv.id
      return conv
    } catch (error) {
      console.error('Failed to initialize conversation:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load conversation' })
      return null
    }
  }, [])

  const resetConversation = useCallback(() => {
    cleanup()
    dispatch({ type: 'RESET_CHAT' })
    currentConversationRef.current = null
  }, [cleanup])

  const setupMessageHandlers = useCallback((conv: ConversationMemory) => {
    if (messageHandlerSetup.current) {
      console.log('Message handlers already setup')
      return
    }

    console.log('Setting up message handlers for conversation:', conv.id)
    messageHandlerSetup.current = true

    const handleRoomMessage = (data: any) => {
      try {
        const { Cmd, Data: msgData } = data
        console.log('Room message received:', { Cmd, msgData })
        
        if (currentConversationRef.current !== conv.id) {
          console.log('Ignoring message for different conversation')
          return
        }
        
        if (Cmd === 3) {
          const { Text: transcript, EndFlag, MessageId } = msgData
          
          if (transcript && transcript.trim()) {
            dispatch({ type: 'SET_TRANSCRIPT', payload: transcript })
            dispatch({ type: 'SET_AGENT_STATUS', payload: 'listening' })
            
            if (EndFlag) {
              const messageId = MessageId || `voice_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
              
              const userMessage: Message = {
                id: messageId,
                content: transcript.trim(),
                sender: 'user',
                timestamp: Date.now(),
                type: 'voice',
                transcript: transcript.trim()
              }
              
              addMessageSafely(userMessage, conv.id)
              dispatch({ type: 'SET_TRANSCRIPT', payload: '' })
              dispatch({ type: 'SET_AGENT_STATUS', payload: 'thinking' })
            }
          }
        } else if (Cmd === 4) {
          const { Text: content, MessageId, EndFlag } = msgData
          if (!content || !MessageId) return

          if (EndFlag) {
            const currentStreaming = streamingMessages.current.get(MessageId) || ''
            const finalContent = currentStreaming + content
            
            dispatch({ type: 'UPDATE_MESSAGE', payload: {
              id: MessageId,
              updates: { 
                content: finalContent, 
                isStreaming: false 
              }
            }})
            
            streamingMessages.current.delete(MessageId)
            dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
            
            try {
              const finalMessage: Message = {
                id: MessageId,
                content: finalContent,
                sender: 'ai',
                timestamp: Date.now(),
                type: 'text'
              }
              memoryService.addMessage(conv.id, finalMessage)
            } catch (error) {
              console.error('Failed to save final message to memory:', error)
            }
          } else {
            const currentStreaming = streamingMessages.current.get(MessageId) || ''
            const updatedContent = currentStreaming + content
            streamingMessages.current.set(MessageId, updatedContent)
            
            if (!processedMessageIds.current.has(MessageId)) {
              const streamingMessage: Message = {
                id: MessageId,
                content: updatedContent,
                sender: 'ai',
                timestamp: Date.now(),
                type: 'text',
                isStreaming: true
              }
              
              processedMessageIds.current.add(MessageId)
              dispatch({ type: 'ADD_MESSAGE', payload: streamingMessage })
            } else {
              dispatch({ type: 'UPDATE_MESSAGE', payload: {
                id: MessageId,
                updates: { content: updatedContent, isStreaming: true }
              }})
            }
            
            dispatch({ type: 'SET_AGENT_STATUS', payload: 'speaking' })
          }
        }
      } catch (error) {
        console.error('Error handling room message:', error)
        dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
      }
    }

    zegoService.current.onRoomMessage(handleRoomMessage)
    
    cleanupFunctions.current.push(() => {
      zegoService.current.onRoomMessage(() => {})
    })
  }, [addMessageSafely])

  const startSession = useCallback(async (existingConversationId?: string): Promise<boolean> => {
    if (state.isLoading || state.isConnected) {
      console.log('Session start blocked - already loading or connected')
      return false
    }
    
    dispatch({ type: 'SET_LOADING', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })
    
    try {
      if (state.session?.isActive) {
        console.log('Ending existing session before starting new one')
        await endSession()
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      console.log('Initializing ZEGO service...')
      await zegoService.current.initialize()
      
      console.log('Joining room:', roomId)
      const joinResult = await zegoService.current.joinRoom(roomId, userId)
      if (!joinResult) throw new Error('Failed to join ZEGO room')

      console.log('Starting AI agent session...')
      const result = await agentAPI.startSession(roomId, userId)
      
      const conv = initializeConversation(existingConversationId)
      if (!conv) throw new Error('Failed to initialize conversation')
      
      const newSession: ChatSession = {
        roomId,
        userId,
        agentInstanceId: result.agentInstanceId,
        isActive: true,
        conversationId: conv.id,
        voiceSettings: defaultVoiceSettings
      }
      
      dispatch({ type: 'SET_SESSION', payload: newSession })
      dispatch({ type: 'SET_CONNECTED', payload: true })
      
      setupMessageHandlers(conv)
      
      console.log('Session started successfully')
      return true
    } catch (error) {
      console.error('Failed to start session:', error)
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to start session' })
      return false
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [state.isLoading, state.isConnected, state.session, initializeConversation, setupMessageHandlers])

  const sendTextMessage = useCallback(async (content: string) => {
    if (!state.session?.agentInstanceId || !state.conversation) {
      dispatch({ type: 'SET_ERROR', payload: 'No active session' })
      return
    }

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
      
      addMessageSafely(userMessage, state.conversation.id)
      dispatch({ type: 'SET_AGENT_STATUS', payload: 'thinking' })
      
      await agentAPI.sendMessage(state.session.agentInstanceId, trimmedContent)
      
    } catch (error) {
      console.error('Failed to send message:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to send message' })
      dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
    }
  }, [state.session, state.conversation, addMessageSafely])

  const toggleVoiceRecording = useCallback(async () => {
    if (!state.isConnected) return
    
    try {
      if (state.isRecording) {
        await zegoService.current.enableMicrophone(false)
        dispatch({ type: 'SET_RECORDING', payload: false })
        dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
      } else {
        const success = await zegoService.current.enableMicrophone(true)
        if (success) {
          dispatch({ type: 'SET_RECORDING', payload: true })
          dispatch({ type: 'SET_AGENT_STATUS', payload: 'listening' })
        }
      }
    } catch (error) {
      console.error('Failed to toggle recording:', error)
      dispatch({ type: 'SET_RECORDING', payload: false })
      dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
    }
  }, [state.isConnected, state.isRecording])

  const toggleVoiceSettings = useCallback(() => {
    if (state.session) {
      const updatedSession = {
        ...state.session,
        voiceSettings: {
          ...state.session.voiceSettings,
          isEnabled: !state.session.voiceSettings.isEnabled
        }
      }
      dispatch({ type: 'SET_SESSION', payload: updatedSession })
    }
  }, [state.session])

  const endSession = useCallback(async () => {
    if (!state.session && !state.isConnected) return
    
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      
      if (state.isRecording) {
        await zegoService.current.enableMicrophone(false)
        dispatch({ type: 'SET_RECORDING', payload: false })
      }
      
      if (state.session?.agentInstanceId) {
        await agentAPI.stopSession(state.session.agentInstanceId)
      }
      
      await zegoService.current.leaveRoom()
      
      cleanup()
      dispatch({ type: 'SET_SESSION', payload: null })
      dispatch({ type: 'SET_CONNECTED', payload: false })
      dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
      dispatch({ type: 'SET_TRANSCRIPT', payload: '' })
      dispatch({ type: 'SET_ERROR', payload: null })
      currentConversationRef.current = null
      
      console.log('Session ended successfully')
    } catch (error) {
      console.error('Failed to end session:', error)
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [state.session, state.isConnected, state.isRecording, cleanup])

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null })
  }, [])

  useEffect(() => {
    const handleConversationChange = async () => {
      if (currentConversationRef.current === (state.conversation?.id || null)) {
        return
      }

      if (state.isConnected) {
        await endSession()
        if (state.conversation?.id) {
          await startSession(state.conversation.id)
        } else {
          resetConversation()
        }
      }
    }

    handleConversationChange()
  }, [state.conversation?.id])

  useEffect(() => {
    return () => {
      if (state.session?.isActive || state.isConnected) {
        endSession()
      }
      cleanup()
    }
  }, [])

  return {
    ...state,
    startSession,
    sendTextMessage,
    toggleVoiceRecording,
    toggleVoiceSettings,
    endSession,
    initializeConversation,
    resetConversation,
    clearError
  }
}