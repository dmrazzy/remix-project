import type { DynamicStructuredTool } from '@langchain/core/tools'
import { IAutoModelConfig, ModelSelection } from '../../types/deepagent'

export function getBasicMcpToolsForSecurityAuditor(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const basicToolNames = [
    'slither_scan'
  ]

  const basicTools = tools.filter(tool =>
    basicToolNames.includes(tool.name)
  )
  return basicTools
}

export function getBasicFileToolsForGasOptimizer(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const basicFileToolNames: string[] = []

  const basicFileTools = tools.filter(tool =>
    basicFileToolNames.includes(tool.name)
  )
  return basicFileTools
}

export function getCoordinationToolsForComprehensiveAuditor(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const coordinationToolNames: string[] = [
  ]

  const coordinationTools = tools.filter(tool =>
    coordinationToolNames.includes(tool.name)
  )
  return coordinationTools
}

export function getEducationToolsForWeb3Educator(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const educationToolNames = [
    'start_tutorial',
    'tutorials_list'
  ]

  const educationTools = tools.filter(tool =>
    educationToolNames.includes(tool.name)
  )
  return educationTools
}

export function analyzePromptForAutoSelection(prompt: string): 'simple' | 'complex' {
  const complexityIndicators = [
    'audit', 'security', 'vulnerability', 'exploit', 'attack', 'malicious',
    'comprehensive', 'detailed', 'analyze', 'review', 'optimize',
    'refactor', 'architecture', 'design pattern', 'best practice',
    'multi-step', 'complex', 'advanced', 'sophisticated'
  ]

  const securityKeywords = [
    'security', 'audit', 'vulnerability', 'exploit', 'attack', 'malicious',
    'reentrancy', 'overflow', 'underflow', 'access control', 'authorization',
    'authentication', 'privilege', 'permission', 'dos', 'denial of service'
  ]

  const lowerPrompt = prompt.toLowerCase()

  const complexityCount = complexityIndicators.filter(keyword =>
    lowerPrompt.includes(keyword)
  ).length

  const securityCount = securityKeywords.filter(keyword =>
    lowerPrompt.includes(keyword)
  ).length

  const wordCount = prompt.split(/\s+/).length
  const hasMultipleQuestions = (prompt.match(/\?/g) || []).length > 1
  const hasCodeBlocks = /```[\s\S]*?```/.test(prompt)

  // Determine complexity based on multiple factors
  if (securityCount > 0 || complexityCount >= 2 || wordCount > 100 ||
      hasMultipleQuestions || hasCodeBlocks) {
    return 'complex'
  }

  return 'simple'
}

export function selectOptimalModel(prompt: string, context?: string, autoModeConfig?: IAutoModelConfig, currentModelSelection?: ModelSelection, allowedModels: string[] = []): ModelSelection {
  // If auto mode is disabled, use current selection
  if (!autoModeConfig?.enabled || !currentModelSelection) {
    return currentModelSelection || {
      provider: 'mistralai',
      modelId: 'mistral-medium-latest'
    }
  }

  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt
  const complexity = analyzePromptForAutoSelection(fullPrompt)
  const securityKeywords = autoModeConfig.securityKeywords || [
    'security', 'audit', 'vulnerability', 'exploit', 'attack'
  ]

  const hasSecurityKeywords = securityKeywords.some(keyword =>
    fullPrompt.toLowerCase().includes(keyword)
  )

  console.log(`[DeepAgentInferencer] Auto selection analysis:`, {
    complexity,
    hasSecurityKeywords,
    promptLength: fullPrompt.length
  })

  // Decision logic: complex tasks or security-related → Claude, simple → Mistral
  if (complexity === 'complex' || hasSecurityKeywords) {
    console.log('[DeepAgentInferencer] Selected Anthropic Claude for complex/security task')
    const modelId = allowedModels.find(model => model.includes('sonnet'))
    if (modelId) {
      return {
        provider: 'anthropic',
        modelId
      }
    } else {
      console.warn('[DeepAgentInferencer] Preferred Claude model not available, falling back to Mistral')
      return {
        provider: 'mistralai',
        modelId: allowedModels.find(model => model.includes('mistral-medium')) || 'mistral-medium-latest'
      }
    }
  } else {
    console.log('[DeepAgentInferencer] Selected Mistral for simple task')
    return {
      provider: 'mistralai',
      modelId: allowedModels.find(model => model.includes('mistral-medium')) || 'mistral-medium-latest'
    }
  }
}
