import React, { useMemo, useContext } from 'react'
import { FormattedMessage } from 'react-intl'
import { Dropdown } from 'react-bootstrap'
import { CustomToggle } from '@remix-ui/helper'
import { TransactionsAppContext } from '../contexts'
import { TabType } from '../types'
import { ContractCard } from '../components/ContractCard'

function TransactionsPortraitView() {
  const { plugin, widgetState, dispatch, themeQuality } = useContext(TransactionsAppContext)

  const { activeTab, sortOrder, transactions, deployments } = widgetState

  const handleTabChange = (tab: TabType) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: tab })
  }

  const handleDebugTransaction = (txHash: string) => {
    plugin.call('debugger', 'debug', txHash)
  }

  // Sort deployments based on sort order
  const sortedDeployments = useMemo(() => {
    if (!deployments) return []
    const sorted = [...deployments]
    sorted.sort((a, b) => {
      if (sortOrder === 'newest') {
        return b.timestamp - a.timestamp
      } else {
        return a.timestamp - b.timestamp
      }
    })
    return sorted
  }, [deployments, sortOrder])

  return (
    <div className="card mx-2 my-2" style={{ backgroundColor: 'var(--custom-onsurface-layer-1)', '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black' } as React.CSSProperties}>
      <div className="p-3 d-flex align-items-center justify-content-between" style={{ cursor: 'pointer' }}>
        <div className='d-flex align-items-center gap-2'>
          <h6 className="my-auto" style={{ color: themeQuality === 'dark' ? 'white' : 'black', margin: 0, }}>
            <FormattedMessage id="udapp.transactionRecorderTitle" defaultMessage="Transactions recorder" /> <span className="text-secondary small">0</span>
          </h6>
        </div>
        <div>
          <button className='btn btn-primary btn-sm small p-1' style={{ fontSize: '0.6rem' }}>
            <i className='fa-solid fa-floppy-disk'></i> Save
          </button>
          <button
            className="btn btn-outline-danger btn-sm pe-0"
            data-id="clearAllTransactions"
            style={{ background: 'none', border: 'none' }}
          >
            <i className="far fa-trash-alt text-danger" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div className="transaction-recorder-tabs p-2 pt-0">
        <div className="tabs-filter-container">
          <ul className="nav nav-tabs" role="tablist">
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link ${activeTab === 'Active' ? 'active' : ''} rounded px-2`}
                onClick={() => handleTabChange('Active')}
                type="button"
                role="tab"
                aria-selected={activeTab === 'Active'}
                style={{ backgroundColor: activeTab === 'Active' ? 'var(--custom-onsurface-layer-2)' : '' }}
              >
                <FormattedMessage id="debugger.contractCall" defaultMessage="Active Deployments" />
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link ${activeTab === 'Saved' ? 'active' : ''} rounded px-2`}
                onClick={() => handleTabChange('Saved')}
                type="button"
                role="tab"
                aria-selected={activeTab === 'Saved'}
                style={{ backgroundColor: activeTab === 'Saved' ? 'var(--custom-onsurface-layer-2)' : '' }}
              >
                <FormattedMessage id="debugger.transactionList" defaultMessage="Saved" />
              </button>
            </li>
          </ul>
          <div className="transaction-recorder-filter">
            <Dropdown>
              <Dropdown.Toggle
                as={CustomToggle}
                className="btn-sm border-0 p-1 text-secondary rounded"
                style={{ backgroundColor: 'var(--custom-onsurface-layer-1)', color: themeQuality === 'dark' ? 'white' : 'black' }}
                icon="fas fa-caret-down ms-2"
                useDefaultIcon={false}
              >
                {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
              </Dropdown.Toggle>
              <Dropdown.Menu style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black', padding: 0, '--bs-dropdown-min-width' : '5rem' } as React.CSSProperties}>
                <Dropdown.Item className="unit-dropdown-item-hover small" onClick={() => dispatch({ type: 'SET_SORT_ORDER', payload: 'newest' })} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>Newest</Dropdown.Item>
                <Dropdown.Item className="unit-dropdown-item-hover small" onClick={() => dispatch({ type: 'SET_SORT_ORDER', payload: 'oldest' })} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>Oldest</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </div>

        <div className="tab-content">
          {activeTab === 'Active' && (
            <div className="tab-pane active" role="tabpanel">
              <div className="contract-call-content">
                {sortedDeployments.length > 0 ? (
                  sortedDeployments.map((deployment) => (
                    <ContractCard
                      key={deployment.address}
                      deployment={deployment}
                      transactions={transactions?.get(deployment.address) || []}
                      onDebugTransaction={handleDebugTransaction}
                    />
                  ))
                ) : (
                  <div className="text-muted p-2 mt-2 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
                    <div className="empty-state-text">
                      <FormattedMessage
                        id="debugger.noTransactionsToShow"
                        defaultMessage="There is no deployment to show."
                      />
                    </div>
                    <div>
                      <span>
                        <FormattedMessage
                          id="debugger.initiateFirstTransaction"
                          defaultMessage="Initiate your first transaction by deploying a contract, or learn more following our "
                        />
                      </span>
                      <a href="#">
                        <FormattedMessage
                          id="debugger.inAppTutorials"
                          defaultMessage="in-app tutorials."
                        />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'Saved' && (
            <div className="text-muted p-2 mt-2 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
              <div className="empty-state-text">
                <FormattedMessage
                  id="debugger.noSavedTransactionsToShow"
                  defaultMessage="There are no saved transactions."
                />
              </div>
              <div>
                <span>
                  <FormattedMessage
                    id="debugger.saveFirstTransaction"
                    defaultMessage={`Save and replay active deployments using the action button above.`}
                  />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TransactionsPortraitView