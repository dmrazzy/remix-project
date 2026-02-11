/**
 * Debugging Resource Provider - Provides access to debugging session data and trace information
 */

import { Plugin } from '@remixproject/engine';
import { IMCPResource, IMCPResourceContent } from '../../types/mcp';
import { BaseResourceProvider } from '../registry/RemixResourceProviderRegistry';
import { ResourceCategory } from '../types/mcpResources';
import { NestedScope } from '@remix-project/remix-debug';

export class DebuggingResourceProvider extends BaseResourceProvider {
  name = 'debugging';
  description = 'Provides access to debugging session data, trace cache, and call tree information';
  private _plugin;

  constructor(plugin) {
    super();
    this._plugin = plugin;
  }

  async getResources(plugin: Plugin): Promise<IMCPResource[]> {
    const resources: IMCPResource[] = [];

    try {
      // Add scopes with summary filter (summarized)
      resources.push(
        this.createResource(
          'debug://scopes-summary',
          'Scopes (summary)',
          'Summarized scope information filtered to exclude jump instructions, providing essential function calls and variables without overwhelming detail',
          'application/json',
          {
            category: ResourceCategory.DEBUG_SESSIONS,
            tags: ['debugging', 'scopes', 'summary', 'functions', 'variables'],
            priority: 9
          }
        )
      );


      // Add trace cache resource
      resources.push(
        this.createResource(
          'debug://trace-cache',
          'Trace Cache',
          'Complete trace cache data including calls, storage changes, memory changes, and execution flow',
          'application/json',
          {
            category: ResourceCategory.DEBUG_SESSIONS,
            tags: ['debugging', 'trace', 'cache', 'storage', 'memory', 'calls'],
            priority: 8
          }
        )
      );

      // Add trace cache resource
      resources.push(
        this.createResource(
          'debug://current-debugging-step',
          'debugging step',
          'Debugging step that the user is currently inspecting',
          'application/json',
          {
            category: ResourceCategory.DEBUG_SESSIONS,
            tags: ['debugging step', 'code'],
            priority: 8
          }
        )
      );

    } catch (error) {
      console.warn('Failed to get debugging resources:', error);
    }

    return resources;
  }


  async getResourceContent(uri: string, plugin: Plugin): Promise<IMCPResourceContent> {
    if (uri === 'debug://scopes-summary') {
      return this.getScopessummary(plugin);
    }


    if (uri === 'debug://trace-cache') {
      return this.getTraceCache(plugin);
    }

    if (uri === 'debug://current-debugging-step') {
      return this.getCurrentSourceLocation(plugin);
    }

    throw new Error(`Unsupported debugging resource URI: ${uri}`);
  }

  canHandle(uri: string): boolean {
    return uri.startsWith('debug://');
  }

  private async getCurrentSourceLocation(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const result = await plugin.call('debugger', 'getCurrentSourceLocation')
      if (!result) {
        return this.createTextContent(
          'debug://current-debugging-step',
          'current source location is not available. There is no debug session going on.'
        );
      }

      return this.createJsonContent('debug://current-debugging-step', {
        success: true,
        description: 'Current source code highlighted in the editor',
        result
      });

    } catch (error) {
      return this.createTextContent(
        'debug://current-debugging-step',
        `Error getting current source location: ${error.message}`
      );
    }
  }

  private async getScopessummary(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const result: NestedScope[] = await plugin.call('debugger', 'getScopesAsNestedJSON', 'nojump');
      if (!result || !Array.isArray(result)) {
        return this.createTextContent(
          'debug://scopes-summary',
          'Scope information not available. There is no debug session going on.'
        );
      }

      // Recursive function to process all scopes and their children
      const processScope = (scope: NestedScope): any => {
        const processed = {
          id: scope.scopeId,
          variableCount: scope.locals ? Object.keys(scope.locals).length : 0,
          variableNames: scope.locals ? Object.keys(scope.locals) : [],
          stepRange: { first: scope.firstStep, last: scope.lastStep },
          gasCost: scope.gasCost,
          isCreation: scope.isCreation,
          children: null,
          childCount: 0,
          totalDescendants: 0
        };

        // Recursively process children if they exist
        if (scope.children && scope.children.length > 0) {
          processed.children = scope.children.map(processScope);
          processed.childCount = scope.children.length;
          // Calculate total descendants recursively
          processed.totalDescendants = scope.children.reduce((total, child) => {
            return total + 1 + (child.children ? this.countAllDescendants(child) : 0);
          }, 0);
        } else {
          processed.childCount = 0;
          processed.totalDescendants = 0;
        }

        return processed;
      };

      // Process all top-level scopes recursively
      const processedScopes = result.map(processScope);

      // Create comprehensive summary
      const summary = {
        totalTopLevelScopes: result.length,
        totalAllScopes: this.countAllScopes(processedScopes),
        totalVariables: this.countAllVariables(processedScopes),
        functionScopes: this.getFunctionSummary(processedScopes),
        scopeHierarchy: processedScopes
      };

      return this.createJsonContent('debug://scopes-summary', {
        success: true,
        summary,
        metadata: {
          description: 'Comprehensive summarized scope information with recursive children processing, filtered to exclude jump instructions',
          retrievedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      return this.createTextContent(
        'debug://scopes-summary',
        `Error getting scopes (summary): ${error.message}`
      );
    }
  }

  // Helper method to count all descendants recursively
  private countAllDescendants(scope: any): number {
    if (!scope.children || scope.children.length === 0) return 0;
    return scope.children.reduce((total, child) => {
      return total + 1 + this.countAllDescendants(child);
    }, 0);
  }

  // Helper method to count all scopes including nested ones
  private countAllScopes(scopes: any[]): number {
    return scopes.reduce((total, scope) => {
      return total + 1 + (scope.children ? this.countAllScopes(scope.children) : 0);
    }, 0);
  }

  // Helper method to count all variables across all scopes
  private countAllVariables(scopes: any[]): number {
    return scopes.reduce((total, scope) => {
      const scopeVars = scope.variableCount || 0;
      const childVars = scope.children ? this.countAllVariables(scope.children) : 0;
      return total + scopeVars + childVars;
    }, 0);
  }

  // Helper method to get function summary across all scopes
  private getFunctionSummary(scopes: any[]): any[] {
    const functions = [];
    
    const collectFunctions = (scopeList: any[]) => {
      for (const scope of scopeList) {
        if (scope.type === 'function') {
          functions.push({
            name: scope.name,
            id: scope.id,
            variableCount: scope.variableCount,
            variableNames: scope.variableNames,
            childCount: scope.childCount,
            stepRange: scope.stepRange
          });
        }
        if (scope.children) {
          collectFunctions(scope.children);
        }
      }
    };

    collectFunctions(scopes);
    return functions;
  }


  traceCacheDesc = `
  /**
   * Retrieves all trace cache data accumulated during transaction execution debugging.
   *
   * Returns an object with the following properties:
   *
   * 1. returnValues: Object mapping VM trace step indices to return values from RETURN operations
   *
   * 2. stopIndexes: Array of STOP operation occurrences [{index: number, address: string}]
   *
   * 3. outofgasIndexes: Array of out-of-gas occurrences [{index: number, address: string}]
   *
   * 4. callsTree: Root node of nested call tree representing execution flow
   *    - Structure: {call: {op, address, callStack, calls, start, return?, reverted?}}
   *    - Captures all CALL, DELEGATECALL, CREATE operations and their nesting
   *
   * 5. callsData: Object mapping VM trace indices to calldata at each point
   *
   * 6. contractCreation: Object mapping creation tokens to deployed contract bytecode (hex format)
   *
   * 7. addresses: Array of all contract addresses encountered during execution (chronological, may have duplicates)
   *
   * 8. callDataChanges: Array of VM trace indices where calldata changed
   *
   * 9. memoryChanges: Array of VM trace indices where EVM memory changed (MSTORE, MLOAD operations)
   *
   * 10. storageChanges: Array of VM trace indices where storage was modified (SSTORE operations)
   *
   * 11. sstore: Object mapping VM trace indices to SSTORE operation details
   *     - Each entry: {address, key, value, hashedKey, contextCall}
   *     - Tracks all storage modifications with context
   */
  `
  private async getTraceCache(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const result = await plugin.call('debugger', 'getAllDebugCache');
      if (!result) {
        return this.createTextContent(
          'debug://trace-cache',
          'Debug cache not available. There is no debug session going on.'
        );
      }

      return this.createJsonContent('debug://trace-cache', {
        success: true,
        cache: result,
        metadata: {
          description: this.traceCacheDesc,
          totalAddresses: result.addresses ? result.addresses.length : 0,
          totalStorageChanges: result.storageChanges ? result.storageChanges.length : 0,
          totalMemoryChanges: result.memoryChanges ? result.memoryChanges.length : 0,
          totalCallDataChanges: result.callDataChanges ? result.callDataChanges.length : 0,
          stopOperations: result.stopIndexes ? result.stopIndexes.length : 0,
          outOfGasEvents: result.outofgasIndexes ? result.outofgasIndexes.length : 0,
          retrievedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      return this.createTextContent(
        'debug://trace-cache',
        `Error getting trace cache: ${error.message}`
      );
    }
  }
}
