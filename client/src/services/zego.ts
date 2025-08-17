import { ZegoExpressEngine } from 'zego-express-engine-webrtc'
import { config } from '../config'
import { agentAPI } from './api'

export class ZegoService {
  private static instance: ZegoService
  private zg: ZegoExpressEngine | null = null
  private isInitialized = false
  private currentRoomId: string | null = null
  private currentUserId: string | null = null

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
    
    this.setupEventListeners()
    this.isInitialized = true
  }

  private setupEventListeners(): void {
    if (!this.zg) return

    this.zg.on('recvExperimentalAPI', (result: any) => {
      const { method, content } = result
      if (method === 'onRecvRoomChannelMessage') {
        try {
          const message = JSON.parse(content.msgContent)
          this.handleRoomMessage(message)
        } catch (error) {
          console.error('Failed to parse room message:', error)
        }
      }
    })

    this.zg.on('roomStreamUpdate', async (_roomID: string, updateType: string, streamList: any[]) => {
      if (updateType === 'ADD' && streamList.length > 0) {
        for (const stream of streamList) {
          try {
            const mediaStream = await this.zg!.startPlayingStream(stream.streamID)
            if (mediaStream) {
              const remoteView = await this.zg!.createRemoteStreamView(mediaStream)
              if (remoteView) {
                const audioElement = document.getElementById('ai-audio-output')
                if (audioElement) {
                  remoteView.play(audioElement as any, { enableAutoplayDialog: false })
                }
              }
            }
          } catch (error) {
            console.error('Failed to play agent stream:', error)
          }
        }
      }
    })

    this.zg.on('roomUserUpdate', (_roomID: string, updateType: string, userList: any[]) => {
      if (updateType === 'ADD') {
        console.log('Users joined:', userList)
      }
    })
  }

  private messageCallback: ((message: any) => void) | null = null

  private handleRoomMessage(message: any): void {
    if (this.messageCallback) {
      this.messageCallback(message)
    }
  }

  async joinRoom(roomId: string, userId: string): Promise<boolean> {
    if (!this.zg) throw new Error('ZEGO not initialized')

    try {
      this.currentRoomId = roomId
      this.currentUserId = userId

      // Get token from backend
      const { token } = await agentAPI.getToken(userId)

      await this.zg.loginRoom(roomId, token, {
        userID: userId,
        userName: userId
      })

      this.zg.callExperimentalAPI({ 
        method: 'onRecvRoomChannelMessage', 
        params: {} 
      })

      const localStream = await this.zg.createZegoStream({
        camera: { video: false, audio: true }
      })

      if (localStream) {
        await this.zg.startPublishingStream(`${userId}_stream`, localStream, {
          enableAutoSwitchVideoCodec: true
        })
      }

      return true
    } catch (error) {
      console.error('Failed to join room:', error)
      return false
    }
  }

  async leaveRoom(): Promise<void> {
    if (this.zg && this.currentRoomId) {
      try {
        await this.zg.logoutRoom()
        this.currentRoomId = null
        this.currentUserId = null
      } catch (error) {
        console.error('Failed to leave room:', error)
      }
    }
  }

  onRoomMessage(callback: (message: any) => void): void {
    this.messageCallback = callback
  }

  getCurrentRoomId(): string | null {
    return this.currentRoomId
  }

  getCurrentUserId(): string | null {
    return this.currentUserId
  }

  getEngine(): ZegoExpressEngine | null {
    return this.zg
  }
}