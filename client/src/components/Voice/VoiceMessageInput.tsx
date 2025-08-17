import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { Button } from '../UI/Button'

interface VoiceMessageInputProps {
  onSendMessage: (content: string) => void
  isRecording: boolean
  onToggleRecording: () => void
  currentTranscript: string
  isConnected: boolean
  voiceEnabled: boolean
  onToggleVoice: () => void
}

export const VoiceMessageInput = ({ 
  onSendMessage, 
  isRecording, 
  onToggleRecording,
  currentTranscript,
  isConnected,
  voiceEnabled,
  onToggleVoice
}: VoiceMessageInputProps) => {
  const [message, setMessage] = useState('')
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    const textarea = document.getElementById('message-input') as HTMLTextAreaElement
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
    }
  }, [message])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || !isConnected) return
    
    onSendMessage(message.trim())
    setMessage('')
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  return (
    <motion.div 
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-white border-t border-gray-200 p-4"
    >
      <AnimatePresence>
        {(isRecording || currentTranscript) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200"
          >
            <div className="flex items-center space-x-2">
              <motion.div
                animate={isRecording ? { scale: [1, 1.2, 1] } : {}}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="flex-shrink-0"
              >
                <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500' : 'bg-blue-500'}`} />
              </motion.div>
              <p className="text-sm text-blue-700 flex-1">
                {currentTranscript || (isRecording ? 'Listening...' : 'Processing speech...')}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="flex items-end space-x-3">
        <div className="flex-1 min-w-0">
          <div className={`relative rounded-xl border-2 transition-colors duration-200 ${
            isFocused ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'
          }`}>
            <textarea
              id="message-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={isRecording ? "Recording..." : "Type your message or use voice..."}
              disabled={!isConnected || isRecording}
              rows={1}
              className="w-full px-4 py-3 bg-transparent border-none focus:outline-none resize-none placeholder-gray-500"
              style={{ maxHeight: '120px' }}
            />
            
            {message.length > 800 && (
              <div className="absolute bottom-2 right-2 text-xs text-gray-400">
                {message.length}/1000
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onToggleVoice}
            className="text-gray-600 hover:text-gray-900"
            title={voiceEnabled ? "Disable voice" : "Enable voice"}
          >
            {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onToggleRecording}
            disabled={!isConnected}
            className={`transition-all duration-200 ${
              isRecording 
                ? 'bg-red-500 text-white hover:bg-red-600 shadow-lg' 
                : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
            }`}
          >
            <motion.div
              animate={isRecording ? { scale: [1, 1.1, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </motion.div>
          </Button>
        </div>

        <Button
          type="submit"
          disabled={!message.trim() || !isConnected || isRecording}
          size="md"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </motion.div>
  )
}