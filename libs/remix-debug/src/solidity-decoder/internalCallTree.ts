'use strict'
import { AstWalker } from '@remix-project/remix-astwalker'
import { util } from '@remix-project/remix-lib'
import { SourceLocationTracker } from '../source/sourceLocationTracker'
import { EventManager } from '../eventManager'
import { parseType } from './decodeInfo'
import { isContractCreation, isCallInstruction, isCreateInstruction, isRevertInstruction } from '../trace/traceHelper'
import { extractLocationFromAstVariable } from './types/util'

/**
 * Represents detailed information about a single step in the VM execution trace.
 */
export type StepDetail = {
  /** Call depth in the execution stack (0 for top-level, increases with each call) */
  depth: number,
  /** Remaining gas at this step (can be number or string representation) */
  gas: number | string,
  /** Gas consumed by this specific operation */
  gasCost: number,
  /** Memory state as an array of bytes */
  memory: number[],
  /** EVM opcode name (e.g., 'PUSH1', 'ADD', 'CALL') */
  op: string,
  /** Program counter - position in the bytecode */
  pc: number,
  /** EVM stack state as an array of values */
  stack: number[],
}

/**
 * Tree representing internal jump into function.
 * Triggers `callTreeReady` event when tree is ready
 * Triggers `callTreeBuildFailed` event when tree fails to build
 */
export class InternalCallTree {
  /** Flag to indicate whether to include local variables in the call tree analysis */
  includeLocalVariables
  /** Flag to enable debugging with compiler-generated sources (e.g., Yul intermediate representation) */
  debugWithGeneratedSources
  /** Event manager for emitting call tree lifecycle events */
  event
  /** Proxy for interacting with Solidity compilation results and AST */
  solidityProxy
  /** Manager for accessing and navigating the execution trace */
  traceManager
  /** Tracker for mapping VM trace indices to source code locations */
  sourceLocationTracker
  /** Map of scopes defined by range in the VM trace. Keys are scopeIds, values contain firstStep, lastStep, locals, isCreation, gasCost */
  scopes
  /** Map of VM trace indices to scopeIds, representing the start of each scope */
  scopeStarts
  /** Stack of VM trace step indices where function calls occur */
  functionCallStack
  /** Map of scopeIds to function definitions with their inputs */
  functionDefinitionsByScope
  /** Cache of variable declarations indexed by file and source location */
  variableDeclarationByFile
  /** Cache of function definitions indexed by file and source location */
  functionDefinitionByFile
  /** AST walker for traversing Abstract Syntax Trees */
  astWalker
  /** Optimized trace containing only steps with new source locations */
  reducedTrace
  /** Map of VM trace indices to their corresponding source location, step details, line/column position, and contract address */
  locationAndOpcodePerVMTraceIndex: {
    [Key: number]: any
  }
  /** Map of gas costs aggregated by file and line number */
  gasCostPerLine
  /** Converter for transforming source offsets to line/column positions */
  offsetToLineColumnConverter
  /** VM trace index where pending constructor execution is expected to start */
  pendingConstructorExecutionAt: number
  /** AST node ID of the pending constructor */
  pendingConstructorId: number
  /** Pending constructor function definition waiting for execution */
  pendingConstructor
  /** Map tracking which constructors have started execution and at what source location offset */
  constructorsStartExecution
  /** Map of variable IDs to their metadata (name, type, stackDepth, sourceLocation) */
  variables: {
    [Key: number]: any
  }

  /**
    * constructor
    *
    * @param {Object} debuggerEvent  - event declared by the debugger (EthDebugger)
    * @param {Object} traceManager  - trace manager
    * @param {Object} solidityProxy  - solidity proxy
    * @param {Object} codeManager  - code manager
    * @param {Object} opts  - { includeLocalVariables, debugWithGeneratedSources }
    */
  constructor (debuggerEvent, traceManager, solidityProxy, codeManager, opts, offsetToLineColumnConverter?) {
    this.includeLocalVariables = opts.includeLocalVariables
    this.debugWithGeneratedSources = opts.debugWithGeneratedSources
    this.event = new EventManager()
    this.solidityProxy = solidityProxy
    this.traceManager = traceManager
    this.offsetToLineColumnConverter = offsetToLineColumnConverter
    this.sourceLocationTracker = new SourceLocationTracker(codeManager, { debugWithGeneratedSources: opts.debugWithGeneratedSources })
    debuggerEvent.register('newTraceLoaded', async (trace) => {
      const time = Date.now()
      this.reset()
      // each recursive call to buildTree represent a new context (either call, delegatecall, internal function)
      const calledAddress = traceManager.getCurrentCalledAddressAt(0)
      const isCreation = isContractCreation(calledAddress)

      const scopeId = '1'
      this.scopeStarts[0] = scopeId
      this.scopes[scopeId] = { firstStep: 0, locals: {}, isCreation, gasCost: 0 }

      const compResult = await this.solidityProxy.compilationResult(calledAddress)
      if (!compResult) {
        this.event.trigger('noCallTreeAvailable', [])
      } else {
        try {
          buildTree(this, 0, scopeId, isCreation).then((result) => {
            if (result.error) {
              this.event.trigger('callTreeBuildFailed', [result.error])
            } else {
              createReducedTrace(this, traceManager.trace.length - 1)
              console.log('call tree build lasts ', (Date.now() - time) / 1000)
              this.event.trigger('callTreeReady', [this.scopes, this.scopeStarts])
            }
          }, (reason) => {
            console.log('analyzing trace falls ' + reason)
            this.event.trigger('callTreeNotReady', [reason])
          })
        } catch (e) {
          console.log(e)
        }
      }
    })
  }

  /**
    * Resets the call tree to its initial state, clearing all caches and data structures.
    * Initializes empty maps for scopes, scope starts, variable/function declarations, and other tracking data.
    */
  reset () {
    /*
      scopes: map of scopes defined by range in the vmtrace {firstStep, lastStep, locals}.
      Keys represent the level of deepness (scopeId)
      scopeId : <currentscope_id>.<sub_scope_id>.<sub_sub_scope_id>
    */
    this.scopes = {}
    /*
      scopeStart: represent start of a new scope. Keys are index in the vmtrace, values are scopeId
    */
    this.sourceLocationTracker.clearCache()
    this.functionCallStack = []
    this.functionDefinitionsByScope = {}
    this.scopeStarts = {}
    this.gasCostPerLine = {}
    this.variableDeclarationByFile = {}
    this.functionDefinitionByFile = {}
    this.astWalker = new AstWalker()
    this.reducedTrace = []
    this.locationAndOpcodePerVMTraceIndex = {}
    this.pendingConstructorExecutionAt = -1
    this.pendingConstructorId = -1
    this.constructorsStartExecution = {}
    this.pendingConstructor = null
    this.variables = {}
  }

  /**
   * Retrieves all scope-related data structures.
   *
   * @returns {Object} Object containing scopes, scopeStarts, functionDefinitionsByScope, and functionCallStack
   */
  getScopes () {
    return { scopes: this.scopes, scopeStarts: this.scopeStarts, functionDefinitionsByScope: this.functionDefinitionsByScope, functionCallStack: this.functionCallStack }
  }

  /**
    * Finds the scope that contains the given VM trace index.
    * If the scope's lastStep is before the given index, traverses up to parent scopes.
    *
    * @param {number} vmtraceIndex - Index in the VM trace
    * @returns {Object|null} Scope object containing firstStep, lastStep, locals, isCreation, and gasCost, or null if not found
    */
  findScope (vmtraceIndex) {
    let scopeId = this.findScopeId(vmtraceIndex)
    if (scopeId !== '' && !scopeId) return null
    let scope = this.scopes[scopeId]
    while (scope.lastStep && scope.lastStep < vmtraceIndex && scope.firstStep > 0) {
      scopeId = this.parentScope(scopeId)
      scope = this.scopes[scopeId]
    }
    return scope
  }

  /**
   * Returns the parent scope ID by removing the last sub-scope level.
   * For example, "1.2.3" becomes "1.2", and "1" becomes "".
   *
   * @param {string} scopeId - Scope identifier in dotted notation (e.g., "1.2.3")
   * @returns {string} Parent scope ID, or empty string if no parent exists
   */
  parentScope (scopeId) {
    if (scopeId.indexOf('.') === -1) return ''
    return scopeId.replace(/(\.\d+)$/, '')
  }

  /**
   * Finds the scope ID that is active at the given VM trace index.
   * Uses binary search to find the nearest scope start that is <= vmtraceIndex.
   *
   * @param {number} vmtraceIndex - Index in the VM trace
   * @returns {string|null} Scope ID string, or null if no scopes exist
   */
  findScopeId (vmtraceIndex) {
    const scopes = Object.keys(this.scopeStarts)
    if (!scopes.length) return null
    const scopeStart = util.findLowerBoundValue(vmtraceIndex, scopes)
    return this.scopeStarts[scopeStart]
  }

  /**
   * Retrieves the stack of function definitions from the root scope to the scope containing the given VM trace index.
   * Each function entry includes the function definition merged with scope details (firstStep, lastStep, locals, etc.).
   *
   * @param {number} vmtraceIndex - Index in the VM trace
   * @returns {Array<Object>} Array of function objects, ordered from innermost to outermost scope
   * @throws {Error} If recursion depth exceeds 1000 levels
   */
  retrieveFunctionsStack (vmtraceIndex) {
    const scope = this.findScope(vmtraceIndex)
    if (!scope) return []
    let scopeId = this.scopeStarts[scope.firstStep]
    const functions = []
    if (!scopeId) return functions
    let i = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      i += 1
      if (i > 1000) throw new Error('retrieFunctionStack: recursion too deep')
      const functionDefinition = this.functionDefinitionsByScope[scopeId]
      const scopeDetail = this.scopes[scopeId]
      if (functionDefinition !== undefined) {
        functions.push({ ...functionDefinition, ...scopeDetail })
      }
      const parent = this.parentScope(scopeId)
      if (!parent) break
      else scopeId = parent
    }
    return functions
  }

  /**
   * Extracts the source location corresponding to a specific VM trace step.
   * Retrieves the contract address and compilation result, then maps the step to source code position.
   *
   * @param {number} step - VM trace step index
   * @param {string} [address] - Contract address (optional, defaults to address at current step)
   * @returns {Promise<Object>} Source location object with start, length, file, and jump properties
   * @throws {Error} If source location cannot be retrieved
   */
  async extractSourceLocation (step: number, address?: string) {
    try {
      if (!address) address = this.traceManager.getCurrentCalledAddressAt(step)
      const compilationResult = await this.solidityProxy.compilationResult(address)
      return await this.sourceLocationTracker.getSourceLocationFromVMTraceIndex(address, step, compilationResult.data.contracts)
    } catch (error) {
      throw new Error('InternalCallTree - Cannot retrieve sourcelocation for step ' + step + ' ' + error)
    }
  }

  /**
   * Extracts a valid source location for a specific VM trace step, handling invalid or out-of-range locations.
   * Falls back to previous valid location if current location is invalid.
   *
   * @param {number} step - VM trace step index
   * @param {string} [address] - Contract address (optional, defaults to address at current step)
   * @returns {Promise<Object>} Valid source location object
   * @throws {Error} If valid source location cannot be retrieved
   */
  async extractValidSourceLocation (step: number, address?: string) {
    try {
      if (!address) address = this.traceManager.getCurrentCalledAddressAt(step)
      const compilationResult = await this.solidityProxy.compilationResult(address)
      return await this.sourceLocationTracker.getValidSourceLocationFromVMTraceIndex(address, step, compilationResult.data.contracts)
    } catch (error) {
      throw new Error('InternalCallTree - Cannot retrieve valid sourcelocation for step ' + step + ' ' + error)
    }
  }

  /**
   * Retrieves a valid source location from the cache using VM trace index.
   * Uses the locationAndOpcodePerVMTraceIndex cache to avoid redundant lookups.
   *
   * @param {string} address - Contract address
   * @param {number} step - VM trace step index
   * @param {any} contracts - Contracts object from compilation result
   * @returns {Promise<Object>} Valid source location from cache
   */
  async getValidSourceLocationFromVMTraceIndexFromCache (address: string, step: number, contracts: any) {
    return await this.sourceLocationTracker.getValidSourceLocationFromVMTraceIndexFromCache(address, step, contracts, this.locationAndOpcodePerVMTraceIndex)
  }

  /**
   * Retrieves the aggregated gas cost for a specific file and line number.
   *
   * @param {number} file - File index
   * @param {number} line - Line number
   * @returns {Promise<Object>} Object containing gasCost (total gas) and indexes (array of VM trace steps)
   * @throws {Error} If gas cost data is not available for the specified file and line
   */
  async getGasCostPerLine(file: number, line: number) {
    if (this.gasCostPerLine[file] && this.gasCostPerLine[file][line]) {
      return this.gasCostPerLine[file][line]
    }
    throw new Error('Could not find gas cost per line')
  }

  /**
   * Retrieves a local variable's metadata by its AST node ID.
   *
   * @param {number} id - AST node ID of the variable
   * @returns {Object|undefined} Variable metadata object with name, type, stackDepth, and sourceLocation, or undefined if not found
   */
  getLocalVariableById (id: number) {
    return this.variables[id]
  }
}

/**
 * Recursively builds the call tree by analyzing the VM trace.
 * Creates scopes for function calls, internal functions, and constructors.
 * Tracks local variables, gas costs, and source locations for each step.
 *
 * @param {InternalCallTree} tree - The call tree instance being built
 * @param {number} step - Current VM trace step index
 * @param {string} scopeId - Current scope identifier in dotted notation
 * @param {boolean} isCreation - Whether this is a contract creation context
 * @param {Object} [functionDefinition] - AST function definition node if entering a function
 * @param {Object} [contractObj] - Contract object with ABI and compilation data
 * @param {Object} [sourceLocation] - Current source location {start, length, file, jump}
 * @param {Object} [validSourceLocation] - Last valid source location
 * @returns {Promise<Object>} Object with outStep (next step to process) and optional error message
 */
async function buildTree (tree, step, scopeId, isCreation, functionDefinition?, contractObj?, sourceLocation?, validSourceLocation?) {
  let subScope = 1
  if (functionDefinition) {
    const address = tree.traceManager.getCurrentCalledAddressAt(step)
    await registerFunctionParameters(tree, functionDefinition, step, scopeId, contractObj, validSourceLocation, address)
  }

  /**
   * Checks if the call depth changes between consecutive steps.
   *
   * @param {number} step - Current step index
   * @param {Array} trace - The VM trace array
   * @returns {boolean} True if depth changes between current and next step
   */
  function callDepthChange (step, trace) {
    if (step + 1 < trace.length) {
      return trace[step].depth !== trace[step + 1].depth
    }
    return false
  }

  /**
   * Checks if one source location is completely included within another.
   *
   * @param {Object} source - Outer source location to check against
   * @param {Object} included - Inner source location to check
   * @returns {boolean} True if included is completely within source
   */
  function includedSource (source, included) {
    return (included.start !== -1 &&
      included.length !== -1 &&
      included.file !== -1 &&
      included.start >= source.start &&
      included.start + included.length <= source.start + source.length &&
      included.file === source.file)
  }

  let currentSourceLocation = sourceLocation || { start: -1, length: -1, file: -1, jump: '-' }
  let previousSourceLocation = currentSourceLocation
  let previousValidSourceLocation = validSourceLocation || currentSourceLocation
  let compilationResult
  let currentAddress = ''
  while (step < tree.traceManager.trace.length) {
    let sourceLocation
    let validSourceLocation
    let address

    try {
      address = tree.traceManager.getCurrentCalledAddressAt(step)
      sourceLocation = await tree.extractSourceLocation(step, address)

      if (!includedSource(sourceLocation, currentSourceLocation)) {
        tree.reducedTrace.push(step)
        currentSourceLocation = sourceLocation
      }
      if (currentAddress !== address) {
        compilationResult = await tree.solidityProxy.compilationResult(address)
        currentAddress = address
      }
      const amountOfSources = tree.sourceLocationTracker.getTotalAmountOfSources(address, compilationResult.data.contracts)
      if (tree.sourceLocationTracker.isInvalidSourceLocation(currentSourceLocation, amountOfSources)) { // file is -1 or greater than amount of sources
        validSourceLocation = previousValidSourceLocation
      } else
        validSourceLocation = currentSourceLocation

    } catch (e) {
      return { outStep: step, error: 'InternalCallTree - Error resolving source location. ' + step + ' ' + e }
    }
    if (!sourceLocation) {
      return { outStep: step, error: 'InternalCallTree - No source Location. ' + step }
    }
    const stepDetail: StepDetail = tree.traceManager.trace[step]
    const nextStepDetail: StepDetail = tree.traceManager.trace[step + 1]
    if (stepDetail && nextStepDetail) {
      // for complicated opcodes which don't have a static gas cost:
      stepDetail.gasCost = parseInt(stepDetail.gas as string) - parseInt(nextStepDetail.gas as string)
    } else {
      stepDetail.gasCost = parseInt(stepDetail.gasCost as unknown as string)
    }

    // gas per line
    let lineColumnPos
    if (tree.offsetToLineColumnConverter) {
      try {
        const generatedSources = tree.sourceLocationTracker.getGeneratedSourcesFromAddress(address)
        const astSources = Object.assign({}, compilationResult.data.sources)
        const sources = Object.assign({}, compilationResult.source.sources)
        if (generatedSources) {
          for (const genSource of generatedSources) {
            astSources[genSource.name] = { id: genSource.id, ast: genSource.ast }
            sources[genSource.name] = { content: genSource.contents }
          }
        }

        lineColumnPos = await tree.offsetToLineColumnConverter.offsetToLineColumn(validSourceLocation, validSourceLocation.file, sources, astSources)
        if (!tree.gasCostPerLine[validSourceLocation.file]) tree.gasCostPerLine[validSourceLocation.file] = {}
        if (!tree.gasCostPerLine[validSourceLocation.file][lineColumnPos.start.line]) {
          tree.gasCostPerLine[validSourceLocation.file][lineColumnPos.start.line] = {
            gasCost: 0,
            indexes: []
          }
        }
        tree.gasCostPerLine[validSourceLocation.file][lineColumnPos.start.line].gasCost += stepDetail.gasCost
        tree.gasCostPerLine[validSourceLocation.file][lineColumnPos.start.line].indexes.push(step)
      } catch (e) {
        console.log(e)
      }
    }

    tree.locationAndOpcodePerVMTraceIndex[step] = { sourceLocation, stepDetail, lineColumnPos, contractAddress: address }
    tree.scopes[scopeId].gasCost += stepDetail.gasCost

    const contractObj = await tree.solidityProxy.contractObjectAtAddress(address)
    const generatedSources = getGeneratedSources(tree, scopeId, contractObj)
    const functionDefinition = await resolveFunctionDefinition(tree, sourceLocation, generatedSources, address)

    const isInternalTxInstrn = isCallInstruction(stepDetail)
    const isCreateInstrn = isCreateInstruction(stepDetail)
    // we are checking if we are jumping in a new CALL or in an internal function

    const isRevert = isRevertInstruction(stepDetail)
    const constructorExecutionStarts = tree.pendingConstructorExecutionAt > -1 && tree.pendingConstructorExecutionAt < validSourceLocation.start
    if (functionDefinition && functionDefinition.kind === 'constructor' && tree.pendingConstructorExecutionAt === -1 && !tree.constructorsStartExecution[functionDefinition.id]) {
      tree.pendingConstructorExecutionAt = validSourceLocation.start
      tree.pendingConstructorId = functionDefinition.id
      tree.pendingConstructor = functionDefinition
      // from now on we'll be waiting for a change in the source location which will mark the beginning of the constructor execution.
      // constructorsStartExecution allows to keep track on which constructor has already been executed.
    }
    const internalfunctionCall = functionDefinition && previousSourceLocation.jump === 'i'
    if (constructorExecutionStarts || isInternalTxInstrn || internalfunctionCall) {
      try {
        const newScopeId = scopeId === '' ? subScope.toString() : scopeId + '.' + subScope
        tree.scopeStarts[step] = newScopeId
        const startExecution = lineColumnPos && lineColumnPos.start ? lineColumnPos.start.line + 1 : undefined
        tree.scopes[newScopeId] = { firstStep: step, locals: {}, isCreation, gasCost: 0, startExecution }
        // for the ctor we are at the start of its trace, we have to replay this step in order to catch all the locals:
        const nextStep = constructorExecutionStarts ? step : step + 1
        if (constructorExecutionStarts) {
          tree.constructorsStartExecution[tree.pendingConstructorId] = tree.pendingConstructorExecutionAt
          tree.pendingConstructorExecutionAt = -1
          tree.pendingConstructorId = -1
          await registerFunctionParameters(tree, tree.pendingConstructor, step, newScopeId, contractObj, previousValidSourceLocation, address)
          tree.pendingConstructor = null
        }
        const externalCallResult = await buildTree(tree, nextStep, newScopeId, isCreateInstrn, functionDefinition, contractObj, sourceLocation, validSourceLocation)
        if (externalCallResult.error) {
          return { outStep: step, error: 'InternalCallTree - ' + externalCallResult.error }
        } else {
          step = externalCallResult.outStep
          subScope++
        }
      } catch (e) {
        return { outStep: step, error: 'InternalCallTree - ' + e.message }
      }
    } else if (callDepthChange(step, tree.traceManager.trace) || (sourceLocation.jump === 'o' && functionDefinition) || isRevert) {
      // if not, we might be returning from a CALL or internal function. This is what is checked here.
      tree.scopes[scopeId].lastStep = step
      if (isRevert) {
        const revertLine = lineColumnPos && lineColumnPos.start ? lineColumnPos.start.line + 1 : undefined
        tree.scopes[scopeId].reverted = {
          step: stepDetail,
          line: revertLine
        }
      }

      tree.scopes[scopeId].endExecution = lineColumnPos && lineColumnPos.end ? lineColumnPos.end.line + 1 : undefined
      return { outStep: step + 1 }
    } else {
      // if not, we are in the current scope.
      // We check in `includeVariableDeclaration` if there is a new local variable in scope for this specific `step`
      if (tree.includeLocalVariables) {
        await includeVariableDeclaration(tree, step, sourceLocation, scopeId, contractObj, generatedSources, address)
      }
      previousSourceLocation = sourceLocation
      previousValidSourceLocation = validSourceLocation
      step++
    }
  }
  return { outStep: step }
}

/**
 * Adds a VM trace index to the reduced trace.
 * The reduced trace contains only indices where the source location changes.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {number} index - VM trace step index to add
 */
function createReducedTrace (tree, index) {
  tree.reducedTrace.push(index)
}

/**
 * Retrieves compiler-generated sources (e.g., Yul IR) for a given scope if debugging with generated sources is enabled.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {string} scopeId - Scope identifier
 * @param {Object} contractObj - Contract object containing bytecode and deployment data
 * @returns {Array|null} Array of generated source objects, or null if not available
 */
function getGeneratedSources (tree, scopeId, contractObj) {
  if (tree.debugWithGeneratedSources && contractObj && tree.scopes[scopeId]) {
    return tree.scopes[scopeId].isCreation ? contractObj.contract.evm.bytecode.generatedSources : contractObj.contract.evm.deployedBytecode.generatedSources
  }
  return null
}

/**
 * Registers function parameters and return parameters in the scope's locals.
 * Extracts parameter types from the function definition and maps them to stack positions.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {Object} functionDefinition - AST function definition node
 * @param {number} step - VM trace step index at function entry
 * @param {string} scopeId - Scope identifier for this function
 * @param {Object} contractObj - Contract object with ABI
 * @param {Object} sourceLocation - Source location of the function
 * @param {string} address - Contract address
 */
async function registerFunctionParameters (tree, functionDefinition, step, scopeId, contractObj, sourceLocation, address) {
  tree.functionCallStack.push(step)
  const functionDefinitionAndInputs = { functionDefinition, inputs: []}
  // means: the previous location was a function definition && JUMPDEST
  // => we are at the beginning of the function and input/output are setup
  try {
    const stack = tree.traceManager.getStackAt(step)
    const states = await tree.solidityProxy.extractStatesDefinitions(address)
    if (functionDefinition.parameters) {
      const inputs = functionDefinition.parameters
      const outputs = functionDefinition.returnParameters
      // input params
      if (inputs && inputs.parameters) {
        functionDefinitionAndInputs.inputs = addParams(inputs, tree, scopeId, states, contractObj, sourceLocation, stack.length, inputs.parameters.length, -1)
      }
      // output params
      if (outputs) addParams(outputs, tree, scopeId, states, contractObj, sourceLocation, stack.length, 0, 1)
    }
  } catch (error) {
    console.log(error)
  }

  tree.functionDefinitionsByScope[scopeId] = functionDefinitionAndInputs
}

/**
 * Includes variable declarations in the current scope if a new local variable is encountered at this step.
 * Checks the AST for variable declarations at the current source location and adds them to scope locals.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {number} step - Current VM trace step index
 * @param {Object} sourceLocation - Current source location
 * @param {string} scopeId - Current scope identifier
 * @param {Object} contractObj - Contract object with name and ABI
 * @param {Array} generatedSources - Compiler-generated sources
 * @param {string} address - Contract address
 */
async function includeVariableDeclaration (tree, step, sourceLocation, scopeId, contractObj, generatedSources, address) {
  let states = null
  const variableDeclarations = await resolveVariableDeclaration(tree, sourceLocation, generatedSources, address)
  // using the vm trace step, the current source location and the ast,
  // we check if the current vm trace step target a new ast node of type VariableDeclaration
  // that way we know that there is a new local variable from here.
  if (variableDeclarations && variableDeclarations.length) {
    for (const variableDeclaration of variableDeclarations) {
      if (variableDeclaration && !tree.scopes[scopeId].locals[variableDeclaration.name]) {
        try {
          const stack = tree.traceManager.getStackAt(step)
          // the stack length at this point is where the value of the new local variable will be stored.
          // so, either this is the direct value, or the offset in memory. That depends on the type.
          if (variableDeclaration.name !== '') {
            states = await tree.solidityProxy.extractStatesDefinitions(address)
            let location = extractLocationFromAstVariable(variableDeclaration)
            location = location === 'default' ? 'storage' : location
            // we push the new local variable in our tree
            const newVar = {
              name: variableDeclaration.name,
              type: parseType(variableDeclaration.typeDescriptions.typeString, states, contractObj.name, location),
              stackDepth: stack.length,
              sourceLocation: sourceLocation
            }
            tree.scopes[scopeId].locals[variableDeclaration.name] = newVar
            tree.variables[variableDeclaration.id] = newVar
          }
        } catch (error) {
          console.log(error)
        }
      }
    }
  }
}

/**
 * Extracts all variable declarations for a given AST and file, caching the results.
 * Returns the variable declaration(s) matching the given source location.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {Object} sourceLocation - Source location to resolve
 * @param {Array} generatedSources - Compiler-generated sources
 * @param {string} address - Contract address
 * @returns {Promise<Array|null>} Array of variable declaration nodes, or null if AST is unavailable
 */
async function resolveVariableDeclaration (tree, sourceLocation, generatedSources, address) {
  if (!tree.variableDeclarationByFile[sourceLocation.file]) {
    const ast = await tree.solidityProxy.ast(sourceLocation, generatedSources, address)
    if (ast) {
      tree.variableDeclarationByFile[sourceLocation.file] = extractVariableDeclarations(ast, tree.astWalker)
    } else {
      return null
    }
  }
  return tree.variableDeclarationByFile[sourceLocation.file][sourceLocation.start + ':' + sourceLocation.length + ':' + sourceLocation.file]
}

/**
 * Extracts all function definitions for a given AST and file, caching the results.
 * Returns the function definition matching the given source location.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {Object} sourceLocation - Source location to resolve
 * @param {Array} generatedSources - Compiler-generated sources
 * @param {string} address - Contract address
 * @returns {Promise<Object|null>} Function definition node, or null if AST is unavailable
 */
async function resolveFunctionDefinition (tree, sourceLocation, generatedSources, address) {
  if (!tree.functionDefinitionByFile[sourceLocation.file]) {
    const ast = await tree.solidityProxy.ast(sourceLocation, generatedSources, address)
    if (ast) {
      tree.functionDefinitionByFile[sourceLocation.file] = extractFunctionDefinitions(ast, tree.astWalker)
    } else {
      return null
    }
  }
  return tree.functionDefinitionByFile[sourceLocation.file][sourceLocation.start + ':' + sourceLocation.length + ':' + sourceLocation.file]
}

/**
 * Walks the AST and extracts all variable declarations, indexing them by source location.
 * Handles both Solidity and Yul variable declarations.
 *
 * @param {Object} ast - Abstract Syntax Tree to walk
 * @param {AstWalker} astWalker - AST walker instance
 * @returns {Object} Map of source locations to variable declaration nodes
 */
function extractVariableDeclarations (ast, astWalker) {
  const ret = {}
  astWalker.walkFull(ast, (node) => {
    if (node.nodeType === 'VariableDeclaration' || node.nodeType === 'YulVariableDeclaration') {
      ret[node.src] = [node]
    }
    const hasChild = node.initialValue && (node.nodeType === 'VariableDeclarationStatement' || node.nodeType === 'YulVariableDeclarationStatement')
    if (hasChild) ret[node.initialValue.src] = node.declarations
  })
  return ret
}

/**
 * Walks the AST and extracts all function definitions, indexing them by source location.
 * Handles both Solidity and Yul function definitions.
 *
 * @param {Object} ast - Abstract Syntax Tree to walk
 * @param {AstWalker} astWalker - AST walker instance
 * @returns {Object} Map of source locations to function definition nodes
 */
function extractFunctionDefinitions (ast, astWalker) {
  const ret = {}
  astWalker.walkFull(ast, (node) => {
    if (node.nodeType === 'FunctionDefinition' || node.nodeType === 'YulFunctionDefinition') {
      ret[node.src] = node
    }
  })
  return ret
}

/**
 * Adds function parameters or return parameters to the scope's locals.
 * Maps each parameter to its stack position and type information.
 *
 * @param {Object} parameterList - Parameter list from function AST node
 * @param {InternalCallTree} tree - The call tree instance
 * @param {string} scopeId - Current scope identifier
 * @param {Object} states - State variable definitions
 * @param {Object} contractObj - Contract object with name and ABI
 * @param {Object} sourceLocation - Source location of the parameter
 * @param {number} stackLength - Current stack depth
 * @param {number} stackPosition - Starting stack position for parameters
 * @param {number} dir - Direction to traverse stack (1 for outputs, -1 for inputs)
 * @returns {Array<string>} Array of parameter names added to the scope
 */
function addParams (parameterList, tree, scopeId, states, contractObj, sourceLocation, stackLength, stackPosition, dir) {
  const contractName = contractObj.name
  const params = []
  for (const inputParam in parameterList.parameters) {
    const param = parameterList.parameters[inputParam]
    const stackDepth = stackLength + (dir * stackPosition)
    if (stackDepth >= 0) {
      let location = extractLocationFromAstVariable(param)
      location = location === 'default' ? 'memory' : location
      const attributesName = param.name === '' ? `$${inputParam}` : param.name
      const newParam = {
        name: attributesName,
        type: parseType(param.typeDescriptions.typeString, states, contractName, location),
        stackDepth: stackDepth,
        sourceLocation: sourceLocation,
        abi: contractObj.contract.abi,
        isParameter: true
      }
      tree.scopes[scopeId].locals[attributesName] = newParam
      params.push(attributesName)
      if (!tree.variables[param.id]) tree.variables[param.id] = newParam
    }
    stackPosition += dir
  }
  return params
}
