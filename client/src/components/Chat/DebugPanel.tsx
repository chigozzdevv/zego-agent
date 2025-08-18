import { useState, useEffect } from 'react'
import { agentAPI } from '../../services/api'

interface DebugPanelProps {
  session: any
  isConnected: boolean
  agentStatus: string
  messages: any[]
}

export const DebugPanel = ({ session, isConnected, agentStatus, messages }: DebugPanelProps) => {
  const [backendHealth, setBackendHealth] = useState<any>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const health = await agentAPI.healthCheck()
        setBackendHealth(health)
      } catch (error) {
        setBackendHealth({ error: error instanceof Error ? error.message : String(error) })
      }
    }
    
    if (isVisible) {
      checkHealth()
    }
  }, [isVisible])

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed top-4 right-4 bg-red-500 text-white px-3 py-1 rounded text-xs z-50"
      >
        Debug
      </button>
    )
  }

  return (
    <div className="fixed top-4 right-4 bg-black text-white p-4 rounded-lg text-xs max-w-md max-h-96 overflow-auto z-50">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold">Debug Panel</h3>
        <button onClick={() => setIsVisible(false)} className="text-red-400">✕</button>
      </div>
      
      <div className="space-y-2">
        <div>
          <strong>Connection:</strong> {isConnected ? '✅ Connected' : '❌ Disconnected'}
        </div>
        
        <div>
          <strong>Agent Status:</strong> {agentStatus}
        </div>
        
        <div>
          <strong>Session:</strong> {session ? '✅ Active' : '❌ None'}
          {session && (
            <div className="ml-2 text-xs">
              <div>Room: {session.roomId}</div>
              <div>User: {session.userId}</div>
              <div>Agent: {session.agentInstanceId}</div>
            </div>
          )}
        </div>
        
        <div>
          <strong>Messages:</strong> {messages.length}
        </div>
        
        <div>
          <strong>Backend Health:</strong>
          {backendHealth ? (
            <pre className="text-xs mt-1 bg-gray-800 p-2 rounded">
              {JSON.stringify(backendHealth, null, 2)}
            </pre>
          ) : (
            ' Loading...'
          )}
        </div>
        
        <div>
          <strong>Environment:</strong>
          <div className="ml-2 text-xs">
            <div>App ID: {import.meta.env.VITE_ZEGO_APP_ID ? '✅' : '❌'}</div>
            <div>Server: {import.meta.env.VITE_ZEGO_SERVER ? '✅' : '❌'}</div>
            <div>API URL: {import.meta.env.VITE_API_BASE_URL ? '✅' : '❌'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}