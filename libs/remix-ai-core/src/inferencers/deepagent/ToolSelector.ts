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