import { motion, AnimatePresence } from 'framer-motion'
import type { ConversationMemory } from '../../types'
import { MessageSquare, Clock, Trash2 } from 'lucide-react'
import { Button } from '../UI/Button'

interface ConversationListProps {
  conversations: ConversationMemory[]
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  currentConversationId?: string
}

export const ConversationList = ({ 
  conversations, 
  onSelectConversation, 
  onDeleteConversation,
  currentConversationId 
}: ConversationListProps) => {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  return (
    <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900 flex items-center">
          <MessageSquare className="w-5 h-5 mr-2" />
          Conversations
        </h2>
        <p className="text-sm text-gray-500 mt-1">{conversations.length} total</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence>
          {conversations.map((conv) => (
            <motion.div
              key={conv.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              whileHover={{ backgroundColor: '#f8fafc' }}
              className={`p-4 border-b border-gray-100 cursor-pointer transition-colors group ${
                currentConversationId === conv.id ? 'bg-blue-50 border-blue-200' : ''
              }`}
              onClick={() => onSelectConversation(conv.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate mb-1">
                    {conv.title}
                  </h3>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                    {conv.metadata.lastAIResponse || 'No messages yet'}
                  </p>
                  <div className="flex items-center space-x-3 text-xs text-gray-500">
                    <span className="flex items-center">
                      <MessageSquare className="w-3 h-3 mr-1" />
                      {conv.metadata.totalMessages}
                    </span>
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatDate(conv.updatedAt)}
                    </span>
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteConversation(conv.id)
                  }}
                  className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {conversations.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs mt-1">Start a new chat to begin</p>
          </div>
        )}
      </div>
    </div>
  )
}