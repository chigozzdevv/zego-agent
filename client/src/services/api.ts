import axios from 'axios'
import { config } from '../config'

const api = axios.create({
  baseURL: config.API_BASE_URL,
  timeout: 30000,
})

export const agentAPI = {
  async startSession(roomId: string, userId: string): Promise<{ agentInstanceId: string }> {
    const response = await api.post('/api/start', {
      room_id: roomId,
      user_id: userId,
      user_stream_id: `${userId}_stream`,
    })
    return response.data
  },

  async sendMessage(agentInstanceId: string, message: string): Promise<void> {
    await api.post('/api/send-message', {
      agent_instance_id: agentInstanceId,
      message,
    })
  },

  async stopSession(agentInstanceId: string): Promise<void> {
    await api.post('/api/stop', {
      agent_instance_id: agentInstanceId,
    })
  },

  async getToken(userId: string): Promise<{ token: string }> {
    const response = await api.get(`/api/token?user_id=${userId}`)
    return response.data
  }
}