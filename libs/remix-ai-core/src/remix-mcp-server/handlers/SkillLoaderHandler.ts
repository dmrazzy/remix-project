/**
 * Skill Loader Tool Handler for Remix MCP Server
 * Loads skills and their resources from remote endpoints to the file manager
 */

import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition,
  LoadSkillArgs,
  LoadSkillResult
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';

/**
 * Skill data structure as returned from the remote endpoint
 */
interface SkillData {
  id: string;
  name: string;
  description: string;
  content: string; // SKILL.md content
  resources: Record<string, string>; // filename -> file content
}


/**
 * Skill Loader Tool Handler
 */
export class SkillLoaderHandler extends BaseToolHandler {
  name = 'load_skill';
  description = `Load a skill and its resources from a remote endpoint to the file manager under .skills folder.
  Fetches skill data from http://localhost:9005/skills/{skill_id} by default and creates:
  - .skills/{skill_id}/SKILL.md (main skill documentation)
  - .skills/{skill_id}/{filename} (for each resource file)
  
  Returns information about the loaded skill and created files.`;
  
  inputSchema = {
    type: 'object',
    properties: {
      skill_id: {
        type: 'string',
        description: 'Unique identifier of the skill to load'
      },
      endpoint: {
        type: 'string',
        description: 'Optional custom endpoint URL (default: http://localhost:9005)',
        default: 'http://localhost:9005'
      }
    },
    required: ['skill_id']
  };

  getPermissions(): string[] {
    return ['file:write', 'file:create', 'network:request'];
  }

  validate(args: LoadSkillArgs): boolean | string {
    const required = this.validateRequired(args, ['skill_id']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      skill_id: 'string',
      endpoint: 'string'
    });
    if (types !== true) return types;

    // Validate skill_id format (basic validation)
    if (args.skill_id.trim().length === 0) {
      return 'skill_id cannot be empty';
    }

    // Basic URL validation if endpoint is provided
    if (args.endpoint) {
      try {
        new URL(args.endpoint);
      } catch {
        return 'Invalid endpoint URL format';
      }
    }

    return true;
  }

  async execute(args: LoadSkillArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      console.log(`[SkillLoaderHandler] Loading skill: ${args.skill_id}`);
      
      // Set default endpoint if not provided
      const endpoint = args.endpoint || 'http://localhost:9005';
      const skillUrl = `${endpoint}/skills/${args.skill_id}`;

      // Fetch skill data from remote endpoint
      const skillData = await this.fetchSkillData(skillUrl);

      // Create skill directory
      const skillDir = `.skills/${args.skill_id}`;
      await this.ensureDirectoryExists(skillDir, plugin);

      const createdFiles: string[] = [];

      // Write SKILL.md file
      const skillFilePath = `${skillDir}/SKILL.md`;
      await plugin.call('fileManager', 'writeFile', skillFilePath, skillData.content);
      createdFiles.push(skillFilePath);

      // Write resource files
      for (const [filename, content] of Object.entries(skillData.resources)) {
        const filePath = `${skillDir}/${filename}`;
        await plugin.call('fileManager', 'writeFile', filePath, content);
        createdFiles.push(filePath);
      }

      const result: LoadSkillResult = {
        success: true,
        path: skillDir,
        skill_id: skillData.id,
        skill_name: skillData.name,
        skill_description: skillData.description,
        files_created: createdFiles,
        total_files: createdFiles.length,
        message: `Successfully loaded skill '${skillData.name}' with ${createdFiles.length} files`,
        lastModified: new Date().toISOString()
      };

      console.log(`[SkillLoaderHandler] Successfully loaded skill ${args.skill_id} to ${skillDir}`);
      return this.createSuccessResult(result);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[SkillLoaderHandler] Failed to load skill ${args.skill_id}:`, error);
      return this.createErrorResult(`Failed to load skill: ${errorMessage}`);
    }
  }

  /**
   * Fetch skill data from remote endpoint
   */
  private async fetchSkillData(url: string): Promise<SkillData> {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Validate response structure
    if (!data.id || !data.name || !data.content || !data.resources) {
      throw new Error('Invalid skill data format - missing required fields (id, name, content, resources)');
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      content: data.content,
      resources: data.resources || {}
    };
  }

  /**
   * Ensure directory exists, create if it doesn't
   */
  private async ensureDirectoryExists(path: string, plugin: Plugin): Promise<void> {
    const exists = await plugin.call('fileManager', 'exists', path);
    if (!exists) {
      await plugin.call('fileManager', 'mkdir', path);
    }
  }
}

/**
 * Create skill loader tool definition
 */
export function createSkillLoaderTool(): RemixToolDefinition {
  const skillLoaderHandler = new SkillLoaderHandler();

  return {
    name: skillLoaderHandler.name,
    description: skillLoaderHandler.description,
    inputSchema: skillLoaderHandler.inputSchema,
    category: ToolCategory.WORKSPACE,
    permissions: skillLoaderHandler.getPermissions(),
    handler: skillLoaderHandler
  };
}