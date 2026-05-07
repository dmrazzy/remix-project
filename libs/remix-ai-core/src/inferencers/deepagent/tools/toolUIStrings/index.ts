/**
 * Tool UI Strings Registry
 * Unified registry for resolving tool UI strings
 */

import { ToolUIStringRegistry, formatToolName } from './types'
import { fileToolStrings } from './fileToolStrings'
import { compilationToolStrings } from './compilationToolStrings'
import { deploymentToolStrings } from './deploymentToolStrings'
import { debuggingToolStrings } from './debuggingToolStrings'
import { utilityToolStrings } from './utilityToolStrings'

// Merge all tool string registries
const toolStringRegistry: ToolUIStringRegistry = {
  ...fileToolStrings,
  ...compilationToolStrings,
  ...deploymentToolStrings,
  ...debuggingToolStrings,
  ...utilityToolStrings
}

/**
 * Resolve a UI string for a tool invocation
 * @param toolName - The name of the tool
 * @param toolInput - Optional input arguments for the tool
 * @returns A human-readable string describing the tool operation
 */
export function resolveToolUIString(toolName: string, toolInput?: Record<string, any>): string {
  const args = toolInput || {}

  // Special case: call_tool wraps another tool
  if (toolName === 'call_tool' && args.toolName) {
    return resolveToolUIString(args.toolName, args.arguments)
  }

  // Look up in registry
  const resolver = toolStringRegistry[toolName]
  if (resolver) {
    return resolver(args)
  }

  // Fallback: format tool name
  const formattedName = formatToolName(toolName)
  return `${formattedName.charAt(0).toUpperCase() + formattedName.slice(1)}...`
}

// Re-export types
export { ToolUIStringRegistry, getFileName, truncateAddress, formatToolName } from './types'
