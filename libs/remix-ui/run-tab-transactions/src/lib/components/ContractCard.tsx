import React, { useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { Deployment, Transaction } from '../types'
import { CustomTooltip } from '@remix-ui/helper'

interface ContractCardProps {
  deployment: Deployment
  transactions: Transaction[]
  onDebugTransaction: (txHash: string) => void
}

export const ContractCard = ({ deployment, transactions, onDebugTransaction }: ContractCardProps) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const [copyTooltip, setCopyTooltip] = useState('Copy Address')
  const [copyTxTooltips, setCopyTxTooltips] = useState<{ [key: number]: string }>({})

  const formatAddress = (address: string | undefined) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopyTooltip('Copied')
  }

  const resetTooltip = () => {
    setTimeout(() => {
      setCopyTooltip('Copy Address')
    }, 500)
  }

  const copyTxHashToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopyTxTooltips(prev => ({ ...prev, [index]: 'Copied' }))
  }

  const resetTxTooltip = (index: number) => {
    setTimeout(() => {
      setCopyTxTooltips(prev => ({ ...prev, [index]: 'Copy Hash' }))
    }, 500)
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'just now'
  }

  return (
    <div className="contract-card mb-3 border rounded">
      <div className="contract-card-header p-3 bg-light cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="d-flex justify-content-between align-items-start">
          <div className="flex-grow-1">
            <div className="fw-bold">{deployment.name}</div>
            <div className="d-flex align-items-center mt-1">
              <span className="text-muted small">{formatAddress(deployment.address)}</span>
              <CustomTooltip tooltipText={copyTooltip} tooltipId="contract-address-copy-tooltip" placement="top">
                <button
                  className="btn btn-sm btn-link p-0 ms-2"
                  onClick={(e) => {
                    e.stopPropagation()
                    copyToClipboard(deployment.address || '')
                  }}
                  onMouseLeave={resetTooltip}
                >
                  <i className="far fa-copy"></i>
                </button>
              </CustomTooltip>
            </div>
          </div>
          <div className="text-end">
            <span className="badge bg-primary">
              {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}
            </span>
            <div className="text-muted small mt-1">Deployed {formatRelativeTime(deployment.timestamp)}</div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="contract-card-content p-3">
          {transactions.length > 0 ? (
            <div className="list-group list-group-flush">
              {transactions.map((transaction, index) => (
                <div key={index} className="list-group-item px-0">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div className="d-flex align-items-center">
                      <span className={`me-2 ${transaction.status === 'success' || transaction.status === '0x1' || transaction.status === 'true' ? 'text-success' : 'text-danger'}`}>
                        {transaction.status === 'success' || transaction.status === '0x1' || transaction.status === 'true' ? (
                          <i className="fas fa-check-circle"></i>
                        ) : (
                          <i className="fas fa-times-circle"></i>
                        )}
                      </span>
                      <span className="fw-bold">
                        {transaction.functionName || <FormattedMessage id="debugger.unknownMethod" defaultMessage="Unknown method" />}
                      </span>
                    </div>
                    <span className="text-muted small">{formatTimestamp(transaction.timestamp)}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center">
                      <span className="text-muted small">
                        <FormattedMessage id="debugger.txHash" defaultMessage="Hash:" /> {formatAddress(transaction.hash)}
                      </span>
                      <CustomTooltip
                        tooltipText={copyTxTooltips[index] || 'Copy Hash'}
                        tooltipId={`tx-hash-copy-tooltip-${index}`}
                        placement="top"
                      >
                        <button
                          className="btn btn-sm btn-link p-0 ms-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            copyTxHashToClipboard(transaction.hash || '', index)
                          }}
                          onMouseLeave={() => resetTxTooltip(index)}
                        >
                          <i className="far fa-copy"></i>
                        </button>
                      </CustomTooltip>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => onDebugTransaction(transaction.hash)}
                      title={transaction.hash}
                    >
                      <i className="fas fa-bug"></i> <FormattedMessage id="debugger.debug" defaultMessage="Debug" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted mb-0">
              <FormattedMessage id="debugger.noTransactions" defaultMessage="No transactions yet" />
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default ContractCard
