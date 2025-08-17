import { motion } from 'framer-motion'
import type { Message } from '../../types'
import { Volume2, User, Bot, Clock } from 'lucide-react'

interface MessageBubbleProps {
  message: Message
  onPlayVoice?: (messageId: string) => void
  showTimestamp?: boolean
}

export const MessageBubble = ({ message, onPlayVoice, showTimestamp = false }: MessageBubbleProps) => {
  const isUser = message.sender === 'user'
  const isVoice = message.type === 'voice'
  
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6 group`}
    >
      <div className={`flex items-end space-x-3 max-w-lg ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
        <motion.div 
          whileHover={{ scale: 1.05 }}
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-md ${
            isUser 
              ? 'bg-gradient-to-br from-blue-500 to-blue-600' 
              : 'bg-gradient-to-br from-gray-700 to-gray-800'
          }`}
        >
          {isUser ? (
            <User className="w-5 h-5 text-white" />
          ) : (
            <Bot className="w-5 h-5 text-white" />
          )}
        </motion.div>
        
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          <motion.div
            className={`px-5 py-3 rounded-2xl shadow-sm ${
              isUser 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-900 border border-gray-200'
            } ${message.isStreaming ? 'animate-pulse' : ''} ${
              isVoice ? 'border-2 border-dashed border-purple-300' : ''
            }`}
            layout
            whileHover={{ scale: 1.02 }}
          >
            {isVoice && (
              <div className={`flex items-center space-x-2 mb-2 ${
                isUser ? 'text-blue-200' : 'text-purple-600'
              }`}>
                <Volume2 className="w-4 h-4" />
                <span className="text-xs font-medium">Voice Message</span>
                {message.duration && (
                  <span className="text-xs opacity-75">{message.duration}s</span>
                )}
              </div>
            )}
            
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {isVoice ? message.transcript || message.content : message.content}
            </p>
            
            {isVoice && message.audioUrl && (
              <button 
                onClick={() => onPlayVoice?.(message.id)}
                className={`mt-3 flex items-center space-x-2 text-xs transition-opacity duration-200 hover:opacity-100 ${
                  isUser ? 'text-blue-200 opacity-75' : 'text-purple-600 opacity-75'
                }`}
              >
                <Volume2 className="w-3 h-3" />
                <span>Play Audio</span>
              </button>
            )}
          </motion.div>
          
          {showTimestamp && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-center space-x-1 mt-1 text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Clock className="w-3 h-3" />
              <span>{formatTime(message.timestamp)}</span>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  )
}