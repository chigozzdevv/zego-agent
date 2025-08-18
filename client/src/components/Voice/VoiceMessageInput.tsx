import { useState, useEffect, useRef } from 'react'
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
  agentStatus?: 'idle' | 'listening' | 'thinking' | 'speaking'
}

export const VoiceMessageInput = ({ 
  onSendMessage, 
  isRecording, 
  onToggleRecording,
  currentTranscript,
  isConnected,
  voiceEnabled,
  onToggleVoice,
  agentStatus = 'idle'
}: VoiceMessageInputProps) => {
  const [message, setMessage] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [message])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedMessage = message.trim()
    if (!trimmedMessage || !isConnected || isSending) return
    
    setIsSending(true)
    try {
      await onSendMessage(trimmedMessage)
      setMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isSending) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  const isDisabled = !isConnected || agentStatus === 'thinking' || agentStatus === 'speaking'
  const isVoiceDisabled = isDisabled || !voiceEnabled

  const getPlaceholderText = () => {
    if (!isConnected) return "Connect to start chatting..."
    if (agentStatus === 'thinking') return "AI is processing..."
    if (agentStatus === 'speaking') return "AI is responding..."
    if (isRecording) return "Recording... speak now"
    return "Type your message or use voice..."
  }

  const getRecordingButtonState = () => {
    if (isVoiceDisabled) return 'disabled'
    if (agentStatus === 'listening' || isRecording) return 'recording'
    return 'idle'
  }

  const recordingState = getRecordingButtonState()

  return (
    <motion.div 
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-white border-t border-gray-200 p-4"
    >
      <AnimatePresence>
        {(currentTranscript || agentStatus === 'listening') && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mb-3 p-3 bg-green-50 rounded-lg border border-green-200"
          >
            <div className="flex items-center space-x-2">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="flex-shrink-0"
              >
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </motion.div>
              <p className="text-sm text-green-700 flex-1">
                {currentTranscript || 'Listening... speak now'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="flex items-end space-x-3">
        <div className="flex-1 min-w-0">
          <div className={`relative rounded-xl border-2 transition-colors duration-200 ${
            isFocused ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'
          } ${isDisabled ? 'opacity-50' : ''}`}>
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={getPlaceholderText()}
              disabled={isDisabled || isSending}
              rows={1}
              className="w-full px-4 py-3 bg-transparent border-none focus:outline-none resize-none placeholder-gray-500 disabled:cursor-not-allowed"
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
            disabled={!isConnected}
            className="text-gray-600 hover:text-gray-900 disabled:opacity-50"
            title={voiceEnabled ? "Disable voice" : "Enable voice"}
          >
            {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onToggleRecording}
            disabled={recordingState === 'disabled'}
            className={`transition-all duration-200 ${
              recordingState === 'recording'
                ? 'bg-red-500 text-white hover:bg-red-600 shadow-lg' 
                : recordingState === 'disabled'
                ? 'text-gray-400 cursor-not-allowed opacity-50'
                : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
            }`}
            title={
              recordingState === 'disabled' 
                ? "Voice not available" 
                : recordingState === 'recording'
                ? "Stop recording"
                : "Start voice input"
            }
          >
            <motion.div
              animate={recordingState === 'recording' ? { scale: [1, 1.1, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              {recordingState === 'recording' ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </motion.div>
          </Button>
        </div>

        <Button
          type="submit"
          disabled={!message.trim() || isDisabled || isSending}
          size="md"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 disabled:opacity-50 disabled:cursor-not-allowed"
          isLoading={isSending}
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>

      {!isConnected && (
        <p className="text-xs text-gray-500 mt-2 text-center">
          Start a conversation to enable voice and text input
        </p>
      )}
    </motion.div>
  )
}