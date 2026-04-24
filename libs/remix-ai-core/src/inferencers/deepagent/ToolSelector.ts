/**
 * Tool Selection using Vector Embeddings
 * Selects relevant tools based on prompt similarity
 */

import type { DynamicStructuredTool } from '@langchain/core/tools'
import { Document } from '@langchain/core/documents'

// Fallback type definitions for optional embeddings
interface EmbeddingsInterface {
  embedQuery(text: string): Promise<number[]>
  embedDocuments(texts: string[]): Promise<number[][]>
}

interface VectorStoreInterface {
  similaritySearch(query: string, k?: number): Promise<Document[]>
}

// Simple in-memory vector store fallback
class SimpleVectorStore implements VectorStoreInterface {
  private documents: Document[] = []
  private embeddings: number[][] = []

  constructor(docs: Document[], embeddings?: EmbeddingsInterface) {
    this.documents = docs
    // If no embeddings available, use simple text matching
    this.embeddings = docs.map(() => [])
  }

  async similaritySearch(query: string, k: number = 5): Promise<Document[]> {
    // Simple text-based matching fallback
    const queryLower = query.toLowerCase()
    const scores = this.documents.map((doc, index) => ({
      doc,
      score: this.calculateTextSimilarity(queryLower, doc.pageContent.toLowerCase()),
      index
    }))

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(item => item.doc)
  }

  private calculateTextSimilarity(query: string, content: string): number {
    const queryWords = query.split(/\s+/).filter(w => w.length > 2)
    if (queryWords.length === 0) return 0

    let score = 0
    for (const word of queryWords) {
      if (content.includes(word)) {
        score += 1
      }
    }
    return score / queryWords.length
  }
}

export interface ToolDocument {
  tool: DynamicStructuredTool
  document: Document
}

export interface ConversationAnalysis {
  phases: string[]
  currentPhase: string
  intentEvolution: string[]
  toolPatterns: Record<string, number>
  momentum: 'building' | 'stable' | 'declining'
  messageCount: number
  userMessageCount: number
}

export class ToolSelector {
  private vectorStore: VectorStoreInterface | null = null
  private toolDocuments: ToolDocument[] = []
  private initialized = false

  /**
   * Build vector index of tools
   */
  async buildToolIndex(tools: DynamicStructuredTool[]): Promise<void> {
    if (tools.length === 0) {
      console.warn('[ToolSelector] No tools provided for indexing')
      return
    }

    try {
      // Create documents from tools
      this.toolDocuments = tools.map((tool, index) => {
        const content = `${tool.name}: ${tool.description}`
        const document = new Document({
          pageContent: content,
          metadata: { 
            index, 
            toolName: tool.name,
            category: this.categorizeToolFromName(tool.name)
          }
        })
        
        return { tool, document }
      })

      // Build vector store
      const documents = this.toolDocuments.map(td => td.document)
      
      // For now, always use simple text-based matching as it's more reliable
      // TODO: Add proper vector embeddings when @langchain/openai is available
      this.vectorStore = new SimpleVectorStore(documents)
      this.initialized = true
      console.log(`[ToolSelector] Built text-based index for ${tools.length} tools`)
    } catch (error) {
      console.error('[ToolSelector] Failed to build tool index:', error)
      // Fallback: return all tools if everything fails
      this.toolDocuments = tools.map((tool, index) => ({
        tool,
        document: new Document({
          pageContent: `${tool.name}: ${tool.description}`,
          metadata: { index, toolName: tool.name, category: 'general' }
        })
      }))
      this.vectorStore = new SimpleVectorStore(this.toolDocuments.map(td => td.document))
      this.initialized = false
    }
  }

  /**
   * Create a conversation summary for tool selection
   */
  private createConversationSummary(messages: any[]): string {
    const userMessages = messages.filter(msg => msg.role === 'user')
    const assistantMessages = messages.filter(msg => msg.role === 'assistant')
    
    // Extract key terms and topics from the conversation
    const allContent = [...userMessages, ...assistantMessages]
      .map(msg => msg.content)
      .join(' ')
      .toLowerCase()
    
    // Identify conversation themes
    const themes = this.extractConversationThemes(allContent)
    
    // Weight recent messages more heavily
    const recentMessages = userMessages.slice(-3) // Last 3 user messages
    const recentContent = recentMessages.map(msg => msg.content).join(' ')
    
    // Combine themes with recent context
    return `${themes.join(' ')} ${recentContent}`.trim()
  }

  /**
   * Extract key themes from conversation content
   */
  private extractConversationThemes(content: string): string[] {
    const themes: string[] = []
    
    // Define theme patterns
    const themePatterns = {
      compilation: ['compile', 'build', 'solidity', 'contract', 'optimization'],
      debugging: ['debug', 'error', 'trace', 'transaction', 'failed', 'revert'],
      deployment: ['deploy', 'network', 'mainnet', 'testnet', 'gas', 'blockchain'],
      security: ['security', 'vulnerability', 'audit', 'attack', 'exploit', 'safe'],
      testing: ['test', 'testing', 'unit test', 'coverage', 'mock'],
      analysis: ['analyze', 'review', 'check', 'examine', 'inspect'],
      file_ops: ['file', 'read', 'write', 'open', 'save', 'directory']
    }
    
    // Check for theme matches
    for (const [theme, keywords] of Object.entries(themePatterns)) {
      const matches = keywords.filter(keyword => content.includes(keyword))
      if (matches.length > 0) {
        themes.push(theme)
      }
    }
    
    return themes
  }

  /**
   * Get relevant tools for a query using conversation context
   */
  async getRelevantToolsWithContext(
    messages: any[],
    k: number = 7,
    fallbackAll: boolean = false
  ): Promise<DynamicStructuredTool[]> {
    const conversationSummary = this.createConversationSummary(messages)
    console.log(`[ToolSelector] Conversation summary: ${conversationSummary}`)
    
    return this.getRelevantTools(conversationSummary, k, fallbackAll)
  }

  /**
   * Advanced conversation analysis with weighted tool selection
   */
  async getRelevantToolsAdvanced(
    messages: any[],
    k: number = 7,
    _fallbackAll: boolean = false
  ): Promise<DynamicStructuredTool[]> {
    const analysis = this.analyzeConversationFlow(messages)
    console.log(`[ToolSelector] Conversation analysis:`, analysis)
    
    // Get tools based on conversation flow analysis
    const selectedTools = this.selectToolsFromAnalysis(analysis, k)
    
    // Add essential tools
    const essentialTools = this.getEssentialTools()
    const toolNames = new Set(selectedTools.map(t => t.name))
    
    for (const tool of essentialTools) {
      if (!toolNames.has(tool.name) && selectedTools.length < k + 3) {
        selectedTools.push(tool)
      }
    }
    
    return selectedTools.slice(0, k + 3) // Allow a few extra for essential tools
  }

  /**
   * Analyze conversation flow and extract intent patterns
   */
  private analyzeConversationFlow(messages: any[]): ConversationAnalysis {
    const userMessages = messages.filter(msg => msg.role === 'user')
    const assistantMessages = messages.filter(msg => msg.role === 'assistant')
    
    // Analyze conversation progression
    const phases = this.identifyConversationPhases(userMessages)
    const currentPhase = phases[phases.length - 1] || 'general'
    
    // Analyze intent evolution
    const intentEvolution = this.trackIntentEvolution(userMessages)
    
    // Calculate tool usage patterns from assistant responses
    const toolPatterns = this.extractToolPatterns(assistantMessages)
    
    // Determine conversation momentum
    const momentum = this.calculateConversationMomentum(messages)
    
    return {
      phases,
      currentPhase,
      intentEvolution,
      toolPatterns,
      momentum,
      messageCount: messages.length,
      userMessageCount: userMessages.length
    }
  }

  /**
   * Identify different phases of the conversation
   */
  private identifyConversationPhases(userMessages: any[]): string[] {
    const phases: string[] = []
    
    for (const message of userMessages) {
      const content = message.content.toLowerCase()
      
      if (this.matchesPhase(content, 'setup')) phases.push('setup')
      else if (this.matchesPhase(content, 'development')) phases.push('development')
      else if (this.matchesPhase(content, 'debugging')) phases.push('debugging')
      else if (this.matchesPhase(content, 'testing')) phases.push('testing')
      else if (this.matchesPhase(content, 'deployment')) phases.push('deployment')
      else if (this.matchesPhase(content, 'analysis')) phases.push('analysis')
      else phases.push('general')
    }
    
    return phases
  }

  private matchesPhase(content: string, phase: string): boolean {
    const phaseKeywords: Record<string, string[]> = {
      setup: ['create', 'start', 'new', 'initialize', 'setup'],
      development: ['write', 'code', 'implement', 'function', 'contract'],
      debugging: ['debug', 'error', 'fix', 'problem', 'issue', 'failed'],
      testing: ['test', 'check', 'verify', 'validate'],
      deployment: ['deploy', 'launch', 'publish', 'release'],
      analysis: ['analyze', 'review', 'audit', 'examine', 'inspect']
    }
    
    return phaseKeywords[phase]?.some((keyword: string) => content.includes(keyword)) || false
  }

  private trackIntentEvolution(userMessages: any[]): string[] {
    // Track how user intent changes over the conversation
    return userMessages.map(msg => this.classifyIntent(msg.content))
  }

  private classifyIntent(content: string): string {
    const lower = content.toLowerCase()
    
    if (lower.includes('compile') || lower.includes('build')) return 'compilation'
    if (lower.includes('debug') || lower.includes('error')) return 'debugging'
    if (lower.includes('deploy')) return 'deployment'
    if (lower.includes('test')) return 'testing'
    if (lower.includes('security') || lower.includes('audit')) return 'security'
    if (lower.includes('analyze') || lower.includes('review')) return 'analysis'
    if (lower.includes('help') || lower.includes('how')) return 'assistance'
    
    return 'general'
  }

  private extractToolPatterns(assistantMessages: any[]): Record<string, number> {
    const patterns: Record<string, number> = {}
    
    // Look for tool mentions in assistant responses
    for (const message of assistantMessages) {
      const content = message.content.toLowerCase()
      
      // Extract tool usage patterns (simplified)
      if (content.includes('compil')) patterns['compilation'] = (patterns['compilation'] || 0) + 1
      if (content.includes('debug')) patterns['debugging'] = (patterns['debugging'] || 0) + 1
      if (content.includes('deploy')) patterns['deployment'] = (patterns['deployment'] || 0) + 1
      if (content.includes('analyz')) patterns['analysis'] = (patterns['analysis'] || 0) + 1
    }
    
    return patterns
  }

  private calculateConversationMomentum(messages: any[]): 'building' | 'stable' | 'declining' {
    if (messages.length < 4) return 'building'
    
    const recentMessages = messages.slice(-4)
    const earlierMessages = messages.slice(-8, -4)
    
    if (recentMessages.length > earlierMessages.length) return 'building'
    if (recentMessages.length === earlierMessages.length) return 'stable'
    return 'declining'
  }

  private selectToolsFromAnalysis(analysis: ConversationAnalysis, k: number): DynamicStructuredTool[] {
    const selectedTools: DynamicStructuredTool[] = []
    
    // Weight tools based on current phase
    const phaseWeights: Record<string, string[]> = {
      setup: ['file', 'general'],
      development: ['compilation', 'file'],
      debugging: ['debugging', 'analysis'],
      testing: ['compilation', 'debugging'],
      deployment: ['deployment', 'compilation'],
      analysis: ['analysis', 'file'],
      general: ['general', 'file']
    }
    
    const relevantCategories = phaseWeights[analysis.currentPhase] || ['general']
    
    // Select tools from relevant categories
    for (const category of relevantCategories) {
      const categoryTools = this.toolDocuments
        .filter(td => td.document.metadata.category === category)
        .map(td => td.tool)
      
      selectedTools.push(...categoryTools.slice(0, Math.ceil(k / relevantCategories.length)))
    }
    
    return selectedTools.slice(0, k)
  }

  /**
   * Get relevant tools for a query
   */
  async getRelevantTools(
    query: string, 
    k: number = 7,
    fallbackAll: boolean = false
  ): Promise<DynamicStructuredTool[]> {
    if (!this.initialized || !this.vectorStore) {
      console.warn('[ToolSelector] Tool index not initialized, returning all tools')
      if (fallbackAll) {
        return this.toolDocuments.map(td => td.tool)
      }
      return []
    }

    try {
      // Search for relevant documents
      const relevantDocs = await this.vectorStore.similaritySearch(query, k)
      
      // Extract tools from documents
      const relevantTools = relevantDocs
        .map(doc => {
          const index = doc.metadata.index as number
          return this.toolDocuments[index]?.tool
        })
        .filter((tool): tool is DynamicStructuredTool => tool !== undefined)

      // Add essential tools that should always be available
      const essentialTools = this.getEssentialTools()
      const toolNames = new Set(relevantTools.map(t => t.name))
      
      for (const tool of essentialTools) {
        if (!toolNames.has(tool.name)) {
          relevantTools.push(tool)
        }
      }

      console.log(`[ToolSelector] Selected ${relevantTools.length} relevant tools for query: "${query.slice(0, 50)}..."`)
      console.log(`[ToolSelector] Selected tools: ${relevantTools.map(t => t.name).join(', ')}`)
      
      return relevantTools
    } catch (error) {
      console.error('[ToolSelector] Error selecting relevant tools:', error)
      
      // Fallback to category-based selection if vector search fails
      return this.getCategoryBasedTools(query, k)
    }
  }

  /**
   * Get essential tools that should always be available
   */
  private getEssentialTools(): DynamicStructuredTool[] {
    const essentialToolNames = [
      'get_current_file',
      'get_opened_files',
      'read_file'
    ]

    return this.toolDocuments
      .filter(td => essentialToolNames.includes(td.tool.name))
      .map(td => td.tool)
  }

  /**
   * Fallback category-based tool selection
   */
  private getCategoryBasedTools(query: string, k: number): DynamicStructuredTool[] {
    const queryLower = query.toLowerCase()
    const categories: Record<string, string[]> = {
      compilation: ['compile', 'solidity', 'contract'],
      debugging: ['debug', 'error', 'trace', 'transaction'],
      deployment: ['deploy', 'network', 'blockchain'],
      analysis: ['analyze', 'security', 'vulnerability', 'audit'],
      file: ['file', 'open', 'read', 'write', 'save'],
      general: []
    }

    // Determine relevant categories
    const relevantCategories = Object.entries(categories)
      .filter(([_, keywords]) => 
        keywords.some(keyword => queryLower.includes(keyword))
      )
      .map(([category]) => category)

    if (relevantCategories.length === 0) {
      relevantCategories.push('general')
    }

    // Get tools from relevant categories
    let selectedTools = this.toolDocuments
      .filter(td => {
        const toolCategory = td.document.metadata.category as string
        return relevantCategories.includes(toolCategory) || toolCategory === 'general'
      })
      .map(td => td.tool)
      .slice(0, k)

    // Add essential tools
    const essentialTools = this.getEssentialTools()
    const toolNames = new Set(selectedTools.map(t => t.name))
    
    for (const tool of essentialTools) {
      if (!toolNames.has(tool.name)) {
        selectedTools.push(tool)
      }
    }

    console.log(`[ToolSelector] Category-based selection: ${selectedTools.length} tools`)
    return selectedTools
  }

  /**
   * Categorize tool based on name patterns
   */
  private categorizeToolFromName(toolName: string): string {
    const name = toolName.toLowerCase()
    
    if (name.includes('compile') || name.includes('solidity')) return 'compilation'
    if (name.includes('debug') || name.includes('trace')) return 'debugging'
    if (name.includes('deploy') || name.includes('network')) return 'deployment'
    if (name.includes('analyze') || name.includes('security') || name.includes('audit')) return 'analysis'
    if (name.includes('file') || name.includes('read') || name.includes('write')) return 'file'
    
    return 'general'
  }

  /**
   * Get all tools (for fallback scenarios)
   */
  getAllTools(): DynamicStructuredTool[] {
    return this.toolDocuments.map(td => td.tool)
  }

  /**
   * Check if selector is ready
   */
  isReady(): boolean {
    return this.toolDocuments.length > 0
  }

  /**
   * Get statistics about the tool index
   */
  getStats(): { totalTools: number, initialized: boolean, categories: Record<string, number> } {
    const categories: Record<string, number> = {}
    
    for (const td of this.toolDocuments) {
      const category = td.document.metadata.category as string
      categories[category] = (categories[category] || 0) + 1
    }

    return {
      totalTools: this.toolDocuments.length,
      initialized: this.initialized,
      categories
    }
  }
}