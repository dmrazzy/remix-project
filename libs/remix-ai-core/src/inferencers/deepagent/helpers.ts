import type { DynamicStructuredTool } from '@langchain/core/tools'

/**
  * Get basic MCP tools and slither_scan for Security Auditor
  */
export function getBasicMcpToolsForSecurityAuditor(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
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

  const basicTools = tools.filter(tool =>
    basicToolNames.includes(tool.name)
  )
  return basicTools
}

/**
  * Get basic file tools for Gas Optimizer
  */
export function getBasicFileToolsForGasOptimizer(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
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

  const basicFileTools = tools.filter(tool =>
    basicFileToolNames.includes(tool.name)
  )
  return basicFileTools
}

/**
   * Get coordination tools for Comprehensive Auditor
   * Note: Uses built-in task tool instead of custom invoke_subagent
   */
export function getCoordinationToolsForComprehensiveAuditor(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
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

  const coordinationTools = tools.filter(tool =>
    coordinationToolNames.includes(tool.name)
  )
  return coordinationTools
}

/**
   * Get education tools for Web3 Educator
   */
export function getEducationToolsForWeb3Educator(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
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

  const educationTools = tools.filter(tool =>
    educationToolNames.includes(tool.name)
  )
  return educationTools
}