import { ZegoExpressEngine } from 'zego-express-engine-webrtc'
import { config } from '../config'
import { agentAPI } from './api'

export class ZegoService {
  private static instance: ZegoService
  private zg: ZegoExpressEngine | null = null
  private isInitialized = false
  private currentRoomId: string | null = null
  private currentUserId: string | null = null
  private localStream: any = null
  private isJoining = false
  private audioElement: HTMLAudioElement | null = null

  static getInstance(): ZegoService {
    if (!ZegoService.instance) {
      ZegoService.instance = new ZegoService()
    }
    return ZegoService.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized || this.isJoining) return

    this.isJoining = true
    try {
      this.zg = new ZegoExpressEngine(
        parseInt(config.ZEGO_APP_ID), 
        config.ZEGO_SERVER
      )
      
      this.setupEventListeners()
      this.setupAudioElement()
      this.isInitialized = true
      console.log('✅ ZEGO initialized successfully')
    } catch (error) {
      console.error('❌ ZEGO initialization failed:', error)
      throw error
    } finally {
      this.isJoining = false
    }
  }

  private setupAudioElement(): void {
    this.audioElement = document.getElementById('ai-audio-output') as HTMLAudioElement
    if (!this.audioElement) {
      this.audioElement = document.createElement('audio')
      this.audioElement.id = 'ai-audio-output'
      this.audioElement.autoplay = true
      this.audioElement.controls = false
      this.audioElement.style.display = 'none'
      document.body.appendChild(this.audioElement)
    }

    this.audioElement.volume = 0.8
    this.audioElement.muted = false

    this.audioElement.addEventListener('loadstart', () => {
      console.log('🔊 Audio loading started')
    })

    this.audioElement.addEventListener('canplay', () => {
      console.log('🔊 Audio ready to play')
    })

    this.audioElement.addEventListener('play', () => {
      console.log('🔊 Audio playback started')
    })

    this.audioElement.addEventListener('error', (e) => {
      console.error('❌ Audio error:', e)
    })
  }

  private setupEventListeners(): void {
    if (!this.zg) return

    this.zg.on('recvExperimentalAPI', (result: any) => {
      const { method, content } = result
      if (method === 'onRecvRoomChannelMessage') {
        try {
          const message = JSON.parse(content.msgContent)
          console.log('🎯 Room message received:', message)
          this.handleRoomMessage(message)
        } catch (error) {
          console.error('Failed to parse room message:', error)
        }
      }
    })

    this.zg.on('roomStreamUpdate', async (_roomID: string, updateType: string, streamList: any[]) => {
      console.log('📡 Stream update:', updateType, streamList.length, 'streams')
      
      if (updateType === 'ADD' && streamList.length > 0) {
        for (const stream of streamList) {
          const userStreamId = this.currentUserId ? `${this.currentUserId}_stream` : null
          
          if (userStreamId && stream.streamID === userStreamId) {
            console.log('🚫 Skipping user\'s own stream:', stream.streamID)
            continue
          }

          try {
            console.log('🔗 Playing AI agent stream:', stream.streamID)
            
            const mediaStream = await this.zg!.startPlayingStream(stream.streamID)
            if (mediaStream) {
              console.log('✅ Media stream received:', mediaStream)
              
              const remoteView = await this.zg!.createRemoteStreamView(mediaStream)
              if (remoteView && this.audioElement) {
                try {
                  await remoteView.play(this.audioElement, { 
                    enableAutoplayDialog: false,
                    muted: false
                  })
                  console.log('✅ AI agent audio connected and playing')
                  
                  this.audioElement.muted = false
                  this.audioElement.volume = 0.8
                } catch (playError) {
                  console.error('❌ Failed to play audio through element:', playError)
                  
                  try {
                    if (this.audioElement) {
                      this.audioElement.srcObject = mediaStream
                      await this.audioElement.play()
                      console.log('✅ Fallback audio play successful')
                    }
                  } catch (fallbackError) {
                    console.error('❌ Fallback audio play failed:', fallbackError)
                  }
                }
              }
            }
          } catch (error) {
            console.error('❌ Failed to play agent stream:', error)
          }
        }
      } else if (updateType === 'DELETE') {
        console.log('📴 Agent stream disconnected')
        if (this.audioElement) {
          this.audioElement.srcObject = null
        }
      }
    })

    this.zg.on('roomUserUpdate', (_roomID: string, updateType: string, userList: any[]) => {
      console.log('👥 Room user update:', updateType, userList.length, 'users')
    })

    this.zg.on('roomStateChanged', (roomID: string, reason: string, errorCode: number) => {
      console.log('🏠 Room state changed:', { roomID, reason, errorCode })
    })

    this.zg.on('networkQuality', (userID: string, upstreamQuality: number, downstreamQuality: number) => {
      if (upstreamQuality > 2 || downstreamQuality > 2) {
        console.warn('📶 Network quality issues:', { userID, upstreamQuality, downstreamQuality })
      }
    })

    this.zg.on('publisherStateUpdate', (result: any) => {
      console.log('📤 Publisher state update:', result)
    })

    this.zg.on('playerStateUpdate', (result: any) => {
      console.log('📥 Player state update:', result)
    })
  }

  private messageCallback: ((message: any) => void) | null = null

  private handleRoomMessage(message: any): void {
    if (this.messageCallback) {
      this.messageCallback(message)
    }
  }

  async joinRoom(roomId: string, userId: string): Promise<boolean> {
    if (!this.zg) {
      console.error('❌ ZEGO not initialized')
      return false
    }

    if (this.currentRoomId === roomId && this.currentUserId === userId) {
      console.log('ℹ️ Already in the same room')
      return true
    }

    try {
      if (this.currentRoomId) {
        console.log('🔄 Leaving previous room before joining new one')
        await this.leaveRoom()
      }

      this.currentRoomId = roomId
      this.currentUserId = userId

      console.log('🔑 Getting token for user:', userId)
      const { token } = await agentAPI.getToken(userId)

      console.log('🚪 Logging into room:', roomId)
      await this.zg.loginRoom(roomId, token, {
        userID: userId,
        userName: userId
      })

      console.log('📢 Enabling room message reception')
      this.zg.callExperimentalAPI({ 
        method: 'onRecvRoomChannelMessage', 
        params: {} 
      })

      console.log('🎤 Creating local stream with enhanced audio settings')
      const localStream = await this.zg.createZegoStream({
        camera: { 
          video: false, 
          audio: true
        }
      })

      if (localStream) {
        this.localStream = localStream
        const streamId = `${userId}_stream`
        
        console.log('📤 Publishing stream:', streamId)
        await this.zg.startPublishingStream(streamId, localStream, {
          enableAutoSwitchVideoCodec: true
        })
        
        console.log('✅ Room joined successfully')
        return true
      } else {
        throw new Error('Failed to create local stream')
      }
    } catch (error) {
      console.error('❌ Failed to join room:', error)
      this.currentRoomId = null
      this.currentUserId = null
      return false
    }
  }

  async enableMicrophone(enabled: boolean): Promise<boolean> {
    if (!this.zg || !this.localStream) {
      console.warn('⚠️ Cannot toggle microphone: no stream available')
      return false
    }

    try {
      if (this.localStream.getAudioTracks) {
        const audioTrack = this.localStream.getAudioTracks()[0]
        if (audioTrack) {
          audioTrack.enabled = enabled
          console.log(`🎤 Microphone ${enabled ? 'enabled' : 'disabled'}`)
          return true
        }
      }
      
      console.warn('⚠️ No audio track found in local stream')
      return false
    } catch (error) {
      console.error('❌ Failed to toggle microphone:', error)
      return false
    }
  }

  async leaveRoom(): Promise<void> {
    if (!this.zg || !this.currentRoomId) {
      console.log('ℹ️ No room to leave')
      return
    }

    try {
      console.log('🚪 Leaving room:', this.currentRoomId)
      
      if (this.currentUserId && this.localStream) {
        const streamId = `${this.currentUserId}_stream`
        console.log('📤 Stopping stream publication:', streamId)
        await this.zg.stopPublishingStream(streamId)
      }
      
      if (this.localStream) {
        console.log('🗑️ Destroying local stream')
        this.zg.destroyStream(this.localStream)
        this.localStream = null
      }
      
      await this.zg.logoutRoom()
      
      if (this.audioElement) {
        this.audioElement.srcObject = null
      }
      
      this.currentRoomId = null
      this.currentUserId = null
      
      console.log('✅ Left room successfully')
    } catch (error) {
      console.error('❌ Failed to leave room:', error)
      this.currentRoomId = null
      this.currentUserId = null
      this.localStream = null
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

  isInRoom(): boolean {
    return !!this.currentRoomId && !!this.currentUserId
  }

  destroy(): void {
    if (this.zg) {
      this.leaveRoom()
      this.zg = null
      this.isInitialized = false
      if (this.audioElement && this.audioElement.parentNode) {
        this.audioElement.parentNode.removeChild(this.audioElement)
        this.audioElement = null
      }
      console.log('🗑️ ZEGO service destroyed')
    }
  }
}