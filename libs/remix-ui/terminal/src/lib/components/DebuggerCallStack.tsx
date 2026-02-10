import React, { useState, useEffect } from 'react' // eslint-disable-line
import './DebuggerCallStack.css'

interface DebuggerCallStackProps {
  plugin: any
}

export const DebuggerCallStack = ({ plugin }: DebuggerCallStackProps) => {
  const [selectedScope, setSelectedScope] = useState<any>(null)
  const [deployments, setDeployments] = useState<any[]>([])
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Listen for scope selection from debugger UI
    const handleScopeSelected = (scope: any, deps: any[]) => {
      setSelectedScope(scope)
      setDeployments(deps || [])
      // Auto-expand the selected scope
      if (scope?.scopeId) {
        setExpandedScopes(new Set([scope.scopeId]))
      }
    }

    plugin.on('debugger', 'scopeSelected', handleScopeSelected)

    return () => {
      plugin.off('debugger', 'scopeSelected', handleScopeSelected)
    }
  }, [plugin])

  const toggleScope = (scopeId: string) => {
    setExpandedScopes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(scopeId)) {
        newSet.delete(scopeId)
      } else {
        newSet.add(scopeId)
      }
      return newSet
    })
  }

  const getContractName = (address: string, scope?: any): string => {
    if (!deployments || deployments.length === 0) {
      return ''
    }

    // Check if address is a placeholder for contract creation
    const isCreationPlaceholder = address && (address.includes('Contract Creation') || address.startsWith('(Contract Creation'))

    if (isCreationPlaceholder && scope?.isCreation) {
      // For any contract creation scope with placeholder address, return the deployment name
      // This assumes we're debugging a transaction that's in the deployments list
      if (deployments.length > 0 && deployments[0].name !== 'Unknown') {
        return deployments[0].name
      }
    }

    if (!address || isCreationPlaceholder) {
      return ''
    }

    // Normalize address for comparison (remove 0x prefix, lowercase)
    const normalizeAddr = (addr: string) => {
      return addr.toLowerCase().replace(/^0x/, '')
    }

    const normalizedAddress = normalizeAddr(address)

    // Find contract by address
    const contract = deployments.find((d: any) => {
      if (!d.address) return false
      return normalizeAddr(d.address) === normalizedAddress
    })

    // If we have a contract from deployments, return its name (but not if it's 'Unknown')
    if (contract?.name && contract.name !== 'Unknown') {
      return contract.name
    }

    // For CREATE operations, try to extract contract name from functionDefinition
    if (scope?.functionDefinition?.contractName) {
      return scope.functionDefinition.contractName
    }

    return ''
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

    // Get contract name and address
    const contractName = getContractName(scope.address, scope)

    // Check if address is a placeholder for contract creation
    const isCreationPlaceholder = scope.address && (scope.address.includes('Contract Creation') || scope.address.startsWith('(Contract Creation'))

    // Only create shortened address if it's a real address, not a placeholder
    const contractAddress = scope.address && !isCreationPlaceholder
      ? `${scope.address.substring(0, 6)}...${scope.address.substring(scope.address.length - 4)}`
      : ''

    // For CREATE operations, simplify display to just show contract name
    const isCreate = callTypeLabel === 'CREATE'

    const hasChildren = scope.children && scope.children.length > 0
    const isExpanded = expandedScopes.has(scope.scopeId)

    return (
      <div key={scope.scopeId}>
        <div className="call-stack-item">
          <div className="call-stack-line">
            <span className="call-stack-step">{scope.firstStep}</span>
            <div style={{
              paddingLeft: `${0.5 + depth * 20}px`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flex: 1,
              borderLeft: depth > 0 ? '2px solid var(--bs-border-color)' : 'none',
              marginLeft: depth > 0 ? '0.5rem' : '0'
            }}>
              {hasChildren && (
                <i
                  className={`fas ${isExpanded ? 'fa-minus-square' : 'fa-plus-square'} call-stack-expand-icon`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleScope(scope.scopeId)
                  }}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                />
              )}
              {!hasChildren && <span style={{ width: '14px' }}></span>}
              <span className={`call-stack-type ${callTypeClass}`}>
                {callTypeLabel}
              </span>
              <span className="call-stack-function">
                {isCreate ? (
                  // For CREATE operations, show contract name or address
                  contractName ? (
                    <span className="contract-name">{contractName}</span>
                  ) : contractAddress ? (
                    <span className="contract-name">{contractAddress}</span>
                  ) : (
                    <span className="method-name">Contract Creation</span>
                  )
                ) : (
                  // For other operations, show contract.method format
                  <>
                    {contractName ? (
                      <>
                        <span className="contract-name">{contractName}</span>
                        <span>.</span>
                      </>
                    ) : contractAddress ? (
                      <>
                        <span className="contract-name">({contractAddress})</span>
                        <span>.</span>
                      </>
                    ) : null}
                    <span className="method-name">{itemName}</span>
                  </>
                )}
              </span>
              <span className="call-stack-gas"><i className="fas fa-gas-pump"></i> {scope.gasCost}</span>
            </div>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <>
            {scope.children.map((child: any) => renderExecutionItem(child, depth + 1))}
          </>
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
    <div className="debugger-call-stack p-3 pt-0">
      <div className="call-stack-list">
        {renderExecutionItem(selectedScope, 0)}
      </div>
    </div>
  )
}

export default DebuggerCallStack
