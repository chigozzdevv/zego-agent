import type { VoiceSettings } from '../types'

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

export class VoiceService {
  private static instance: VoiceService
  private recognition: SpeechRecognition | null = null
  private synthesis: SpeechSynthesis
  private isRecording = false
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []

  static getInstance(): VoiceService {
    if (!VoiceService.instance) {
      VoiceService.instance = new VoiceService()
    }
    return VoiceService.instance
  }

  constructor() {
    this.synthesis = window.speechSynthesis
    this.initializeSpeechRecognition()
  }

  private initializeSpeechRecognition(): void {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      this.recognition = new SpeechRecognition()
      
      this.recognition.continuous = false
      this.recognition.interimResults = true
      this.recognition.lang = 'en-US'
      this.recognition.maxAlternatives = 1
    }
  }

  async startRecording(
    onTranscript: (transcript: string, isFinal: boolean) => void,
    onError?: (error: string) => void
  ): Promise<boolean> {
    if (!this.recognition) {
      onError?.('Speech recognition not supported')
      return false
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.mediaRecorder = new MediaRecorder(stream)
      this.audioChunks = []

      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data)
      }

      this.mediaRecorder.start()

      this.recognition.onresult = (event) => {
        let transcript = ''
        let isFinal = false

        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript
          if (event.results[i].isFinal) {
            isFinal = true
          }
        }

        onTranscript(transcript, isFinal)
      }

      this.recognition.onerror = (event) => {
        onError?.(`Speech recognition error: ${event.error}`)
        this.stopRecording()
      }

      this.recognition.start()
      this.isRecording = true
      return true
    } catch (error) {
      onError?.(`Microphone access denied: ${error}`)
      return false
    }
  }

  stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.isRecording || !this.mediaRecorder) {
        resolve(null)
        return
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' })
        resolve(audioBlob)
        this.cleanup()
      }

      this.recognition?.stop()
      this.mediaRecorder.stop()
      this.isRecording = false
    })
  }

  speak(text: string, settings: VoiceSettings): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!settings.isEnabled) {
        resolve()
        return
      }

      this.synthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = settings.speechRate
      utterance.pitch = settings.speechPitch
      utterance.volume = 0.8

      if (settings.preferredVoice) {
        const voices = this.synthesis.getVoices()
        const voice = voices.find(v => v.name === settings.preferredVoice)
        if (voice) utterance.voice = voice
      }

      utterance.onend = () => resolve()
      utterance.onerror = (error) => reject(error)

      this.synthesis.speak(utterance)
    })
  }

  private cleanup(): void {
    if (this.mediaRecorder?.stream) {
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop())
    }
    this.mediaRecorder = null
    this.audioChunks = []
  }

  getAvailableVoices(): SpeechSynthesisVoice[] {
    return this.synthesis.getVoices()
  }

  get isCurrentlyRecording(): boolean {
    return this.isRecording
  }
}

export const voiceService = VoiceService.getInstance()