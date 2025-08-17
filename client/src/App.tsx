import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChatContainer } from './components/Chat/ChatContainer'
import { ConversationList } from './components/Memory/ConversationList'
import { memoryService } from './services/memory'
import type { ConversationMemory } from './types'
import { Plus, Menu, X } from 'lucide-react'
import { Button } from './components/UI/Button'

function App() {
  const [conversations, setConversations] = useState<ConversationMemory[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string>()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    setConversations(memoryService.getAllConversations())
  }, [])

  const handleNewConversation = () => {
    setCurrentConversationId(undefined)
  }

  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id)
    setSidebarOpen(false)
  }

  const handleDeleteConversation = (id: string) => {
    memoryService.deleteConversation(id)
    setConversations(memoryService.getAllConversations())
    if (currentConversationId === id) {
      setCurrentConversationId(undefined)
    }
  }

  const refreshConversations = () => {
    setConversations(memoryService.getAllConversations())
  }

  return (
    <div className="flex h-screen bg-gray-900">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 lg:hidden z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            className="fixed left-0 top-0 h-full w-80 bg-white z-50 lg:relative lg:z-auto lg:translate-x-0 shadow-xl"
          >
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h1 className="text-xl font-bold text-gray-900">AI Assistant</h1>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNewConversation}
                    className="text-blue-600 hover:bg-blue-50"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarOpen(false)}
                    className="lg:hidden"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <ConversationList
                conversations={conversations}
                onSelectConversation={handleSelectConversation}
                onDeleteConversation={handleDeleteConversation}
                currentConversationId={currentConversationId}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col">
        <div className="lg:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <h1 className="font-semibold text-gray-900">AI Assistant</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewConversation}
            className="text-blue-600"
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1">
          <ChatContainer
            conversationId={currentConversationId}
            onConversationUpdate={refreshConversations}
          />
        </div>
      </div>
    </div>
  )
}

export default App
