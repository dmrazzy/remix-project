/**
 * Tool UI Strings Types and Helpers
 * Common types and utility functions for tool UI string resolution
 */

export type ToolUIStringResolver = (args: Record<string, any>) => string

export interface ToolUIStringRegistry {
  [toolName: string]: ToolUIStringResolver
}

/**
 * Extract filename from a path
 */
export function getFileName(path: string): string {
  return path.split('/').pop() || path
}

/**
 * Truncate an address for display
 */
export function truncateAddress(address: string): string {
  if (address.length <= 13) return address
  return `${address.substring(0, 10)}...`
}

/**
 * Format tool name for display (fallback)
 */
export function formatToolName(toolName: string): string {
  return toolName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim()
}
