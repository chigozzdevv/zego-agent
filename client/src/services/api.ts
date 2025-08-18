import axios from 'axios'
import { config } from '../config'

const api = axios.create({
  baseURL: config.API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use(
  (config) => {
    console.log('🌐 API Request:', config.method?.toUpperCase(), config.url)
    if (config.data && config.method !== 'get') {
      console.log('📤 Request Data:', config.data)
    }
    return config
  },
  (error) => {
    console.error('❌ API Request Error:', error)
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', response.status, response.config.url)
    if (response.data) {
      console.log('📥 Response Data:', response.data)
    }
    return response
  },
  (error) => {
    console.error('❌ API Response Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method
    })
    return Promise.reject(error)
  }
)

export const agentAPI = {
  async startSession(roomId: string, userId: string): Promise<{ agentInstanceId: string }> {
    try {
      const requestData = {
        room_id: roomId,
        user_id: userId,
        user_stream_id: `${userId}_stream`,
      }
      
      console.log('🚀 Starting session with data:', requestData)
      
      const response = await api.post('/api/start', requestData)
      
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.error || 'Session start failed')
      }
      
      if (!response.data.agentInstanceId) {
        throw new Error('No agent instance ID returned')
      }
      
      console.log('✅ Session started successfully:', response.data.agentInstanceId)
      
      return {
        agentInstanceId: response.data.agentInstanceId
      }
    } catch (error: any) {
      console.error('❌ Start session failed:', error.response?.data || error.message)
      throw new Error(error.response?.data?.error || error.message || 'Failed to start session')
    }
  },

  async sendMessage(agentInstanceId: string, message: string): Promise<void> {
    if (!agentInstanceId) {
      throw new Error('Agent instance ID is required')
    }
    
    if (!message || !message.trim()) {
      throw new Error('Message content is required')
    }

    try {
      const requestData = {
        agent_instance_id: agentInstanceId,
        message: message.trim(),
      }
      
      console.log('💬 Sending message:', {
        agentInstanceId,
        messageLength: message.length,
        messagePreview: message.substring(0, 50) + (message.length > 50 ? '...' : '')
      })
      
      const response = await api.post('/api/send-message', requestData)
      
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.error || 'Message send failed')
      }
      
      console.log('✅ Message sent successfully')
    } catch (error: any) {
      console.error('❌ Send message failed:', error.response?.data || error.message)
      throw new Error(error.response?.data?.error || error.message || 'Failed to send message')
    }
  },

  async stopSession(agentInstanceId: string): Promise<void> {
    if (!agentInstanceId) {
      console.warn('⚠️ No agent instance ID provided for stop session')
      return
    }

    try {
      const requestData = {
        agent_instance_id: agentInstanceId,
      }
      
      console.log('🛑 Stopping session:', agentInstanceId)
      
      const response = await api.post('/api/stop', requestData)
      
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.error || 'Session stop failed')
      }
      
      console.log('✅ Session stopped successfully')
    } catch (error: any) {
      console.error('❌ Stop session failed:', error.response?.data || error.message)
      throw new Error(error.response?.data?.error || error.message || 'Failed to stop session')
    }
  },

  async getToken(userId: string): Promise<{ token: string }> {
    if (!userId) {
      throw new Error('User ID is required')
    }

    try {
      console.log('🔑 Getting token for user:', userId)
      
      const response = await api.get(`/api/token?user_id=${encodeURIComponent(userId)}`)
      
      if (!response.data || !response.data.token) {
        throw new Error('No token returned')
      }
      
      console.log('✅ Token received successfully')
      
      return { token: response.data.token }
    } catch (error: any) {
      console.error('❌ Get token failed:', error.response?.data || error.message)
      throw new Error(error.response?.data?.error || error.message || 'Failed to get token')
    }
  }
}