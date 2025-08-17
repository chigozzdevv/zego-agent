import type { ConversationMemory, Message } from '../types'
import { STORAGE_KEYS } from '../config'

class MemoryService {
  private static instance: MemoryService
  private conversations: Map<string, ConversationMemory> = new Map()

  static getInstance(): MemoryService {
    if (!MemoryService.instance) {
      MemoryService.instance = new MemoryService()
    }
    return MemoryService.instance
  }

  constructor() {
    this.loadFromStorage()
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS)
      if (stored) {
        const conversations: ConversationMemory[] = JSON.parse(stored)
        conversations.forEach(conv => {
          this.conversations.set(conv.id, conv)
        })
      }
    } catch (error) {
      console.error('Failed to load conversations from storage:', error)
    }
  }

  private saveToStorage(): void {
    try {
      const conversations = Array.from(this.conversations.values())
      localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations))
    } catch (error) {
      console.error('Failed to save conversations to storage:', error)
    }
  }

  createOrGetConversation(id?: string): ConversationMemory {
    const conversationId = id || this.generateConversationId()
    
    if (this.conversations.has(conversationId)) {
      return this.conversations.get(conversationId)!
    }

    const newConversation: ConversationMemory = {
      id: conversationId,
      title: 'New Conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        totalMessages: 0,
        lastAIResponse: '',
        topics: []
      }
    }

    this.conversations.set(conversationId, newConversation)
    this.saveToStorage()
    return newConversation
  }

  addMessage(conversationId: string, message: Message): void {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return

    conversation.messages.push(message)
    conversation.updatedAt = Date.now()
    conversation.metadata.totalMessages++

    if (message.sender === 'ai') {
      conversation.metadata.lastAIResponse = message.content
    }

    if (conversation.messages.length === 1 && message.sender === 'user') {
      conversation.title = message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
    }

    this.saveToStorage()
  }

  getConversation(conversationId: string): ConversationMemory | null {
    return this.conversations.get(conversationId) || null
  }

  getAllConversations(): ConversationMemory[] {
    return Array.from(this.conversations.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  deleteConversation(conversationId: string): void {
    this.conversations.delete(conversationId)
    this.saveToStorage()
  }

  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export const memoryService = MemoryService.getInstance()