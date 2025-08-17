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
}

export const ChatContainer = ({ conversationId, onConversationUpdate }: ChatContainerProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { 
    messages, 
    isLoading, 
    isConnected, 
    isRecording,
    currentTranscript,
    session,
    startSession, 
    sendTextMessage, 
    toggleVoiceRecording,
    toggleVoiceSettings,
    endSession 
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

  const handleStartChat = async () => {
    const success = await startSession(conversationId)
    if (success) {
      setTimeout(() => {
        sendTextMessage("Hello! I'd like to start chatting with you.")
      }, 1000)
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full bg-gray-50"
    >
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
              <p className="text-sm text-gray-500">
                {isConnected ? 'Connected and ready to chat' : 'Ready to start conversation'}
              </p>
            </div>
          </div>
          
          {isConnected ? (
            <Button onClick={endSession} variant="secondary" size="sm">
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
        {messages.length === 0 && !isConnected && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full text-center"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Welcome to AI Assistant</h3>
            <p className="text-gray-600 mb-6 max-w-md">
              Start a conversation with our AI assistant. You can type messages or use voice input for a more natural experience.
            </p>
            <Button onClick={handleStartChat} isLoading={isLoading}>
              <Phone className="w-4 h-4 mr-2" />
              Start New Conversation
            </Button>
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
        />
      )}
    </motion.div>
  )
}