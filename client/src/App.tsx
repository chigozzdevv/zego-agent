import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChatContainer } from './components/Chat/ChatContainer'
import { ConversationList } from './components/Memory/ConversationList'
import { memoryService } from './services/memory'
import type { ConversationMemory } from './types'
import { Plus, Menu, X, MessageSquare } from 'lucide-react'
import { Button } from './components/UI/Button'

function App() {
  const [conversations, setConversations] = useState<ConversationMemory[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(undefined)
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024) // Desktop open by default
  const [isCreatingNewConversation, setIsCreatingNewConversation] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(0)

  // Load conversations on mount and set up periodic refresh
  useEffect(() => {
    const loadConversations = () => {
      try {
        const allConversations = memoryService.getAllConversations()
        setConversations(allConversations)
        setLastUpdate(Date.now())
      } catch (error) {
        console.error('Failed to load conversations:', error)
      }
    }
    
    loadConversations()
    
    // Refresh conversations every 3 seconds when there are active conversations
    const interval = setInterval(() => {
      const current = memoryService.getAllConversations()
      if (current.length !== conversations.length || 
          current.some((conv, index) => conv.updatedAt !== conversations[index]?.updatedAt)) {
        loadConversations()
      }
    }, 3000)
    
    return () => clearInterval(interval)
  }, [conversations.length])

  // Handle responsive sidebar behavior
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(true) // Always show on desktop
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleNewConversation = useCallback(async () => {
    if (isCreatingNewConversation) return
    
    setIsCreatingNewConversation(true)
    try {
      // Clear current conversation
      setCurrentConversationId(undefined)
      
      // On mobile, close sidebar after action
      if (window.innerWidth < 1024) {
        setSidebarOpen(false)
      }
    } finally {
      setIsCreatingNewConversation(false)
    }
  }, [isCreatingNewConversation])

  const handleSelectConversation = useCallback((id: string) => {
    if (id !== currentConversationId && !isCreatingNewConversation) {
      setCurrentConversationId(id)
      
      // On mobile, close sidebar after selection
      if (window.innerWidth < 1024) {
        setSidebarOpen(false)
      }
    }
  }, [currentConversationId, isCreatingNewConversation])

  const handleDeleteConversation = useCallback((id: string) => {
    try {
      memoryService.deleteConversation(id)
      
      // Force refresh conversations
      const updatedConversations = memoryService.getAllConversations()
      setConversations(updatedConversations)
      
      // If we deleted the current conversation, clear it
      if (currentConversationId === id) {
        setCurrentConversationId(undefined)
      }
      
      setLastUpdate(Date.now())
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }, [currentConversationId])

  const refreshConversations = useCallback(() => {
    try {
      const updatedConversations = memoryService.getAllConversations()
      setConversations(updatedConversations)
      setLastUpdate(Date.now())
    } catch (error) {
      console.error('Failed to refresh conversations:', error)
    }
  }, [])

  const handleConversationCreated = useCallback(() => {
    try {
      const latestConversations = memoryService.getAllConversations()
      setConversations(latestConversations)
      
      // Auto-select the newest conversation
      if (latestConversations.length > 0) {
        const newestConv = latestConversations[0]
        if (newestConv.id !== currentConversationId) {
          setCurrentConversationId(newestConv.id)
        }
      }
      
      setLastUpdate(Date.now())
    } catch (error) {
      console.error('Failed to handle conversation creation:', error)
    }
  }, [currentConversationId])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  const closeSidebar = useCallback(() => {
    // Only allow closing on mobile
    if (window.innerWidth < 1024) {
      setSidebarOpen(false)
    }
  }, [])

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && window.innerWidth < 1024 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={closeSidebar}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ x: window.innerWidth < 1024 ? -320 : 0 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-0 top-0 h-full w-80 bg-white z-50 lg:relative lg:z-auto shadow-xl border-r border-gray-200 flex flex-col"
          >
            {/* Sidebar Header */}
            <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-gray-900">AI Assistant</h1>
                    <p className="text-xs text-gray-600">{conversations.length} conversations</p>
                  </div>
                </div>
                
                {/* Close button - only on mobile */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closeSidebar}
                  className="lg:hidden text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              
              {/* New Conversation Button */}
              <Button
                onClick={handleNewConversation}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md"
                disabled={isCreatingNewConversation}
                isLoading={isCreatingNewConversation}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Conversation
              </Button>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-hidden">
              <ConversationList
                conversations={conversations}
                onSelectConversation={handleSelectConversation}
                onDeleteConversation={handleDeleteConversation}
                currentConversationId={currentConversationId}
              />
            </div>

            {/* Sidebar Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-500 text-center">
                Last updated: {new Date(lastUpdate).toLocaleTimeString()}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header - Always Visible */}
        <div className="bg-white border-b border-gray-200 p-3 flex items-center justify-between lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className="text-gray-600 hover:text-gray-900"
          >
            <Menu className="w-5 h-5" />
            <span className="ml-2 text-sm font-medium">
              {sidebarOpen ? 'Close' : 'Conversations'}
            </span>
          </Button>
          
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-3 h-3 text-white" />
            </div>
            <h1 className="font-semibold text-gray-900">AI Assistant</h1>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewConversation}
            className="text-blue-600 hover:text-blue-700"
            disabled={isCreatingNewConversation}
            isLoading={isCreatingNewConversation}
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>

        {/* Desktop Header - Only visible when sidebar is closed */}
        {!sidebarOpen && (
          <div className="bg-white border-b border-gray-200 p-4 hidden lg:flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebar}
              className="text-gray-600 hover:text-gray-900"
            >
              <Menu className="w-5 h-5 mr-2" />
              Show Conversations
            </Button>
            
            <Button
              onClick={handleNewConversation}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isCreatingNewConversation}
              isLoading={isCreatingNewConversation}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Chat
            </Button>
          </div>
        )}

        {/* Chat Container */}
        <div className="flex-1 overflow-hidden">
          <ChatContainer
            key={`${currentConversationId || 'new'}-${lastUpdate}`}
            conversationId={currentConversationId}
            onConversationUpdate={refreshConversations}
            onNewConversation={handleConversationCreated}
          />
        </div>
      </div>
    </div>
  )
}

export default App