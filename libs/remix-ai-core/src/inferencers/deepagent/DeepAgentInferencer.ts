/**
 * DeepAgent Inferencer for Remix IDE
 * Integrates LangChain DeepAgent with Remix's AI system
 */

import { IAIStreamResponse, ICompletions, IGeneration, IParams } from '../../types/types'
import { Plugin } from '@remixproject/engine'
import EventEmitter from 'events'
import { RemixFilesystemBackend } from './RemixFilesystemBackend'
import { createRemixTools } from './RemixToolAdapter'
import { ToolSelector } from './ToolSelector'
import {
  REMIX_DEEPAGENT_SYSTEM_PROMPT,
  SOLIDITY_CODE_GENERATION_PROMPT,
  SECURITY_ANALYSIS_PROMPT,
  CODE_EXPLANATION_PROMPT,
  SECURITY_AUDITOR_SUBAGENT_PROMPT,
  CODE_REVIEWER_SUBAGENT_PROMPT,
  FRONTEND_SPECIALIST_SUBAGENT_PROMPT,
  ETHERSCAN_SUBAGENT_PROMPT,
  THEGRAPH_SUBAGENT_PROMPT,
  ALCHEMY_SUBAGENT_PROMPT,
  GAS_OPTIMIZER_SUBAGENT_PROMPT,
  COMPREHENSIVE_AUDITOR_SUBAGENT_PROMPT,
  WEB3_EDUCATOR_SUBAGENT_PROMPT
} from './DeepAgentPrompts'
import { DeepAgentMemoryBackend } from '../../storage/deepAgentMemoryBackend'
import { IDeepAgentConfig, DeepAgentError, DeepAgentErrorType } from '../../types/deepagent'
import { ToolRegistry } from '../../remix-mcp-server/types/mcpTools'

// Import LangChain modules
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatMistralAI } from '@langchain/mistralai'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import { buildChatPrompt } from '../../prompts/promptBuilder'
import { MemorySaver } from "@langchain/langgraph";

// Model provider types
type ModelProvider = 'anthropic' | 'mistralai' | 'openai' | 'ollama'

interface ModelSelection {
  provider: ModelProvider
  modelId: string
}

// Initialize AsyncLocalStorage for browser environment
const initializeAsyncLocalStorage = () => {
  // Create a proper AsyncLocalStorage implementation for browser
  const storeStack: any[] = []
  const browserAsyncLocalStorage = {
    run<T>(store: any, callback: () => T): T {
      storeStack.push(store)
      try {
        const result = callback()
        if (result && typeof (result as any).then === 'function') {
          return (result as any).finally(() => { storeStack.pop() })
        }
        storeStack.pop()
        return result
      } catch (error) {
        storeStack.pop()
        throw error
      }
    },
    getStore() {
      return storeStack.length > 0 ? storeStack[storeStack.length - 1] : undefined
    },
    enterWith(store: any) {
      storeStack.push(store)
    },
    exit<T>(callback: () => T): T {
      const prev = storeStack.pop()
      try {
        return callback()
      } finally {
        if (prev !== undefined) storeStack.push(prev)
      }
    },
    disable() {
      storeStack.length = 0
    }
  }

  // Initialize LangChain's global AsyncLocalStorage singleton
  AsyncLocalStorageProviderSingleton.initializeGlobalInstance(browserAsyncLocalStorage)
  console.log('[DeepAgentInferencer] Initialized AsyncLocalStorage for browser environment')
}

// Initialize immediately when module loads
initializeAsyncLocalStorage()

/**
 * DeepAgentInferencer integrates LangChain DeepAgent with Remix IDE
 */
export class DeepAgentInferencer implements ICompletions, IGeneration {
  private plugin: Plugin
  private config: IDeepAgentConfig
  private event: EventEmitter
  private agent: any = null
  private filesystemBackend: RemixFilesystemBackend
  private memoryBackend: DeepAgentMemoryBackend | null = null
  private tools: DynamicStructuredTool[] = []
  private toolSelector: ToolSelector | null = null
  private currentAbortController: AbortController | null = null
  private fallbackInferencer: any = null
  private model: BaseChatModel | null = null
  private modelSelection: ModelSelection

  constructor(
    plugin: Plugin,
    toolRegistry: ToolRegistry,
    config?: Partial<IDeepAgentConfig>,
    fallbackInferencer?: any,
    mcpInferencer?: any,
    modelSelection?: ModelSelection
  ) {
    this.plugin = plugin
    this.event = new EventEmitter()
    this.fallbackInferencer = fallbackInferencer

    // Store model selection (default to mistral-medium-latest which is the system default)
    this.modelSelection = modelSelection || {
      provider: 'mistralai',
      modelId: 'mistral-medium-latest'
    }

    // Default configuration (API key handled by proxy)
    this.config = {
      enabled: true,
      apiKey: 'proxy-handled', // Proxy server handles the API key
      memoryBackend: config?.memoryBackend || 'store',
      maxToolExecutions: config?.maxToolExecutions || 10,
      timeout: config?.timeout || 300000, // 5 minutes
      enableSubagents: config?.enableSubagents !== false,
      enablePlanning: config?.enablePlanning !== false
    }

    // Initialize filesystem backend
    this.filesystemBackend = new RemixFilesystemBackend(plugin)

    // Initialize tools (with external MCP clients if available)
    this.initializeTools(toolRegistry, mcpInferencer)

    this.toolSelector = new ToolSelector()
  }

  /**
   * Initialize DeepAgent with all components
   */
  async initialize(): Promise<void> {
    try {
      console.log('[DeepAgentInferencer] Initializing DeepAgent...') // Dynamic import of deepagents only

      console.log('[DeepAgentInferencer] Initializing DeepAgent with config:', this.config)
      console.log('[DeepAgentInferencer] Model selection:', this.modelSelection)

      // Always use proxy server - API key is handled server-side
      const proxyUrl = 'http://localhost:4000'

      this.model = this.createModelInstance(proxyUrl)

      console.log(`[DeepAgentInferencer] Created ${this.modelSelection.provider} model: ${this.modelSelection.modelId}`)

      if (this.config.memoryBackend === 'store') {
        this.memoryBackend = new DeepAgentMemoryBackend('remix-deepagent-memory')
        await this.memoryBackend.init()
      }

      this.tools.push(...this.toolSelector?.getEssentialTools() || [])

      if (this.toolSelector && this.tools.length > 0) {
        await this.toolSelector.buildToolIndex(this.tools)
      }

      const metaTools = this.tools.filter(tool =>
        tool.name === 'get_tool_schema' || tool.name === 'call_tool'
      )

      this.createAgentWithTools(metaTools)
      console.log('[DeepAgentInferencer] Agent created successfully')
      console.log('[DeepAgentInferencer] DeepAgent instance created successfully', this.agent)

      console.log('[DeepAgentInferencer] Initialized successfully')
    } catch (error: any) {
      console.error('[DeepAgentInferencer] Initialization failed:', error)
      throw new DeepAgentError(
        `Failed to initialize DeepAgent: ${error?.message || error}`,
        DeepAgentErrorType.INITIALIZATION_FAILED,
        error
      )
    }
  }

  /**
   * Initialize Remix tools for DeepAgent
   */
  private async initializeTools(toolRegistry: ToolRegistry, mcpInferencer?: any): Promise<void> {
    try {
      this.tools = await createRemixTools(this.plugin, toolRegistry, mcpInferencer)
      console.log(`[DeepAgentInferencer] Initialized ${this.tools.length} tools`)
    } catch (error) {
      console.warn('[DeepAgentInferencer] Failed to initialize tools:', error)
      this.tools = []
    }
  }

  /**
   * Get basic MCP tools and slither_scan for Security Auditor
   */
  private getBasicMcpToolsForSecurityAuditor(): DynamicStructuredTool[] {
    const basicToolNames = [
      // Basic file operations
      'file_read',
      'file_write',
      'file_create',
      'file_delete',
      'file_move',
      'file_copy',
      'directory_list',
      'file_exists',
      'file_replace',
      'read_file_chunk',
      'grep_file',
      // Security analysis
      'slither_scan'
    ]

    const basicTools = this.tools.filter(tool =>
      basicToolNames.includes(tool.name)
    )

    console.log(`[DeepAgentInferencer] Security Auditor tools: ${basicTools.map(t => t.name).join(', ')}`)
    return basicTools
  }

  /**
   * Get basic file tools for Gas Optimizer
   */
  private getBasicFileToolsForGasOptimizer(): DynamicStructuredTool[] {
    const basicFileToolNames = [
      // Basic file operations
      'file_read',
      'file_write',
      'file_create',
      'file_delete',
      'file_move',
      'file_copy',
      'directory_list',
      'file_exists',
      'file_replace',
      'read_file_chunk',
      'grep_file'
    ]

    const basicFileTools = this.tools.filter(tool =>
      basicFileToolNames.includes(tool.name)
    )

    console.log(`[DeepAgentInferencer] Gas Optimizer tools: ${basicFileTools.map(t => t.name).join(', ')}`)
    return basicFileTools
  }

  /**
   * Get coordination tools for Comprehensive Auditor
   * Note: Uses built-in task tool instead of custom invoke_subagent
   */
  private getCoordinationToolsForComprehensiveAuditor(): DynamicStructuredTool[] {
    const coordinationToolNames = [
      // Basic file operations
      'file_read',
      'file_write',
      'file_create',
      'file_delete',
      'file_move',
      'file_copy',
      'directory_list',
      'file_exists',
      'file_replace',
      'read_file_chunk',
      'grep_file',
      // Coordination tools (invoke_subagent removed - using built-in task tool)
      'verify_findings',
      'aggregate_findings',
      'resolve_conflicts'
    ]

    const coordinationTools = this.tools.filter(tool =>
      coordinationToolNames.includes(tool.name)
    )

    console.log(`[DeepAgentInferencer] Comprehensive Auditor tools: ${coordinationTools.map(t => t.name).join(', ')} + built-in task tool`)
    return coordinationTools
  }

  /**
   * Get education tools for Web3 Educator
   */
  private getEducationToolsForWeb3Educator(): DynamicStructuredTool[] {
    const educationToolNames = [
      // Basic file operations
      'file_read',
      'file_write',
      'file_create',
      'file_delete',
      'file_move',
      'file_copy',
      'directory_list',
      'file_exists',
      'file_replace',
      'read_file_chunk',
      'grep_file',
      // Tutorial tools
      'start_tutorial',
      'tutorials_list'
    ]

    const educationTools = this.tools.filter(tool =>
      educationToolNames.includes(tool.name)
    )

    console.log(`[DeepAgentInferencer] Web3 Educator tools: ${educationTools.map(t => t.name).join(', ')}`)
    return educationTools
  }

  /**
   * Create the appropriate model instance based on provider selection
   */
  private createModelInstance(proxyUrl: string): BaseChatModel {
    const { provider, modelId } = this.modelSelection

    switch (provider) {
    case 'mistralai': {
      console.log(`[DeepAgentInferencer] Creating MistralAI model: ${modelId}`)
      return new ChatMistralAI({
        apiKey: 'proxy-handled',
        model: modelId,
        temperature: 0.7,
        maxTokens: 4096,
        streaming: true,
        serverURL: `${proxyUrl}/mistral`
      })
    }

    case 'anthropic':
    default: {
      console.log(`[DeepAgentInferencer] Creating Anthropic model: ${modelId}`)
      return new ChatAnthropic({
        apiKey: 'proxy-handled',
        model: modelId,
        temperature: 0.7,
        maxTokens: 4096,
        streaming: true,
        clientOptions: {
          baseURL: proxyUrl
        }
      })
    }
    }
  }

  /**
   * Main code generation method
   */
  async code_generation(prompt: string, params: IParams): Promise<string> {
    this.event.emit('onInference')

    try {
      if (!this.agent) {
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      // Build messages
      const messages = [
        { role: 'system', content: REMIX_DEEPAGENT_SYSTEM_PROMPT + '\n\n' + SOLIDITY_CODE_GENERATION_PROMPT },
        { role: 'user', content: prompt }
      ]

      // Run the agent
      const response = await this.runAgent(messages, params)

      this.event.emit('onInferenceDone')
      return response
    } catch (error) {
      this.event.emit('onInferenceDone')
      return await this.handleError(error, 'code_generation', prompt, params)
    }
  }

  /**
   * Code explanation method
   */
  async code_explaining(prompt: string, context: string, params: IParams): Promise<string> {
    this.event.emit('onInference')

    try {
      if (!this.agent) {
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      const messages = [
        { role: 'system', content: REMIX_DEEPAGENT_SYSTEM_PROMPT + '\n\n' + CODE_EXPLANATION_PROMPT },
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${prompt}` }
      ]

      const response = await this.runAgent(messages, params)

      this.event.emit('onInferenceDone')
      return response
    } catch (error) {
      this.event.emit('onInferenceDone')
      return await this.handleError(error, 'code_explaining', prompt, params)
    }
  }

  /**
   * Answer questions method
   */
  async answer(prompt: string, params: IParams, context?: string): Promise<string> {
    this.event.emit('onInference')

    try {
      if (!this.agent) {
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }
      const chatHistory = buildChatPrompt()
      let messages = []

      if (chatHistory.length > 0) {
        messages = [
          ...chatHistory,
          { role: 'user', content: context ? `Context:\n${context}\n\nQuestion: ${prompt}` : prompt }
        ]
      } else {
        messages = [
          { role: 'system', content: REMIX_DEEPAGENT_SYSTEM_PROMPT },
          { role: 'user', content: context ? `Context:\n${context}\n\nQuestion: ${prompt}` : prompt }
        ]
      }
      console.log('[DeepAgentInferencer] Running answer with messages:')
      const responsePromise = this.runAgent(messages, params)

      responsePromise.then(response => {
        this.event.emit('onStreamComplete', response)
        this.event.emit('onInferenceDone')
      }).catch(error => {
        if (error?.name === 'AbortError' || error?.message?.includes('cancelled')) {
          console.log('[DeepAgentInferencer] Answer request was cancelled')
        } else {
          console.error('[DeepAgentInferencer] Answer error:', error)
        }
        this.event.emit('onInferenceDone')
      })

      return ''
    } catch (error) {
      this.event.emit('onInferenceDone')
      console.error(`[DeepAgentInferencer] Error in answer method:`, error)
      return await this.handleError(error, 'answer', prompt, params)
    }
  }

  /**
   * General generation method
   */
  async generate(prompt: string, params: IParams): Promise<string> {
    return this.code_generation(prompt, params)
  }

  /**
   * Workspace generation method
   */
  async generateWorkspace(prompt: string, params: IParams): Promise<string> {
    return this.code_generation(prompt, params)
  }

  /**
   * Error explanation method
   */
  async error_explaining(prompt: string, params: IParams): Promise<string> {
    return this.answer(prompt, params, '')
  }

  /**
   * Vulnerability check method
   */
  async vulnerability_check(prompt: string, params: IParams): Promise<string> {
    this.event.emit('onInference')

    try {
      if (!this.agent) {
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      const messages = [
        { role: 'system', content: REMIX_DEEPAGENT_SYSTEM_PROMPT + '\n\n' + SECURITY_ANALYSIS_PROMPT },
        { role: 'user', content: prompt }
      ]

      const response = await this.runAgent(messages, params)

      this.event.emit('onInferenceDone')
      return response
    } catch (error) {
      this.event.emit('onInferenceDone')
      return await this.handleError(error, 'vulnerability_check', prompt, params)
    }
  }

  /**
   * Code completion method (not supported by DeepAgent, falls back)
   */
  async code_completion(prompt: string, context: string, ctxFiles: any, fileName: string, params: IParams): Promise<any> {
    console.warn('[DeepAgentInferencer] code_completion not supported, using fallback')
    if (this.fallbackInferencer) {
      return this.fallbackInferencer.code_completion(prompt, context, ctxFiles, fileName, params)
    }
    return ''
  }

  /**
   * Code insertion method (not supported by DeepAgent, falls back)
   */
  async code_insertion(msg_pfx: string, msg_sfx: string, ctxFiles: any, fileName: string, params: IParams): Promise<any> {
    console.warn('[DeepAgentInferencer] code_insertion not supported, using fallback')
    if (this.fallbackInferencer) {
      return this.fallbackInferencer.code_insertion(msg_pfx, msg_sfx, ctxFiles, fileName, params)
    }
    return ''
  }

  /**
   * Run the DeepAgent with messages
   */
  private async runAgent(messages: any[], params: IParams): Promise<string> {
    this.currentAbortController = new AbortController()
    let fullResponse = ''

    try {
      const langchainMessages = messages
        .filter(msg => msg.role !== 'system')
        .map(msg => {
          if (msg.role === 'user') return new HumanMessage(msg.content)
          if (msg.role === 'assistant') return new AIMessage(msg.content)
          return new HumanMessage(msg.content)
        })

      // Tracking state for subagents and intermediate/final answers
      let isIntermediatePhase = true
      const activeSubagents: Map<string, { name: string; startTime: number }> = new Map()
      let previousRunId: string | null = null

      // https://docs.langchain.com/oss/python/deepagents/streaming
      const eventStream = this.agent.streamEvents(
        {
          messages: langchainMessages
        },
        {
          version: 'v2',
          configurable: {
            thread_id: `remix-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
          },
          subgraphs: true,
          signal: this.currentAbortController?.signal
        }
      )

      let finalMessageFromChain = ''
      for await (const event of eventStream) {
        if (this.currentAbortController?.signal.aborted) {
          this.event.emit('onStreamComplete', fullResponse)
          break
        }

        const eventType = event.event

        if (eventType === 'on_chain_start') {
          const runName = event.name || ''
          const tags = event.tags || []

          if (runName.includes('subagent') || tags.includes('subagent')) {
            const subagentName = event.metadata?.subagent_name || runName
            activeSubagents.set(event.run_id, { name: subagentName, startTime: Date.now() })
            console.log(`[DeepAgentInferencer] Subagent started: ${subagentName} (run_id: ${event.run_id})`)

            this.event.emit('onSubagentStart', {
              id: event.run_id,
              name: subagentName,
              task: event.data?.input?.task || 'Processing...',
              status: 'running'
            })
          }

          if (runName.includes('plan') || tags.includes('planning')) {
            console.log(`[DeepAgentInferencer] Planning phase started (run_id: ${event.run_id})`)
            this.event.emit('onTaskStart', {
              id: event.run_id,
              name: event.name || 'Planning',
              status: 'started'
            })
          }

          if (runName === 'final_response' || tags.includes('final')) {
            isIntermediatePhase = false
          }
        }

        if (eventType === 'on_chain_end' && activeSubagents.has(event.run_id)) {
          const subagent = activeSubagents.get(event.run_id)!
          const duration = Date.now() - subagent.startTime

          this.event.emit('onSubagentComplete', {
            id: event.run_id,
            name: subagent.name,
            status: 'completed',
            duration
          })
          activeSubagents.delete(event.run_id)
        }

        // Handle different event types from the stream
        if (eventType === 'on_chat_model_stream') {
          const chunk = event.data?.chunk
          if (chunk?.content) {
            // Extract delta content - handle different response formats
            let deltaContent = ''
            if (typeof chunk.content === 'string') {
              deltaContent = chunk.content
            } else if (Array.isArray(chunk.content) && chunk.content.length > 0) {
              // Handle array format (e.g., [{type: 'text', text: '...'}])
              if (chunk.content[0]?.text) {
                deltaContent = chunk.content[0].text
              } else if (typeof chunk.content[0] === 'string') {
                deltaContent = chunk.content[0]
              }
            }

            if (deltaContent) {
              const currentRunId = event.run_id
              if (previousRunId !== null && previousRunId !== currentRunId) {
                deltaContent = '\n \n---\n' + deltaContent
              }
              previousRunId = currentRunId

              fullResponse += deltaContent
              this.event.emit('onStreamResult', {
                content: deltaContent,
                isIntermediate: isIntermediatePhase,
                source: event.metadata?.langgraph_node || 'agent'
              })
            }
          }
        } else if (eventType === 'on_chain_end') {
          const output = event.data?.output
          if (output?.messages && output.messages.length > 0) {
            const lastMessage = output.messages[output.messages.length - 1]
            if (lastMessage.content && typeof lastMessage.content === 'string') {
              finalMessageFromChain = lastMessage.content
            }
          }
        } else if (eventType === 'on_tool_start') {
          // Tool execution started - emit onToolCall event
          const toolName = event.name
          const toolInput = event.data?.input || {}
          console.log('[DeepAgentInferencer] Tool call started:', toolName, toolInput)
          this.event.emit('onToolCall', { toolName, toolInput, status: 'start' })
        } else if (eventType === 'on_tool_end') {
          const toolName = event.name
          console.log('[DeepAgentInferencer] Tool call ended:', toolName)
          // let the tool callback for while
          //this.event.emit('onToolCall', { toolName, toolOutput, status: 'end' })
        }
      }

      // Use final message from chain if available and longer than accumulated chunks
      // This handles cases where streaming might miss some content
      if (finalMessageFromChain && finalMessageFromChain.length > fullResponse.length) {
        console.log('[DeepAgentInferencer] Using chain final message as it is more complete')
        fullResponse = finalMessageFromChain
      }

      console.log('[DeepAgentInferencer] Stream complete, full response length:', fullResponse.length)
      return fullResponse
    } catch (error: any) {
      if (error?.name === 'AbortError' || this.currentAbortController?.signal.aborted) {
        console.log('[DeepAgentInferencer] Request cancelled by user')
        return fullResponse
      }
      console.error('[DeepAgentInferencer] Error during agent execution:', error)
      throw error
    } finally {
      this.currentAbortController = null
      this.event.emit('onToolCall', { toolName:'', toolInput:'', status: 'end' })
    }
  }

  /**
   * Recreate agent with selected tools
   */
  private async createAgentWithTools(selectedTools: DynamicStructuredTool[]): Promise<void> {
    try {
      const { createDeepAgent } = await import('deepagents')

      const checkpointer = new MemorySaver()

      // Create agent configuration with selected tools
      const agentConfig: any = {
        backend: this.filesystemBackend,
        tools: selectedTools,
        model: this.model,
        systemPrompt: REMIX_DEEPAGENT_SYSTEM_PROMPT,
        skills: ["skills/"],
        checkpointer
      }

      if (this.config.enableSubagents) {
        const etherscanTools = this.toolSelector ?
          this.toolSelector.getEtherscanTools() : []
        const theGraphTools = this.toolSelector ?
          this.toolSelector.getTheGraphTools() : []
        const alchemyTools = this.toolSelector ?
          this.toolSelector.getAlchemyTools() : []

        const basicMcpTools = this.getBasicMcpToolsForSecurityAuditor()
        const basicFileTools = this.getBasicFileToolsForGasOptimizer()
        const coordinationTools = this.getCoordinationToolsForComprehensiveAuditor()
        const educationTools = this.getEducationToolsForWeb3Educator()

        const generalTools = this.toolSelector ?
          this.toolSelector.filterOutSpecialistTools(this.tools) : this.tools

        agentConfig.subagents = [
          {
            name: 'Security Auditor',
            systemPrompt: SECURITY_AUDITOR_SUBAGENT_PROMPT,
            model: this.model,
            tools: basicMcpTools,
            backend: this.filesystemBackend
          },
          {
            name: 'Gas Optimizer',
            systemPrompt: GAS_OPTIMIZER_SUBAGENT_PROMPT,
            model: this.model,
            tools: basicFileTools,
            backend: this.filesystemBackend
          },
          {
            name: 'Code Reviewer',
            systemPrompt: CODE_REVIEWER_SUBAGENT_PROMPT,
            model: this.model,
            tools: generalTools,
            backend: this.filesystemBackend
          },
          {
            name: 'Comprehensive Auditor',
            systemPrompt: COMPREHENSIVE_AUDITOR_SUBAGENT_PROMPT,
            model: this.model,
            tools: coordinationTools,
            backend: this.filesystemBackend
          },
          {
            name: 'Web3 Educator',
            systemPrompt: WEB3_EDUCATOR_SUBAGENT_PROMPT,
            model: this.model,
            tools: educationTools,
            backend: this.filesystemBackend
          },
          {
            name: 'Frontend Specialist',
            systemPrompt: FRONTEND_SPECIALIST_SUBAGENT_PROMPT,
            model: this.model,
            tools: generalTools,
            backend: this.filesystemBackend
          },
          {
            name: 'Etherscan Specialist',
            systemPrompt: ETHERSCAN_SUBAGENT_PROMPT,
            model: this.model,
            tools: etherscanTools,
            backend: this.filesystemBackend
          },
          {
            name: 'TheGraph Specialist',
            systemPrompt: THEGRAPH_SUBAGENT_PROMPT,
            model: this.model,
            tools: theGraphTools,
            backend: this.filesystemBackend
          },
          {
            name: 'Alchemy Specialist',
            systemPrompt: ALCHEMY_SUBAGENT_PROMPT,
            model: this.model,
            tools: alchemyTools,
            backend: this.filesystemBackend
          }
        ]
      }

      if (this.memoryBackend) {
        agentConfig.store = this.memoryBackend
      }

      let enhancedSystemPrompt = REMIX_DEEPAGENT_SYSTEM_PROMPT
      if (this.toolSelector) {
        const toolInventoryPrompt = this.toolSelector.generateToolInventoryPrompt(selectedTools)
        enhancedSystemPrompt += toolInventoryPrompt
      }
      agentConfig.systemPrompt = enhancedSystemPrompt

      this.agent = createDeepAgent(agentConfig)

      console.log(`[DeepAgentInferencer] Recreated agent with ${selectedTools.length} selected tools`)
    } catch (error) {
      console.error('[DeepAgentInferencer] Failed to recreate agent with selected tools:', error)
    }
  }

  /**
   * Handle errors with fallback strategy
   */
  private async handleError(error: any, method: string, prompt: string, params: IParams): Promise<string> {
    console.error(`[DeepAgentInferencer] Error in ${method}:`, error)

    // Categorize error
    let errorType = DeepAgentErrorType.UNKNOWN
    if (error.message?.includes('context_length_exceeded')) {
      errorType = DeepAgentErrorType.CONTEXT_LENGTH_EXCEEDED
    } else if (error.message?.includes('tool_execution_failed')) {
      errorType = DeepAgentErrorType.TOOL_EXECUTION_FAILED
    } else if (error.message?.includes('API key')) {
      errorType = DeepAgentErrorType.API_KEY_INVALID
    } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
      errorType = DeepAgentErrorType.NETWORK_ERROR
    }

    // Try fallback to RemoteInferencer
    if (this.fallbackInferencer) {
      console.log(`[DeepAgentInferencer] Falling back to RemoteInferencer for ${method}`)
      this.event.emit('deepAgentFallback', { method, error: error.message, errorType })

      try {
        switch (method) {
        case 'code_generation':
          return await this.fallbackInferencer.code_generation(prompt, params)
        case 'code_explaining':
          return await this.fallbackInferencer.code_explaining(prompt, '', params)
        case 'answer':
          return await this.fallbackInferencer.answer(prompt, params)
        case 'vulnerability_check':
          return await this.fallbackInferencer.vulnerability_check(prompt, params)
        default:
          return await this.fallbackInferencer.generate(prompt, params)
        }
      } catch (fallbackError) {
        console.error('[DeepAgentInferencer] Fallback also failed:', fallbackError)
      }
    }

    // Return error message
    return `Error: ${error.message || 'An unexpected error occurred'}`
  }

  /**
   * Cancel current request
   */
  cancelRequest(): void {
    if (this.currentAbortController) {
      console.log('[DeepAgentInferencer] Cancelling request...')
      this.currentAbortController.abort()
      this.currentAbortController = null
      this.event.emit('onInferenceDone')
    }
  }

  /**
   * Close connections and cleanup
   */
  async close(): Promise<void> {
    if (this.memoryBackend) {
      this.memoryBackend.close()
    }
    this.agent = null
    this.model = null
    this.toolSelector = null
  }

  /**
   * Get event emitter
   */
  getEventEmitter(): EventEmitter {
    return this.event
  }

  /**
   * Check if DeepAgent is ready
   */
  isReady(): boolean {
    return this.agent !== null
  }
}
