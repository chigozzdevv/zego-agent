import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageBubble } from './MessageBubble'
import { VoiceMessageInput } from '../Voice/VoiceMessageInput'
import { Button } from '../UI/Button'
import { useChat } from '../../hooks/useChat'
import { Phone, PhoneOff, Bot } from 'lucide-react'

interface ChatContainerProps {
  conversationId?: string
  onConversationUpdate?: () => void
  onNewConversation?: () => void
}

export const ChatContainer = ({ conversationId, onConversationUpdate, onNewConversation }: ChatContainerProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { 
    messages, 
    isLoading, 
    isConnected, 
    isRecording,
    currentTranscript,
    agentStatus,
    session,
    conversation,
    startSession, 
    sendTextMessage, 
    toggleVoiceRecording,
    toggleVoiceSettings,
    endSession,
    resetConversation,
    initializeConversation
  } = useChat()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (onConversationUpdate) {
      onConversationUpdate()
    }
  }, [messages, onConversationUpdate])

  useEffect(() => {
    if (conversationId && conversationId !== conversation?.id) {
      initializeConversation(conversationId)
    } else if (!conversationId && conversation) {
      resetConversation()
    }
  }, [conversationId, conversation?.id, initializeConversation, resetConversation])

  const handleStartChat = async () => {
    const success = await startSession(conversationId)
    if (success && onNewConversation && !conversationId) {
      onNewConversation()
    }
  }

  const handleEndChat = async () => {
    await endSession()
    if (onNewConversation) {
      onNewConversation()
    }
  }

  const getStatusText = () => {
    if (!isConnected) return 'Click Start Chat to begin'
    
    switch (agentStatus) {
      case 'listening':
        return 'Listening for your voice...'
      case 'thinking':
        return 'AI is processing your message...'
      case 'speaking':
        return 'AI is responding...'
      default:
        return 'Connected - Ready to chat'
    }
  }

  const getStatusColor = () => {
    if (!isConnected) return 'text-gray-500'
    
    switch (agentStatus) {
      case 'listening':
        return 'text-green-600'
      case 'thinking':
        return 'text-blue-600'
      case 'speaking':
        return 'text-purple-600'
      default:
        return 'text-green-600'
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full bg-gray-50"
    >
      <audio 
        id="ai-audio-output" 
        autoPlay 
        style={{ display: 'none' }}
        controls={false}
        playsInline
      />

      <motion.div 
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        className="bg-white border-b border-gray-200 px-6 py-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">AI Assistant</h1>
              <p className={`text-sm ${getStatusColor()}`}>
                {getStatusText()}
              </p>
            </div>
          </div>
          
          {isConnected ? (
            <Button onClick={handleEndChat} variant="secondary" size="sm" disabled={isLoading}>
              <PhoneOff className="w-4 h-4 mr-2" />
              End Chat
            </Button>
          ) : (
            <Button onClick={handleStartChat} isLoading={isLoading} size="sm">
              <Phone className="w-4 h-4 mr-2" />
              Start Chat
            </Button>
          )}
        </div>
      </motion.div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full text-center"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {isConnected ? 'Ready to Chat' : 'Welcome to AI Assistant'}
            </h3>
            <p className="text-gray-600 mb-6 max-w-md">
              {isConnected 
                ? 'You can type messages or use voice input to start chatting with the AI assistant.'
                : 'Start a conversation with our AI assistant. You can type messages or use voice input for a more natural experience.'
              }
            </p>
            {!isConnected && (
              <div className="space-y-2 text-sm text-gray-500 mb-6">
                <p>🎤 Voice conversations with real-time responses</p>
                <p>💬 Natural interruption support</p>
                <p>🧠 Context-aware conversations</p>
              </div>
            )}
            {!isConnected && (
              <Button onClick={handleStartChat} isLoading={isLoading}>
                <Phone className="w-4 h-4 mr-2" />
                Start New Conversation
              </Button>
            )}
          </motion.div>
        )}

        <AnimatePresence mode="popLayout">
          {messages.map((message) => (
            <MessageBubble 
              key={message.id} 
              message={message} 
              showTimestamp={true}
            />
          ))}
        </AnimatePresence>
        
        {agentStatus === 'thinking' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex justify-start mb-6"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-800 rounded-full flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl px-5 py-3">
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                  <span className="text-sm text-gray-500">AI is thinking...</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {isConnected && (
        <VoiceMessageInput 
          onSendMessage={sendTextMessage}
          isRecording={isRecording}
          onToggleRecording={toggleVoiceRecording}
          currentTranscript={currentTranscript}
          isConnected={isConnected}
          voiceEnabled={session?.voiceSettings.isEnabled || false}
          onToggleVoice={toggleVoiceSettings}
          agentStatus={agentStatus}
        />
      )}
    </motion.div>
  )
}