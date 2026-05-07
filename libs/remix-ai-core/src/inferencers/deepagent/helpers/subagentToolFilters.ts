import type { DynamicStructuredTool } from '@langchain/core/tools'

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
