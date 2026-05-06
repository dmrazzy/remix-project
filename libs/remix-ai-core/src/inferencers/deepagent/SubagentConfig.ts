import type { DynamicStructuredTool } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ToolSelector } from './ToolSelector'
import {
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
import {
  getBasicMcpToolsForSecurityAuditor,
  getBasicFileToolsForGasOptimizer,
  getCoordinationToolsForComprehensiveAuditor,
  getEducationToolsForWeb3Educator
} from './helpers'

export interface SubagentConfigItem {
  name: string
  systemPrompt: string
  model: BaseChatModel
  tools: DynamicStructuredTool[]
  backend: any
}

export function buildSubagentConfigs(
  tools: DynamicStructuredTool[],
  toolSelector: ToolSelector | null,
  model: BaseChatModel,
  filesystemBackend: any
): SubagentConfigItem[] {
  const etherscanTools = toolSelector?.getEtherscanTools() ?? []
  const theGraphTools = toolSelector?.getTheGraphTools() ?? []
  const alchemyTools = toolSelector?.getAlchemyTools() ?? []

  const basicMcpTools = getBasicMcpToolsForSecurityAuditor(tools)
  const basicFileTools = getBasicFileToolsForGasOptimizer(tools)
  const coordinationTools = getCoordinationToolsForComprehensiveAuditor(tools)
  const educationTools = getEducationToolsForWeb3Educator(tools)

  const generalTools = toolSelector
    ? toolSelector.filterOutSpecialistTools(tools)
    : tools

  return [
    {
      name: 'Security Auditor',
      systemPrompt: SECURITY_AUDITOR_SUBAGENT_PROMPT,
      model,
      tools: basicMcpTools,
      backend: filesystemBackend
    },
    {
      name: 'Gas Optimizer',
      systemPrompt: GAS_OPTIMIZER_SUBAGENT_PROMPT,
      model,
      tools: basicFileTools,
      backend: filesystemBackend
    },
    {
      name: 'Code Reviewer',
      systemPrompt: CODE_REVIEWER_SUBAGENT_PROMPT,
      model,
      tools: generalTools,
      backend: filesystemBackend
    },
    {
      name: 'Comprehensive Auditor',
      systemPrompt: COMPREHENSIVE_AUDITOR_SUBAGENT_PROMPT,
      model,
      tools: coordinationTools,
      backend: filesystemBackend
    },
    {
      name: 'Web3 Educator',
      systemPrompt: WEB3_EDUCATOR_SUBAGENT_PROMPT,
      model,
      tools: educationTools,
      backend: filesystemBackend
    },
    {
      name: 'Frontend Specialist',
      systemPrompt: FRONTEND_SPECIALIST_SUBAGENT_PROMPT,
      model,
      tools: generalTools,
      backend: filesystemBackend
    },
    {
      name: 'Etherscan Specialist',
      systemPrompt: ETHERSCAN_SUBAGENT_PROMPT,
      model,
      tools: etherscanTools,
      backend: filesystemBackend
    },
    {
      name: 'TheGraph Specialist',
      systemPrompt: THEGRAPH_SUBAGENT_PROMPT,
      model,
      tools: theGraphTools,
      backend: filesystemBackend
    },
    {
      name: 'Alchemy Specialist',
      systemPrompt: ALCHEMY_SUBAGENT_PROMPT,
      model,
      tools: alchemyTools,
      backend: filesystemBackend
    }
  ]
}
