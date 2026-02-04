import React, { useState, useEffect } from 'react'
import './DebuggerCallStack.css'

interface DebuggerCallStackProps {
  plugin: any
}

export const DebuggerCallStack = ({ plugin }: DebuggerCallStackProps) => {
  const [callStack, setCallStack] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchCallStack = async () => {
      try {
        // Get call tree scopes from debugger
        const scopes = await plugin.call('debugger', 'getCallTreeScopes')

        if (scopes && scopes.functionDefinitionsByScope) {
          // Convert scopes to an array for display
          const stackItems: any[] = []
          const scopeMap = scopes.scopes
          const functionDefs = scopes.functionDefinitionsByScope

          // Build the call stack from scopes
          for (const [scopeId, scope] of Object.entries(scopeMap as Record<string, any>)) {
            const funcDef = functionDefs[scopeId]
            if (funcDef) {
              stackItems.push({
                scopeId,
                functionName: funcDef.name || funcDef.kind || 'Unknown',
                visibility: funcDef.visibility || '',
                firstStep: scope.firstStep,
                lastStep: scope.lastStep,
                gasCost: scope.gasCost || 0,
                isCreation: scope.isCreation || false
              })
            }
          }

          // Sort by firstStep to show execution order
          stackItems.sort((a, b) => a.firstStep - b.firstStep)
          setCallStack(stackItems)
        } else {
          setCallStack([])
        }
        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching call stack:', error)
        setCallStack([])
        setIsLoading(false)
      }
    }

    fetchCallStack()

    // Listen for debugger step changes
    const handleStepChange = () => {
      fetchCallStack()
    }

    plugin.on('debugger', 'debuggingStepChanged', handleStepChange)

    return () => {
      plugin.off('debugger', 'debuggingStepChanged', handleStepChange)
    }
  }, [plugin])

  if (isLoading) {
    return (
      <div className="debugger-call-stack p-3">
        <div className="text-muted">Loading call stack...</div>
      </div>
    )
  }

  if (callStack.length === 0) {
    return (
      <div className="debugger-call-stack p-3">
        <div className="text-muted">No call stack available</div>
      </div>
    )
  }

  return (
    <div className="debugger-call-stack p-3">
      <div className="call-stack-list">
        {callStack.map((item, index) => {
          // Determine call type
          let callTypeLabel = 'CALL'
          let callTypeClass = 'call'

          if (item.isCreation) {
            callTypeLabel = 'CREATE'
            callTypeClass = 'create'
          } else if (item.visibility === 'internal') {
            callTypeLabel = 'INTERNAL'
            callTypeClass = 'internal'
          } else if (item.visibility === 'external' || item.visibility === 'public') {
            callTypeLabel = 'EXTERNAL'
            callTypeClass = 'external'
          }

          return (
            <div key={index} className="call-stack-item" style={{ paddingLeft: `${Math.min(index * 12, 60)}px` }}>
              <div className="call-stack-line">
                <span className="call-stack-step">{item.firstStep}</span>
                <span className={`call-stack-type ${callTypeClass}`}>
                  {callTypeLabel}
                </span>
                <span className="call-stack-function">
                  {item.functionName}()
                </span>
                <span className="call-stack-gas">{item.gasCost} gas</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DebuggerCallStack
