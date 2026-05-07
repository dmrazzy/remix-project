/**
 * DeepAgent Module
 * Main entry point for the DeepAgent inferencer system
 *
 * This module provides:
 * - DeepAgentInferencer: Main agent for AI-powered Solidity development
 * - RemixFilesystemBackend: Filesystem abstraction for Remix IDE
 * - Tool adapters: Convert Remix MCP tools to LangChain format
 * - Prompts: System and subagent prompts
 * - Helpers: Utility functions for analysis and selection
 * - Constants: Configuration values
 */

// ============================================================================
// Core Classes
// ============================================================================

export { DeepAgentInferencer } from './DeepAgentInferencer'
export { RemixFilesystemBackend } from './RemixFilesystemBackend'

// ============================================================================
// Tool Adapters (from ./tools)
// ============================================================================

export {
  RemixToolAdapter,
  ToolApprovalGate,
  createRemixTools,
  jsonSchemaToZod,
  mcpResultToString,
  resolveToolUIString
} from './tools'

// ============================================================================
// Prompts (from ./prompts)
// ============================================================================

// System prompts
export {
  REMIX_DEEPAGENT_SYSTEM_PROMPT,
  SOLIDITY_CODE_GENERATION_PROMPT,
  SECURITY_ANALYSIS_PROMPT,
  CODE_EXPLANATION_PROMPT
} from './prompts'

// Subagent prompts
export {
  SECURITY_AUDITOR_SUBAGENT_PROMPT,
  CODE_REVIEWER_SUBAGENT_PROMPT,
  GAS_OPTIMIZER_SUBAGENT_PROMPT,
  COMPREHENSIVE_AUDITOR_SUBAGENT_PROMPT,
  FRONTEND_SPECIALIST_SUBAGENT_PROMPT,
  ETHERSCAN_SUBAGENT_PROMPT,
  THEGRAPH_SUBAGENT_PROMPT,
  ALCHEMY_SUBAGENT_PROMPT,
  WEB3_EDUCATOR_SUBAGENT_PROMPT
} from './prompts'

// ============================================================================
// Constants (from ./constants)
// ============================================================================

export {
  // Token and timeout configuration
  DAPP_MAX_TOKENS,
  INACTIVITY_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  MAX_TOOL_EXECUTIONS,

  // Model configuration
  DEFAULT_MODEL_PROVIDER,
  DEFAULT_MODEL_ID,
  SUPPORTED_PROVIDERS,

  // Session configuration
  SESSION_THREAD_PREFIX,
  CONVERSATION_THREAD_PREFIX,

  // Prompt analysis configuration
  COMPLEXITY_WORD_COUNT_THRESHOLD,
  SECURITY_KEYWORDS,
  COMPLEXITY_INDICATORS,

  // Memory backend configuration
  MEMORY_BACKEND_TYPES,
  DEFAULT_MEMORY_BACKEND,
  DEEPAGENT_MEMORY_DB_NAME,

  // Tool categories
  SAFE_TOOL_CATEGORIES,
  RISKY_TOOL_CATEGORIES,

  // Subagent configuration
  MAX_SECURITY_FINDINGS_PER_FILE,
  MAX_GAS_OPTIMIZATIONS_PER_FILE,
  MAX_CODE_IMPROVEMENTS_PER_FILE,
  MIN_CONFIDENCE_THRESHOLD,

  // LocalStorage keys
  LOCAL_STORAGE_KEYS,

  // Types
  type SupportedProvider,
  type MemoryBackendType
} from './constants'

// ============================================================================
// Helpers (from ./helpers)
// ============================================================================

// Subagent tool filters
export {
  getBasicMcpToolsForSecurityAuditor,
  getBasicFileToolsForGasOptimizer,
  getCoordinationToolsForComprehensiveAuditor,
  getEducationToolsForWeb3Educator
} from './helpers/subagentToolFilters'

// Prompt analysis
export {
  analyzePromptForAutoSelection,
  hasSecurityKeywords,
  countComplexityIndicators,
  type PromptComplexity
} from './helpers/promptAnalysis'

// Model selection
export {
  selectOptimalModel,
  getDefaultModelSelection
} from './helpers/modelSelection'

// ============================================================================
// Model Factory
// ============================================================================

export { createModelInstance } from './ModelFactory'

// ============================================================================
// Subagent Configuration
// ============================================================================

export { buildSubagentConfigs, type SubagentConfigItem } from './SubagentConfig'

// ============================================================================
// Stream Event Handler
// ============================================================================

export { StreamEventHandler, type TokenUsageState, type StreamProcessingResult } from './StreamEventHandler'

// ============================================================================
// Inactivity Timeout Manager
// ============================================================================

export { InactivityTimeoutManager } from './InactivityTimeoutManager'
