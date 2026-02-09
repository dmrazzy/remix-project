import React, { useState, useEffect } from 'react' // eslint-disable-line
import './DebuggerCallStack.css'

interface DebuggerCallStackProps {
  plugin: any
}

export const DebuggerCallStack = ({ plugin }: DebuggerCallStackProps) => {
  const [selectedScope, setSelectedScope] = useState<any>(null)
  const [deployments, setDeployments] = useState<any[]>([])

  useEffect(() => {
    // Listen for scope selection from debugger UI
    const handleScopeSelected = (scope: any, deps: any[]) => {
      setSelectedScope(scope)
      setDeployments(deps || [])
    }

    plugin.on('debugger', 'scopeSelected', handleScopeSelected)

    return () => {
      plugin.off('debugger', 'scopeSelected', handleScopeSelected)
    }
  }, [plugin])

  const getContractName = (address: string): string => {
    if (!address || !deployments) return ''

    // Find contract by address
    const contract = deployments.find((d: any) =>
      d.address && d.address.toLowerCase() === address.toLowerCase()
    )

    return contract?.name || ''
  }

  const renderExecutionItem = (scope: any, depth: number = 0): JSX.Element => {
    const opcode = scope.opcodeInfo?.op || ''
    const itemName = scope.functionDefinition?.name || scope.functionDefinition?.kind || (scope.isCreation ? 'constructor' : 'low-level')

    // Determine call type
    let callTypeLabel = 'INTERNAL'
    let callTypeClass = 'internal'

    if (opcode === 'DELEGATECALL') {
      callTypeLabel = 'DELEGATECALL'
      callTypeClass = 'delegatecall'
    } else if (opcode === 'STATICCALL') {
      callTypeLabel = 'STATICCALL'
      callTypeClass = 'staticcall'
    } else if (opcode === 'CALL') {
      callTypeLabel = 'CALL'
      callTypeClass = 'call'
    } else if (opcode === 'CREATE' || opcode === 'CREATE2' || scope.isCreation) {
      callTypeLabel = 'CREATE'
      callTypeClass = 'create'
    }

    // Get contract name and format as contractName.methodName or contractName.EventName
    const contractName = getContractName(scope.address)
    const contractIdentifier = contractName || (scope.address ? `${scope.address.substring(0, 6)}...${scope.address.substring(scope.address.length - 4)}` : '')
    const displayName = contractIdentifier ? `${contractIdentifier}.${itemName}` : itemName

    return (
      <div key={scope.scopeId}>
        <div className="call-stack-item" style={{ paddingLeft: `${depth * 16}px` }}>
          <div className="call-stack-line">
            <span className="call-stack-step">{scope.firstStep}</span>
            <span className={`call-stack-type ${callTypeClass}`}>
              {callTypeLabel}
            </span>
            <span className="call-stack-function">
              {displayName}
            </span>
            <span className="call-stack-gas">{scope.gasCost} gas</span>
          </div>
        </div>
        {scope.children && scope.children.length > 0 && (
          <div className="call-stack-children">
            {scope.children.map((child: any) => renderExecutionItem(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (!selectedScope) {
    return (
      <div className="debugger-call-stack p-3">
        <div className="text-muted">Select a call from Call Trace to view execution details</div>
      </div>
    )
  }

  return (
    <div className="debugger-call-stack p-3">
      <div className="call-stack-list">
        {renderExecutionItem(selectedScope, 0)}
      </div>
    </div>
  )
}

export default DebuggerCallStack
