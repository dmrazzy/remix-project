/**
 * DeepAgent configuration interface
 */
export interface IDeepAgentConfig {
  enabled: boolean
  apiKey: string // Automatically set to 'proxy-handled' - proxy server manages the real API key
  memoryBackend: 'state' | 'store'
  maxToolExecutions: number
  timeout: number
  enableSubagents: boolean
  enablePlanning: boolean
}

/**
 * DeepAgent plan structure
 */
export interface IDeepAgentPlan {
  todos: IDeepAgentTodo[]
  createdAt: number
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
}

/**
 * Individual todo item in a DeepAgent plan
 */
export interface IDeepAgentTodo {
  id: string
  task: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  assignedTo?: string
  result?: string
  error?: string
}

/**
 * Subagent information
 */
export interface ISubagentInfo {
  id: string
  parentId: string
  task: string
  status: 'spawned' | 'running' | 'completed' | 'failed'
  startedAt: number
  completedAt?: number
  result?: any
  error?: string
}

/**
 * DeepAgent stream response
 */
export interface IDeepAgentStreamResponse {
  type: 'content' | 'tool_use' | 'plan' | 'subagent' | 'error'
  content?: string
  toolName?: string
  toolInput?: any
  toolOutput?: any
  plan?: IDeepAgentPlan
  subagent?: ISubagentInfo
  error?: string
}

/**
 * DeepAgent error types
 */
export enum DeepAgentErrorType {
  CONTEXT_LENGTH_EXCEEDED = 'context_length_exceeded',
  TOOL_EXECUTION_FAILED = 'tool_execution_failed',
  API_KEY_INVALID = 'api_key_invalid',
  INITIALIZATION_FAILED = 'initialization_failed',
  NETWORK_ERROR = 'network_error',
  UNKNOWN = 'unknown'
}

/**
 * DeepAgent error class
 */
export class DeepAgentError extends Error {
  type: DeepAgentErrorType
  details?: any

  constructor(message: string, type: DeepAgentErrorType, details?: any) {
    super(message)
    this.name = 'DeepAgentError'
    this.type = type
    this.details = details
  }
}
