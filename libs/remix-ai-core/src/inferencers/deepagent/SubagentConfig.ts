import type { DynamicStructuredTool } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
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
} from './prompts/system/lightPrompts'
import {
  getBasicMcpToolsForSecurityAuditor,
  getBasicFileToolsForGasOptimizer,
  getCoordinationToolsForComprehensiveAuditor,
  getEducationToolsForWeb3Educator,
  getDebugToolsForDebugSpecialist,
  getSolidityToolsForSolidityEngineer,
  getWebSearchToolsForWebSearchSpecialist,
  getConversionToolsForConversionSpecialist,
  getEtherscanToolsForEtherscanSpecialist,
  getAlchemyToolsForAlchemySpecialist,
  getTheGraphToolsForTheGraphSpecialist
} from './helpers/subagentToolFilters'
import { CONVERSION_UTILITIES_SUBAGENT_PROMPT, DEBUG_SPECIALIST_SUBAGENT_PROMPT, SOLIDITY_ENGINEER_SUBAGENT_PROMPT, WEB_SEARCH_SUBAGENT_PROMPT } from './prompts/system/lightPrompts'

export interface SubagentConfigItem {
  name: string
  systemPrompt: string
  model: BaseChatModel
  tools: DynamicStructuredTool[]
  backend: any
}

export function buildSubagentConfigs(
  tools: DynamicStructuredTool[],
  model: BaseChatModel,
  filesystemBackend: any
): SubagentConfigItem[] {
  const etherscanTools = getEtherscanToolsForEtherscanSpecialist(tools)
  const theGraphTools = getTheGraphToolsForTheGraphSpecialist(tools)
  const alchemyTools = getAlchemyToolsForAlchemySpecialist(tools)
  const basicMcpTools = getBasicMcpToolsForSecurityAuditor(tools)
  const basicFileTools = getBasicFileToolsForGasOptimizer(tools)
  const coordinationTools = getCoordinationToolsForComprehensiveAuditor(tools)
  const educationTools = getEducationToolsForWeb3Educator(tools)
  const debugTools = getDebugToolsForDebugSpecialist(tools)
  const solidityTools = getSolidityToolsForSolidityEngineer(tools)
  const webSearchTools = getWebSearchToolsForWebSearchSpecialist(tools)
  const conversionTools = getConversionToolsForConversionSpecialist(tools)

  return [
    {
      name: 'Solidity Engineer',
      systemPrompt: SOLIDITY_ENGINEER_SUBAGENT_PROMPT,
      model,
      tools: solidityTools,
      backend: filesystemBackend
    },
    {
      name: 'Web Search Specialist',
      systemPrompt: WEB_SEARCH_SUBAGENT_PROMPT,
      model,
      tools: webSearchTools,
      backend: filesystemBackend
    },
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
      tools: [],
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
      tools: [],
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
    },
    {
      name: 'Debug Specialist',
      systemPrompt: DEBUG_SPECIALIST_SUBAGENT_PROMPT,
      model,
      tools: debugTools,
      backend: filesystemBackend
    },
    {
      name: 'Conversion Utilities Specialist',
      systemPrompt: CONVERSION_UTILITIES_SUBAGENT_PROMPT,
      model,
      tools: conversionTools,
      backend: filesystemBackend
    }
  ]
}
