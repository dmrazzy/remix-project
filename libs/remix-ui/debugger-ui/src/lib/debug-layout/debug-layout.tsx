import React, { useState } from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import SearchBar from '../search-bar/search-bar' // eslint-disable-line
import { CustomTooltip } from '@remix-ui/helper'
import './debug-layout.css'

interface DebugLayoutProps {
  onSearch: (txHash: string) => void
  debugging: boolean
  currentTxHash?: string
  onStopDebugging: () => void
  currentBlock: any
  currentReceipt: any
  currentTransaction: any
  traceData?: any
  currentFunction?: string
  functionStack?: any[]
  nestedScopes?: any[]
  deployments?: any[]
  onScopeSelected?: (scope: any) => void
}

export const DebugLayout = ({
  onSearch,
  debugging,
  currentTxHash,
  onStopDebugging,
  currentBlock,
  currentReceipt,
  currentTransaction,
  traceData,
  currentFunction,
  functionStack,
  nestedScopes,
  deployments,
  onScopeSelected
}: DebugLayoutProps) => {
  const [activeObjectTab, setActiveObjectTab] = useState<'json' | 'raw'>('json')
  const [copyTooltips, setCopyTooltips] = useState<{ [key: string]: string }>({
    from: 'Copy address',
    to: 'Copy address'
  })
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(new Set())
  const [selectedScope, setSelectedScope] = useState<any>(null)

  const formatAddress = (address: string | undefined) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text)
    setCopyTooltips(prev => ({ ...prev, [fieldName]: 'Copied!' }))
  }

  const resetTooltip = (fieldName: string) => {
    setTimeout(() => {
      setCopyTooltips(prev => ({ ...prev, [fieldName]: 'Copy address' }))
    }, 500)
  }

  const renderGlobalVariables = () => {
    const tx = currentTransaction
    const block = currentBlock
    const receipt = currentReceipt

    // Get input data (can be either 'data' or 'input' property)
    const inputData = tx?.data || tx?.input

    // Determine status
    const status = receipt?.status === 1 || receipt?.status === '0x1' || receipt?.status === 'true' || receipt?.status === true || receipt?.status === 'success' ? 'success' : 'failed'

    // Extract function name from input data if available
    let functionName = 'N/A'

    // Check if it's a contract creation first (no 'to' address or has contractAddress)
    if (!tx?.to || receipt?.contractAddress) {
      functionName = 'Contract Creation'
    } else if (currentFunction) {
      // Use currentFunction prop if available (decoded function name from debugger)
      functionName = currentFunction
    } else if (tx && inputData) {
      if (inputData === '0x' || inputData === '') {
        // Empty input means it's a simple transfer
        functionName = 'Transfer'
      } else if (inputData.length >= 10) {
        // Has input data, show the method signature
        const methodId = inputData.substring(0, 10)
        functionName = methodId
      }
    }

    // Format timestamp
    const timestamp = block?.timestamp ? new Date(parseInt(block.timestamp) * 1000).toLocaleString() : 'N/A'

    // Calculate tx fee
    const txFee = receipt && tx ?
      (BigInt(receipt.gasUsed || 0) * BigInt(tx.gasPrice || 0)).toString() + ' Wei' : 'N/A'

    // Get tx type
    const txType = tx?.type !== undefined ? `Type ${tx.type}` : 'Legacy'

    // Format gas price
    const gasPrice = tx?.gasPrice ? BigInt(tx.gasPrice).toString() + ' Wei' : 'N/A'

    // Gas used
    const gasUsed = receipt?.gasUsed ? receipt.gasUsed.toString() : 'N/A'

    // Transaction value
    const txValue = tx?.value ? BigInt(tx.value).toString() + ' Wei' : '0 Wei'

    return (
      <div className="global-variables-grid">
        {/* Row 1: Status | Tx Fee */}
        <div className="global-var-item">
          <span className="global-var-key">Status:</span>
          <span className={`global-var-value tx-status ${status}`}>
            {status === 'success' ? 'Success' : 'Failed'}
          </span>
        </div>
        <div className="global-var-item">
          <span className="global-var-key">Tx Fee:</span>
          <span className="global-var-value text-theme-contrast">{txFee}</span>
        </div>

        {/* Row 2: Block | Tx Type */}
        <div className="global-var-item">
          <span className="global-var-key">Block:</span>
          <span className="global-var-value text-theme-contrast">{block?.number || 'N/A'}</span>
        </div>
        <div className="global-var-item">
          <span className="global-var-key">Tx Type:</span>
          <span className="global-var-value text-theme-contrast">{txType}</span>
        </div>

        {/* Row 3: Timestamp | Gas Price */}
        <div className="global-var-item">
          <span className="global-var-key">Timestamp:</span>
          <span className="global-var-value text-theme-contrast">{timestamp}</span>
        </div>
        <div className="global-var-item">
          <span className="global-var-key">Gas Price:</span>
          <span className="global-var-value text-theme-contrast">{gasPrice}</span>
        </div>

        {/* Row 4: From | Gas Used */}
        <div className="global-var-item">
          <span className="global-var-key">From:</span>
          <span className="global-var-value text-theme-contrast">
            {tx?.from ? formatAddress(tx.from) : 'N/A'}
            {tx?.from && (
              <CustomTooltip tooltipText={copyTooltips.from} tooltipId="from-address-tooltip" placement="top">
                <i
                  className={`far ${copyTooltips.from === 'Copied!' ? 'fa-check' : 'fa-copy'} ms-2`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => copyToClipboard(tx.from, 'from')}
                  onMouseLeave={() => resetTooltip('from')}
                />
              </CustomTooltip>
            )}
          </span>
        </div>
        <div className="global-var-item">
          <span className="global-var-key">Gas Used:</span>
          <span className="global-var-value text-theme-contrast">{gasUsed}</span>
        </div>

        {/* Row 5: To | Tx Index */}
        <div className="global-var-item">
          <span className="global-var-key">To:</span>
          <span className="global-var-value text-theme-contrast">
            {formatAddress(tx?.to || receipt?.contractAddress || '') || 'N/A'}
            {(tx?.to || receipt?.contractAddress) && (
              <CustomTooltip tooltipText={copyTooltips.to} tooltipId="to-address-tooltip" placement="top">
                <i
                  className={`far ${copyTooltips.to === 'Copied!' ? 'fa-check' : 'fa-copy'} ms-2`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => copyToClipboard(tx?.to || receipt?.contractAddress || '', 'to')}
                  onMouseLeave={() => resetTooltip('to')}
                />
              </CustomTooltip>
            )}
          </span>
        </div>
        <div className="global-var-item">
          <span className="global-var-key">Tx Index:</span>
          <span className="global-var-value text-theme-contrast">{receipt?.transactionIndex !== undefined ? receipt.transactionIndex : 'N/A'}</span>
        </div>

        {/* Row 6: Function | Tx Nonce */}
        <div className="global-var-item">
          <span className="global-var-key">Function:</span>
          <span className="global-var-value text-theme-contrast">{functionName}</span>
        </div>
        <div className="global-var-item">
          <span className="global-var-key">Tx Nonce:</span>
          <span className="global-var-value text-theme-contrast">{tx?.nonce !== undefined ? tx.nonce : 'N/A'}</span>
        </div>

        {/* Row 7: Value | (empty) */}
        <div className="global-var-item">
          <span className="global-var-key">Value:</span>
          <span className="global-var-value text-theme-contrast">{txValue}</span>
        </div>
      </div>
    )
  }

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

  const getContractName = (address: string): string => {
    if (!address || !deployments) return ''

    // Find contract by address
    const contract = deployments.find(d =>
      d.address && d.address.toLowerCase() === address.toLowerCase()
    )

    return contract?.name || ''
  }

  const isExternalCall = (opcode: string): boolean => {
    return ['CALL', 'DELEGATECALL', 'STATICCALL', 'CREATE', 'CREATE2'].includes(opcode)
  }

  const collectExternalCalls = (scope: any): any[] => {
    const items: any[] = []
    const opcode = scope.opcodeInfo?.op || ''

    // Check if this scope itself is an external call
    if (isExternalCall(opcode) || scope.isCreation) {
      items.push(scope)
    }

    // Recursively collect from children
    if (scope.children && scope.children.length > 0) {
      scope.children.forEach((child: any) => {
        items.push(...collectExternalCalls(child))
      })
    }

    return items
  }

  const renderScopeItem = (scope: any, depth: number = 0): JSX.Element => {
    const opcode = scope.opcodeInfo?.op || ''
    let callTypeLabel = ''

    if (opcode === 'DELEGATECALL') {
      callTypeLabel = 'DELEGATECALL'
    } else if (opcode === 'STATICCALL') {
      callTypeLabel = 'STATICCALL'
    } else if (opcode === 'CALL') {
      callTypeLabel = 'CALL'
    } else if (opcode === 'CREATE' || opcode === 'CREATE2' || scope.isCreation) {
      callTypeLabel = 'CREATE'
    } else {
      callTypeLabel = 'TRANSACTION'
    }

    // Collect external calls from all descendants (including deeply nested)
    let externalChildren: any[] = []
    if (scope.children && scope.children.length > 0) {
      scope.children.forEach((child: any) => {
        externalChildren.push(...collectExternalCalls(child))
      })
    }
    const hasChildren = externalChildren.length > 0
    const isExpanded = expandedScopes.has(scope.scopeId)
    const isSelected = selectedScope?.scopeId === scope.scopeId

    // Get function/method name
    const itemName = scope.functionDefinition?.name || scope.functionDefinition?.kind || (scope.isCreation ? 'constructor' : 'fallback')

    // Get contract name from address
    const contractName = getContractName(scope.address)
    const contractAddress = scope.address ? `${scope.address.substring(0, 6)}...${scope.address.substring(scope.address.length - 4)}` : ''

    return (
      <div key={scope.scopeId}>
        <div
          className={`call-trace-item ${isSelected ? 'selected' : ''}`}
          onClick={() => {
            setSelectedScope(scope)
            if (onScopeSelected) {
              onScopeSelected(scope)
            }
          }}
        >
          <div className="call-trace-line">
            <span className="call-trace-step">{scope.firstStep}</span>
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
                  className={`fas ${isExpanded ? 'fa-minus-square' : 'fa-plus-square'} call-trace-expand-icon`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleScope(scope.scopeId)
                  }}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                />
              )}
              {!hasChildren && <span style={{ width: '14px' }}></span>}
              <span className={`call-trace-type ${callTypeLabel.toLowerCase()}`}>
                {callTypeLabel}
              </span>
              <span className="call-trace-function">
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
              </span>
              <span className="call-trace-gas">{scope.gasCost} gas</span>
            </div>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <>
            {externalChildren.map((child: any) => renderScopeItem(child, depth + 1))}
          </>
        )}
      </div>
    )
  }

  const renderCallTrace = () => {
    // Use nested scopes if available
    if (nestedScopes && nestedScopes.length > 0) {
      return (
        <div className="call-trace-list">
          {nestedScopes.map((scope) => renderScopeItem(scope, 0))}
        </div>
      )
    }

    // Fallback to old implementation
    if (!functionStack || functionStack.length === 0) {
      return (
        <p className="text-muted">
          <FormattedMessage id="debugger.noCallTrace" defaultMessage="No call trace available" />
        </p>
      )
    }

    return (
      <div className="call-trace-list">
        {functionStack.map((func, index) => {
          const functionName = func.functionDefinition?.name || func.functionDefinition?.kind || 'Unknown'
          const callType = func.callType || func.functionDefinition?.visibility || ''
          const inputs = func.inputs || []
          const gasCost = func.gasCost || 0
          const step = func.firstStep !== undefined ? func.firstStep : '-'

          // Determine call type icon and label
          let callTypeLabel = ''
          if (callType.includes('delegate') || func.isDelegateCall) {
            callTypeLabel = 'DELEGATECALL'
          } else if (callType.includes('static') || func.isStaticCall) {
            callTypeLabel = 'STATICCALL'
          } else if (functionName === 'constructor' || func.functionDefinition?.kind === 'constructor') {
            callTypeLabel = 'CREATE'
          } else {
            callTypeLabel = 'CALL'
          }

          return (
            <div key={index} className="call-trace-item">
              <div className="call-trace-line">
                <span className="call-trace-step">{step}</span>
                <div style={{
                  paddingLeft: `${0.5 + index * 12}px`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flex: 1,
                  borderLeft: index > 0 ? '2px solid var(--bs-border-color)' : 'none',
                  marginLeft: index > 0 ? '0.5rem' : '0'
                }}>
                  <span className={`call-trace-type ${callTypeLabel.toLowerCase()}`}>
                    {callTypeLabel}
                  </span>
                  <span className="call-trace-function">
                    <span className="method-name">{functionName}</span>({inputs.join(', ')})
                  </span>
                  <span className="call-trace-gas">{gasCost} gas</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderObjectContent = () => {
    const tx = currentTransaction
    const receipt = currentReceipt

    // Get input data (can be either 'data' or 'input' property)
    const inputData = tx?.data || tx?.input

    // Extract function name
    let functionName = 'N/A'

    // Check if it's a contract creation first (no 'to' address or has contractAddress)
    if (!tx?.to || receipt?.contractAddress) {
      functionName = 'Contract Creation'
    } else if (currentFunction) {
      // Use currentFunction prop if available (decoded function name from debugger)
      functionName = currentFunction
    } else if (tx && inputData) {
      if (inputData === '0x' || inputData === '') {
        functionName = 'Transfer'
      } else if (inputData.length >= 10) {
        const methodId = inputData.substring(0, 10)
        functionName = methodId
      }
    }

    // msg.sender is the transaction sender
    const msgSender = tx?.from || 'N/A'

    // Extract parameters from transaction input (strip function selector)
    let parameters = 'N/A'
    if (tx && inputData) {
      if (inputData === '0x' || inputData === '') {
        parameters = !tx.to ? 'Contract Bytecode' : 'None (ETH Transfer)'
      } else if (inputData.length > 10) {
        // Strip the function selector (first 10 chars including '0x')
        parameters = '0x' + inputData.substring(10)
      } else {
        parameters = inputData
      }
    }

    // Extract return values from receipt logs if available
    const returnValues = receipt?.logs && receipt.logs.length > 0
      ? receipt.logs
      : 'No events emitted'

    const objectData = {
      'msg.sender': msgSender,
      function: functionName,
      parameters: parameters,
      returnValues: returnValues
    }

    if (activeObjectTab === 'json') {
      return (
        <pre className="debug-object-content">
          {JSON.stringify(objectData, null, 2)}
        </pre>
      )
    } else {
      return (
        <pre className="debug-object-content">
          {JSON.stringify(objectData)}
        </pre>
      )
    }
  }

  return (
    <div className="debug-layout">
      {/* Section 1: Search Bar + Transaction Global Values */}
      <div className="debug-section debug-section-search">
        <SearchBar
          onSearch={onSearch}
          debugging={debugging}
          currentTxHash={currentTxHash}
          onStopDebugging={onStopDebugging}
        />
        <div className="mt-3 ms-3">
          {renderGlobalVariables()}
        </div>
      </div>

      {/* Section 2: Call Trace */}
      <div className="debug-section debug-section-trace">
        <div className="debug-section-header">
          <h6 className="debug-section-title">
            Call Trace (Trace Length: {(traceData && traceData.traceLength) || 0})
          </h6>
        </div>
        <div className="debug-section-content debug-section-scrollable">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>
            <span className="call-trace-type sender">SENDER</span>
            <span className="call-trace-function">
              {currentTransaction?.from || 'N/A'}
              {currentTransaction?.from && (
                <CustomTooltip tooltipText={copyTooltips.from} tooltipId="sender-address-tooltip" placement="top">
                  <i
                    className={`far ${copyTooltips.from === 'Copied!' ? 'fa-check' : 'fa-copy'} ms-2`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => copyToClipboard(currentTransaction.from, 'from')}
                    onMouseLeave={() => resetTooltip('from')}
                  />
                </CustomTooltip>
              )}
            </span>
          </div>
          {renderCallTrace()}
        </div>
      </div>

      {/* Section 3: Parameters & Return Values */}
      <div className="debug-section debug-section-object">
        <div className="debug-section-header">
          <h6 className="debug-section-title">
            <FormattedMessage id="debugger.parametersAndReturnValues" defaultMessage="Parameters & Return Values" />
          </h6>
          <div className="debug-tabs">
            <button
              className={`debug-tab ${activeObjectTab === 'json' ? 'active' : ''}`}
              onClick={() => setActiveObjectTab('json')}
            >
              <FormattedMessage id="debugger.json" defaultMessage="JSON" />
            </button>
            <button
              className={`debug-tab ${activeObjectTab === 'raw' ? 'active' : ''}`}
              onClick={() => setActiveObjectTab('raw')}
            >
              <FormattedMessage id="debugger.raw" defaultMessage="Raw" />
            </button>
          </div>
        </div>
        <div className="debug-section-content debug-section-scrollable">
          {renderObjectContent()}
        </div>
      </div>
    </div>
  )
}

export default DebugLayout
