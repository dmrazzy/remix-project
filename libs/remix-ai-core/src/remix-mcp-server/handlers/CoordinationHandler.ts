/**
 * Coordination Tool Handlers for Multi-Agent Orchestration
 */

import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';

/**
 * Aggregate Findings Tool Handler
 */
export class AggregateFindingsHandler extends BaseToolHandler {
  name = 'aggregate_findings';
  description = 'Merge and organize results from multiple subagents';
  inputSchema = {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source_agent: {
              type: 'string',
              description: 'Which subagent generated this finding'
            },
            type: {
              type: 'string',
              enum: ['security', 'gas_optimization', 'code_quality'],
              description: 'Type of finding'
            },
            severity: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low', 'info'],
              description: 'Severity level'
            },
            title: {
              type: 'string',
              description: 'Finding title'
            },
            description: {
              type: 'string',
              description: 'Detailed description'
            },
            location: {
              type: 'string',
              description: 'File location (file:line)'
            },
            recommendation: {
              type: 'string',
              description: 'Recommended action'
            },
            impact: {
              type: 'string',
              description: 'Expected impact of the issue'
            }
          },
          required: ['source_agent', 'type', 'severity', 'title', 'description']
        },
        description: 'Array of findings from different subagents'
      },
      consolidate_duplicates: {
        type: 'boolean',
        description: 'Whether to merge similar findings',
        default: true
      }
    },
    required: ['findings']
  };

  getPermissions(): string[] {
    return ['coordination:aggregate'];
  }

  validate(args: { findings: any[]; consolidate_duplicates?: boolean }): boolean | string {
    const required = this.validateRequired(args, ['findings']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      findings: 'object',
      consolidate_duplicates: 'boolean'
    });
    if (types !== true) return types;

    if (!Array.isArray(args.findings)) {
      return 'findings must be an array';
    }

    return true;
  }

  async execute(args: { findings: any[]; consolidate_duplicates?: boolean }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const consolidate = args.consolidate_duplicates !== false;
      
      // Organize findings by type and severity
      const organized: Record<string, Record<string, any[]>> = {
        security: { critical: [], high: [], medium: [], low: [], info: [] },
        gas_optimization: { critical: [], high: [], medium: [], low: [], info: [] },
        code_quality: { critical: [], high: [], medium: [], low: [], info: [] }
      };

      // Sort findings into categories
      for (const finding of args.findings) {
        const type = finding.type || 'code_quality';
        const severity = finding.severity || 'medium';
        
        if (organized[type] && organized[type][severity]) {
          organized[type][severity].push(finding);
        }
      }

      // Consolidate duplicates if requested
      let duplicatesRemoved = 0;
      if (consolidate) {
        for (const type of Object.keys(organized)) {
          for (const severity of Object.keys(organized[type])) {
            const originalCount = organized[type][severity].length;
            organized[type][severity] = this.removeDuplicateFindings(organized[type][severity]);
            duplicatesRemoved += originalCount - organized[type][severity].length;
          }
        }
      }

      // Calculate summary statistics
      const stats = {
        total_findings: args.findings.length,
        duplicates_removed: duplicatesRemoved,
        unique_findings: args.findings.length - duplicatesRemoved,
        by_type: {
          security: this.countFindings(organized.security),
          gas_optimization: this.countFindings(organized.gas_optimization),
          code_quality: this.countFindings(organized.code_quality)
        },
        by_severity: {
          critical: this.countBySeverity(organized, 'critical'),
          high: this.countBySeverity(organized, 'high'),
          medium: this.countBySeverity(organized, 'medium'),
          low: this.countBySeverity(organized, 'low'),
          info: this.countBySeverity(organized, 'info')
        }
      };

      const result = {
        success: true,
        organized_findings: organized,
        statistics: stats,
        consolidation_performed: consolidate,
        timestamp: new Date().toISOString()
      };

      return this.createSuccessResult(result);
    } catch (error: any) {
      return this.createErrorResult(`Failed to aggregate findings: ${error?.message || error}`);
    }
  }

  private removeDuplicateFindings(findings: any[]): any[] {
    const seen = new Set();
    return findings.filter(finding => {
      const key = `${finding.title}:${finding.location}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private countFindings(severityGroup: Record<string, any[]>): number {
    return Object.values(severityGroup).reduce((total, findings) => total + findings.length, 0);
  }

  private countBySeverity(organized: Record<string, Record<string, any[]>>, severity: string): number {
    return Object.values(organized).reduce((total, typeGroup) => {
      return total + (typeGroup[severity]?.length || 0);
    }, 0);
  }
}

/**
 * Resolve Conflicts Tool Handler
 */
export class ResolveConflictsHandler extends BaseToolHandler {
  name = 'resolve_conflicts';
  description = 'Handle conflicting recommendations between subagents using predefined rules';
  inputSchema = {
    type: 'object',
    properties: {
      conflicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            conflict_id: {
              type: 'string',
              description: 'Unique identifier for this conflict'
            },
            agents: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Subagents involved in the conflict'
            },
            recommendations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  agent: {
                    type: 'string',
                    description: 'Source subagent'
                  },
                  recommendation: {
                    type: 'string',
                    description: 'The conflicting recommendation'
                  },
                  reasoning: {
                    type: 'string',
                    description: 'Why this recommendation was made'
                  },
                  priority: {
                    type: 'string',
                    enum: ['security', 'performance', 'maintainability'],
                    description: 'Primary concern driving this recommendation'
                  }
                }
              }
            },
            location: {
              type: 'string',
              description: 'Code location where conflict occurs'
            }
          },
          required: ['conflict_id', 'agents', 'recommendations']
        },
        description: 'Array of conflicts to resolve'
      },
      resolution_strategy: {
        type: 'string',
        enum: ['security_first', 'balanced', 'performance_first'],
        description: 'Strategy for resolving conflicts',
        default: 'security_first'
      }
    },
    required: ['conflicts']
  };

  getPermissions(): string[] {
    return ['coordination:resolve'];
  }

  validate(args: { conflicts: any[]; resolution_strategy?: string }): boolean | string {
    const required = this.validateRequired(args, ['conflicts']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      conflicts: 'object',
      resolution_strategy: 'string'
    });
    if (types !== true) return types;

    if (!Array.isArray(args.conflicts)) {
      return 'conflicts must be an array';
    }

    return true;
  }

  async execute(args: { conflicts: any[]; resolution_strategy?: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const strategy = args.resolution_strategy || 'security_first';
      const resolutions = [];

      for (const conflict of args.conflicts) {
        const resolution = this.resolveConflict(conflict, strategy);
        resolutions.push(resolution);
      }

      const result = {
        success: true,
        resolution_strategy: strategy,
        resolutions: resolutions,
        total_conflicts: args.conflicts.length,
        resolved_count: resolutions.length,
        timestamp: new Date().toISOString()
      };

      return this.createSuccessResult(result);
    } catch (error: any) {
      return this.createErrorResult(`Failed to resolve conflicts: ${error?.message || error}`);
    }
  }

  private resolveConflict(conflict: any, strategy: string): any {
    const priorityOrder: Record<string, string[]> = {
      'security_first': ['security', 'maintainability', 'performance'],
      'balanced': ['security', 'performance', 'maintainability'],
      'performance_first': ['performance', 'security', 'maintainability']
    };

    const order = priorityOrder[strategy] || priorityOrder['security_first'];
    
    // Find the highest priority recommendation
    let chosenRecommendation = null;
    for (const priority of order) {
      const match = conflict.recommendations.find((rec: any) => rec.priority === priority);
      if (match) {
        chosenRecommendation = match;
        break;
      }
    }

    // Fallback to first recommendation if no priority match
    if (!chosenRecommendation) {
      chosenRecommendation = conflict.recommendations[0];
    }

    return {
      conflict_id: conflict.conflict_id,
      chosen_recommendation: chosenRecommendation,
      rejected_recommendations: conflict.recommendations.filter((rec: any) => rec !== chosenRecommendation),
      resolution_reason: this.getResolutionReason(chosenRecommendation, strategy),
      compromise_possible: this.checkCompromisePossible(conflict.recommendations),
      location: conflict.location
    };
  }

  private getResolutionReason(recommendation: any, strategy: string): string {
    const reasons: Record<string, string> = {
      'security_first': `Chose ${recommendation.agent} recommendation because security takes precedence over other concerns.`,
      'balanced': `Chose ${recommendation.agent} recommendation as it provides the best balance of security, performance, and maintainability.`,
      'performance_first': `Chose ${recommendation.agent} recommendation to prioritize performance while maintaining acceptable security standards.`
    };

    return reasons[strategy] || reasons['security_first'];
  }

  private checkCompromisePossible(recommendations: any[]): boolean {
    // Simple heuristic: if recommendations are from different priority areas, compromise might be possible
    const priorities = recommendations.map(rec => rec.priority);
    const uniquePriorities = new Set(priorities);
    return uniquePriorities.size > 1;
  }
}

/**
 * Create coordination tool definitions
 * Note: invoke_subagent removed - using built-in deepagents task tool instead
 */
export function createCoordinationTools(): RemixToolDefinition[] {
  return [
    {
      name: 'aggregate_findings',
      description: 'Merge and organize results from multiple subagents',
      inputSchema: new AggregateFindingsHandler().inputSchema,
      category: ToolCategory.COORDINATION,
      permissions: ['coordination:aggregate'],
      handler: new AggregateFindingsHandler()
    },
    {
      name: 'resolve_conflicts',
      description: 'Handle conflicting recommendations between subagents using predefined rules',
      inputSchema: new ResolveConflictsHandler().inputSchema,
      category: ToolCategory.COORDINATION,
      permissions: ['coordination:resolve'],
      handler: new ResolveConflictsHandler()
    }
  ];
}