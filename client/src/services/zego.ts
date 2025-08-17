import { ZegoExpressEngine } from 'zego-express-engine-webrtc'
import { config } from '../config'

export class ZegoService {
  private static instance: ZegoService
  private zg: ZegoExpressEngine | null = null
  private isInitialized = false

  static getInstance(): ZegoService {
    if (!ZegoService.instance) {
      ZegoService.instance = new ZegoService()
    }
    return ZegoService.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    this.zg = new ZegoExpressEngine(
      parseInt(config.ZEGO_APP_ID), 
      config.ZEGO_SERVER
    )
    
    this.isInitialized = true
  }

  async joinRoom(roomId: string, userId: string): Promise<boolean> {
    if (!this.zg) throw new Error('ZEGO not initialized')

    try {
      const result = await this.zg.loginRoom(roomId, userId, { userID: userId, userName: userId })
      return result
    } catch (error) {
      console.error('Failed to join room:', error)
      return false
    }
  }

  async leaveRoom(): Promise<void> {
    if (this.zg) {
      await this.zg.logoutRoom()
    }
  }

  onRoomMessage(callback: (message: any) => void): void {
    if (!this.zg) return
    
    this.zg.on('roomStreamUpdate', callback)
  }

  getEngine(): ZegoExpressEngine | null {
    return this.zg
  }
}