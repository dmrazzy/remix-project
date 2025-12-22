import React, { useMemo, useState, useRef } from 'react'
import { AddressToggle, CustomMenu, EnvironmentToggle, shortenAddress } from "@remix-ui/helper"
import { Dropdown } from "react-bootstrap"
import { useIntl } from 'react-intl'
import { EnvAppContext } from '../contexts'
import { useContext } from "react"
import { TrackingContext } from '@remix-ide/tracking'
import { MatomoEvent, UdappEvent } from '@remix-api'
import { createNewAccount, setExecutionContext } from '../actions'
import { EnvCategoryUI } from '../components/envCategoryUI'
import { Provider, Account } from '../types'
import { ForkUI } from '../components/forkUI'
import { ResetUI } from '../components/resetUI'
import { AccountKebabMenu } from '../components/accountKebabMenu'
import '../css/index.css'

function EnvironmentPortraitView() {
  const { plugin, widgetState, dispatch } = useContext(EnvAppContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = UdappEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const intl = useIntl()
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false)
  const [openKebabMenuId, setOpenKebabMenuId] = useState<string | null>(null)
  const kebabIconRefs = useRef<{[key: string]: HTMLElement}>({})

  const handleResetClick = () => {
    trackMatomoEvent({ category: 'udapp', action: 'deleteState', name: 'deleteState clicked', isClick: true })
    dispatch({ type: 'SHOW_RESET_UI', payload: undefined })
  }

  const handleForkClick = () => {
    trackMatomoEvent({ category: 'udapp', action: 'forkState', name: 'forkState clicked', isClick: true })
    dispatch({ type: 'SHOW_FORK_UI', payload: undefined })
  }

  const handleProviderSelection = (provider: Provider) => {
    setExecutionContext(provider, plugin, widgetState, dispatch)
  }

  const handleAccountSelection = (account: Account) => {
    dispatch({ type: 'SET_SELECTED_ACCOUNT', payload: account.account })
  }

  const handleKebabClick = (e: React.MouseEvent, accountId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setOpenKebabMenuId(prev => prev === accountId ? null : accountId)
  }

  const handleNewAccount = () => {
    createNewAccount(plugin, widgetState, dispatch)
    setOpenKebabMenuId(null)
  }

  const handleCreateSmartAccount = (account: Account) => {
    console.log('Create smart account for:', account)
    setOpenKebabMenuId(null)
  }

  const handleAuthorizeDelegation = (account: Account) => {
    console.log('Authorize delegation for:', account)
    setOpenKebabMenuId(null)
  }

  const handleSignUsingAccount = (account: Account) => {
    console.log('Sign using account:', account)
    setOpenKebabMenuId(null)
  }

  const handleDeleteAccount = (account: Account) => {
    console.log('Delete account:', account)
    setOpenKebabMenuId(null)
  }

  const uniqueDropdownItems = useMemo(() => {
    const categoryMap = new Map<string, Provider>()
    const itemsWithoutCategory: Provider[] = []

    widgetState.providers.providerList.forEach((provider) => {
      if (provider.category) {
        // Only add the category once (use first provider with that category)
        if (!categoryMap.has(provider.category)) {
          categoryMap.set(provider.category, provider)
        }
      } else {
        // Providers without category are shown individually
        itemsWithoutCategory.push(provider)
      }
    })

    return [...Array.from(categoryMap.values()), ...itemsWithoutCategory]
  }, [widgetState.providers.providerList])

  const selectedProvider = useMemo(() => {
    return widgetState.providers.providerList.find(provider => provider.name === widgetState.providers.selectedProvider)
  }, [widgetState.providers.selectedProvider])

  const selectedAccount = useMemo(() => {
    return widgetState.accounts.defaultAccounts.find(account => account.account === widgetState.accounts.selectedAccount) || widgetState.accounts.defaultAccounts[0]
  }, [widgetState.accounts.selectedAccount, widgetState.accounts.defaultAccounts])

  return (
    <>
      <div className='card ms-2' style={{ backgroundColor: 'var(--custom-onsurface-layer-1)' }}>
        <div className="d-flex align-items-center justify-content-between p-3">
          <div className="d-flex align-items-center">
            <h6 className="my-auto" style={{ color: 'white' }}>{intl.formatMessage({ id: 'udapp.environment' })}</h6>
          </div>
          <div className="toggle-container">
            {!widgetState.fork.isVisible.forkUI && !widgetState.fork.isVisible.resetUI && (
              <button className='btn btn-primary btn-sm small me-2' style={{ fontSize: '0.7rem' }} onClick={handleForkClick}>
                <i className='fas fa-code-branch'></i> {intl.formatMessage({ id: 'udapp.fork' })}
              </button>
            )}
            {!widgetState.fork.isVisible.forkUI && !widgetState.fork.isVisible.resetUI && (
              <button className='btn btn-outline-danger btn-sm small' style={{ fontSize: '0.7rem' }} onClick={handleResetClick}>
                <i className='fas fa-redo'></i> {intl.formatMessage({ id: 'udapp.reset' })}
              </button>
            )}
          </div>
        </div>
        {widgetState.fork.isVisible.forkUI && <ForkUI />}
        {widgetState.fork.isVisible.resetUI && <ResetUI />}
        {!widgetState.fork.isVisible.forkUI && !widgetState.fork.isVisible.resetUI && (
          <div className="d-flex p-3 pt-0">
            <Dropdown className="w-100">
              <Dropdown.Toggle
                as={EnvironmentToggle}
                className="w-100 d-inline-block border form-control"
                environmentUI={<EnvCategoryUI />}
                style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}
              >
                <div style={{ flexGrow: 1, overflow: 'hidden', display:'flex', justifyContent:'left' }}>
                  <div className="text-truncate text-secondary">
                    <span> { selectedProvider?.category || selectedProvider?.displayName || 'Remix VM' }</span>
                  </div>
                </div>
              </Dropdown.Toggle>

              <Dropdown.Menu as={CustomMenu} className="w-100 custom-dropdown-items overflow-hidden" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', zIndex: 1 }}>
                {
                  uniqueDropdownItems.map((provider, index) => {
                    return (
                      <Dropdown.Item key={index} onClick={() => handleProviderSelection(provider)} className="environment-item-hover">
                        {provider.category ? provider.category : provider.displayName}
                      </Dropdown.Item>
                    )})
                }
              </Dropdown.Menu>
            </Dropdown>
          </div>)}
        {!widgetState.fork.isVisible.resetUI && (
          <div className="d-flex px-3">
            <Dropdown className="w-100" onToggle={(isOpen) => setIsAccountDropdownOpen(isOpen)}>
              <Dropdown.Toggle as={AddressToggle} className={`w-100 d-inline-block border form-control selected-account-hover ${isAccountDropdownOpen ? 'dropdown-open' : ''}`} style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
                <div className="d-flex align-items-center">
                  <div className="me-auto text-nowrap text-truncate overflow-hidden font-sm w-100">
                    <div className="d-flex align-items-center justify-content-between w-100">
                      <div className='d-flex flex-column align-items-start'>
                        <div className="text-truncate text-dark">
                          <span>{selectedAccount?.alias}</span><i className="fa-solid fa-pen small ms-1"></i>
                        </div>
                        <div style={{ color: 'var(--bs-tertiary-color)' }}>
                          <span className="small">{shortenAddress(selectedAccount?.account)}</span><i className="fa-solid fa-copy small ms-1"></i>
                        </div>
                      </div>
                      <div className={`selected-account-balance-container ${openKebabMenuId === 'selected' ? 'kebab-menu-open' : ''}`} style={{ color: 'var(--bs-tertiary-color)' }}>
                        <span className="selected-account-balance-text">{`${selectedAccount?.balance} ${selectedAccount?.symbol}`}</span>
                        <i
                          ref={(el) => {
                            if (el && selectedAccount) kebabIconRefs.current['selected'] = el
                          }}
                          className="selected-account-kebab-icon fas fa-ellipsis-v"
                          onClick={(e) => handleKebabClick(e, 'selected')}
                          style={{ cursor: 'pointer' }}
                        ></i>
                      </div>
                    </div>
                  </div>
                </div>
              </Dropdown.Toggle>

              <AccountKebabMenu
                show={openKebabMenuId === 'selected'}
                target={kebabIconRefs.current['selected']}
                onHide={() => setOpenKebabMenuId(null)}
                account={selectedAccount}
                menuIndex="selected"
                onNewAccount={handleNewAccount}
                onCreateSmartAccount={handleCreateSmartAccount}
                onAuthorizeDelegation={handleAuthorizeDelegation}
                onSignUsingAccount={handleSignUsingAccount}
                onDeleteAccount={handleDeleteAccount}
              />

              <Dropdown.Menu as={CustomMenu} className="w-100 custom-dropdown-items overflow-hidden" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
                {
                  widgetState.accounts.defaultAccounts.map((account, index) => {
                    const accountId = `account-${index}`
                    return (
                      <div key={index}>
                        <Dropdown.Item className="d-flex align-items-center justify-content-between p-1 m-1 account-item-hover" onClick={() => handleAccountSelection(account)} style={{ cursor: 'pointer' }}>
                          <div className='d-flex flex-column align-items-start'>
                            <div className="text-truncate text-dark">
                              <span>{account?.alias}</span>
                            </div>
                            <div style={{ color: 'var(--bs-tertiary-color)' }}>
                              <span className="small">{shortenAddress(account?.account)}</span><i className="fa-solid fa-copy small ms-1"></i>
                            </div>
                          </div>
                          <div className={`account-balance-container ${openKebabMenuId === accountId ? 'kebab-menu-open' : ''}`} style={{ color: 'var(--bs-tertiary-color)' }}>
                            <span className="account-balance-text">{`${account?.balance} ${account?.symbol}`}</span>
                            <i
                              ref={(el) => {
                                if (el) kebabIconRefs.current[accountId] = el
                              }}
                              className="account-kebab-icon fas fa-ellipsis-v"
                              onClick={(e) => handleKebabClick(e, accountId)}
                              style={{ cursor: 'pointer' }}
                            ></i>
                          </div>
                        </Dropdown.Item>
                        <AccountKebabMenu
                          show={openKebabMenuId === accountId}
                          target={kebabIconRefs.current[accountId]}
                          onHide={() => setOpenKebabMenuId(null)}
                          account={account}
                          menuIndex={index}
                          onNewAccount={handleNewAccount}
                          onCreateSmartAccount={handleCreateSmartAccount}
                          onAuthorizeDelegation={handleAuthorizeDelegation}
                          onSignUsingAccount={handleSignUsingAccount}
                          onDeleteAccount={handleDeleteAccount}
                        />
                      </div>
                    )
                  })
                }
              </Dropdown.Menu>
            </Dropdown>
          </div>)}
        <div className="mx-auto py-3" style={{ color: 'var(--bs-tertiary-color)' }}>
          <span className="small me-1">Deployed Contracts</span><span className="small me-2 text-primary">{ 0 }</span>
          <span className="small me-1">Transactions recorded</span><span className="small text-primary">{ 0 }</span>
        </div>
      </div>
    </>
  )
}

export default EnvironmentPortraitView