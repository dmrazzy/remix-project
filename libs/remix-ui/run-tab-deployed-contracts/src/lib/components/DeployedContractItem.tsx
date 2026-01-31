import React, { useContext, useEffect, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { CustomToggle, CustomTooltip, getTimeAgo, shortenAddress } from '@remix-ui/helper'
import { CopyToClipboard } from '@remix-ui/clipboard'
import * as remixLib from '@remix-project/remix-lib'
import { Dropdown } from 'react-bootstrap'
import { parseUnits } from 'ethers'
import { DeployedContractsAppContext } from '../contexts'
import { DeployedContract } from '../types'
import { runTransactions } from '../actions'

const txHelper = remixLib.execution.txHelper

interface DeployedContractItemProps {
  contract: DeployedContract
  index: number
}

export function DeployedContractItem({ contract, index }: DeployedContractItemProps) {
  const { dispatch, plugin, themeQuality } = useContext(DeployedContractsAppContext)
  const [networkName, setNetworkName] = useState<string>('')
  const [isExpanded, setIsExpanded] = useState<boolean>(false)
  const [contractABI, setContractABI] = useState(null)
  const [value, setValue] = useState<number>(0)
  const [valueUnit, setValueUnit] = useState<string>('wei')
  const [gasLimit, setGasLimit] = useState<number>(0) // 0 means auto
  const [funcInputs, setFuncInputs] = useState<Record<number, string>>({})

  useEffect(() => {
    plugin.call('udappEnv', 'getNetwork').then((net) => {
      if (net && net.name) {
        const networkName = net.name === 'VM' ? 'Remix VM' : net.name

        setNetworkName(networkName)
      }
    })
  }, [])

  useEffect(() => {
    if (!contract.abi) {
      const abi = txHelper.sortAbiFunction(contract.contractData.abi)

      setContractABI(abi)
    } else {
      setContractABI(contract.abi)
    }
  }, [])

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation()

    // Remove from pinned contracts if pinned
    if (contract.isPinned) {
      const network = await plugin.call('udappEnv', 'getNetwork')
      const chainId = network?.chainId
      await plugin.call('fileManager', 'remove', `.deploys/pinned-contracts/${chainId}/${contract.address}.json`)
    }

    dispatch({ type: 'REMOVE_CONTRACT', payload: contract.address })
  }

  const handlePinContract = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const network = await plugin.call('udappEnv', 'getNetwork')
    const chainId = network?.chainId
    const providerName = network?.name === 'VM' ? await plugin.call('udappEnv', 'getSelectedProvider') : chainId

    // Toggle pin/unpin
    if (contract.isPinned) {
      // Unpin the contract
      await plugin.call('fileManager', 'remove', `.deploys/pinned-contracts/${providerName}/${contract.address}.json`)
      dispatch({ type: 'UNPIN_CONTRACT', payload: index })
      return
    }

    // Pin the contract
    const provider = await plugin.call('blockchain', 'getProviderObject')
    if (!provider.config.statePath && provider.config.isRpcForkedState) {
      // we can't pin a contract in the following case:
      // - state is not persisted
      // - future state is browser stored (e.g it's not just a simple RPC provider)
      plugin.call('notification', 'toast', 'Cannot pin this contract in the current context: state is not persisted. Please fork this provider to start pinning a contract to it.')
      return
    }

    const workspace = await plugin.call('filePanel', 'getCurrentWorkspace')

    const objToSave = {
      name: contract.name,
      address: contract.address,
      timestamp: contract.timestamp,
      abi: contract.abi || contract.contractData?.abi,
      filePath: contract.filePath || `${workspace.name}/${contract.contractData?.contract?.file}`,
      pinnedAt: Date.now()
    }

    await plugin.call('fileManager', 'writeFile', `.deploys/pinned-contracts/${providerName}/${contract.address}.json`, JSON.stringify(objToSave, null, 2))

    dispatch({ type: 'PIN_CONTRACT', payload: { index, pinnedAt: objToSave.pinnedAt, filePath: objToSave.filePath } })
  }

  const handleContractClick = () => {
    setIsExpanded(!isExpanded)
  }

  const handleExecuteTransaction = async (funcABI: any, funcIndex: number, lookupOnly: boolean) => {
    const inputsValues = funcInputs[funcIndex] || ''
    const sendValue = parseUnits(value.toString() || '0', valueUnit || 'gwei').toString()
    const gasLimitValue = gasLimit.toString()

    try {
      await runTransactions(
        plugin,
        dispatch,
        index,
        lookupOnly,
        funcABI,
        inputsValues,
        contract,
        funcIndex,
        { value: sendValue, gasLimit: gasLimitValue }
      )
    } catch (error) {
      console.error('Error executing transaction:', error)
      await plugin.call('notification', 'toast', `Error: ${error.message}`)
    }
  }

  const handleInputChange = (funcIndex: number, value: string) => {
    setFuncInputs(prev => ({
      ...prev,
      [funcIndex]: value
    }))
  }

  return (
    <div className="mb-3">
      <div
        className="d-flex align-items-center p-3 rounded"
        style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', cursor: 'pointer' }}
      >
        <div className="me-auto text-nowrap text-truncate overflow-hidden w-100">
          <div className="d-flex align-items-center justify-content-between w-100" onClick={handleContractClick}>
            <div className='d-flex'>
              <CustomTooltip
                placement="top"
                tooltipClasses="text-nowrap"
                tooltipId="udapp_deployedContractPinTooltip"
                tooltipText={contract.isPinned ? `Pinned at: ${new Date(contract.pinnedAt).toLocaleString()}` : 'Pin contract'}
              >
                <i
                  className={`${contract.isPinned ? 'fa-solid' : 'fa-regular'} fa-thumbtack align-self-center pe-2`}
                  style={{ cursor: 'pointer' }}
                  onClick={handlePinContract}
                ></i>
              </CustomTooltip>
              <div className='d-flex flex-column align-items-start'>
                <div className="text-truncate text-secondary d-flex align-items-center">
                  <span>{contract.name}</span>
                </div>
                <div className="font-sm" style={{ color: 'var(--bs-tertiary-color)', position: 'relative' }}>
                  <span className="text-dark">{shortenAddress(contract.address)}</span>
                  <CopyToClipboard tip="Copy address" icon="fa-copy" direction="top" getContent={() => contract?.address}>
                    <i className="fa-solid fa-copy small ms-1" style={{ cursor: 'pointer' }}></i>
                  </CopyToClipboard>
                </div>
              </div>
            </div>
            <div className='d-flex' style={{ color: 'var(--bs-tertiary-color)' }}>
              <div className='d-flex flex-column align-items-end'>
                <span className='badge text-info' style={{ backgroundColor: '#64C4FF14' }}>{networkName}</span>
                <span className='small'>{getTimeAgo(contract.timestamp, { truncateTimeAgo: true })} ago</span>
              </div>
              <i
                className="fas fa-ellipsis-v align-self-center ps-3"
                style={{ cursor: 'pointer' }}
                onClick={(e) => e.stopPropagation()}
              ></i>
            </div>
          </div>
          {/* Expanded Contract Interface */}
          {isExpanded && (
            <div className="mt-3 border-top" onClick={(e) => e.stopPropagation()}>
              {contractABI && contractABI.length > 0 ? (
                <>
                  <div className="py-3 pb-2">
                    {contractABI
                      .filter((item: any) => item.type === 'function')
                      .map((funcABI: any, funcIndex: number) => {
                        if (funcABI.type !== 'function') return null
                        const isConstant = funcABI.constant !== undefined ? funcABI.constant : false
                        const lookupOnly = funcABI.stateMutability === 'view' || funcABI.stateMutability === 'pure' || isConstant
                        const inputs = funcABI.inputs ? txHelper.inputParametersDeclarationToString(funcABI.inputs) : ''

                        return (
                          <div key={funcIndex} className="mb-1 p-2 rounded">
                            <div className="d-flex align-items-center mb-2" key={funcIndex}>
                              {
                                funcABI.stateMutability === 'view' || funcABI.stateMutability === 'pure' ?
                                  <span className='badge text-info me-1' style={{ backgroundColor: '#64C4FF14' }}>call</span>
                                  : funcABI.stateMutability === 'payable' ? <span className='badge text-danger me-1' style={{ backgroundColor: '#FF777714' }}>payable</span>
                                    : <span className='badge text-warning me-1' style={{ backgroundColor: '#FFB96414' }}>transact</span>
                              }
                              <label className="mb-0 me-1 text-secondary">
                                { funcABI.name }
                              </label>
                              <span style={{ fontWeight: 'lighter' }}>
                                { inputs }
                              </span>
                            </div>
                            <div className="position-relative flex-fill">
                              <input
                                type="text"
                                placeholder={inputs ? inputs.split(' ')[0] : ''}
                                className="form-control"
                                value={funcInputs[funcIndex] || ''}
                                onChange={(e) => handleInputChange(funcIndex, e.target.value)}
                                style={{
                                  backgroundColor: 'var(--bs-body-bg)',
                                  color: themeQuality === 'dark' ? 'white' : 'black', flex: 1, padding: '0.75rem', paddingRight: '4.5rem', fontSize: '0.75rem',
                                  cursor: lookupOnly || !inputs ? 'not-allowed' : 'text'
                                }}
                                disabled={lookupOnly || !inputs}
                              />
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleExecuteTransaction(funcABI, funcIndex, lookupOnly)}
                                style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', zIndex: 2, fontSize: '0.65rem', fontWeight: 'bold' }}
                              >
                              Execute
                              </button>
                            </div>
                          </div>
                        )})}
                    {/* Value and Gas Limit */}
                    <div className='border-top pt-3'>
                      {/* Value */}
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <label className="mb-2" style={{ fontSize: '0.9rem', minWidth: '75px', color: themeQuality === 'dark' ? 'white' : 'black' }}>
                          <FormattedMessage id="udapp.value" defaultMessage="Value" />
                        </label>
                        <div className="position-relative flex-fill">
                          <input
                            id='value'
                            type="number"
                            className="form-control form-control-sm border-0"
                            placeholder="000000000000000000000000000000000"
                            value={value}
                            onChange={(e) => setValue(parseInt(e.target.value) || 0)}
                            style={{ backgroundColor: 'var(--bs-body-bg)', color: themeQuality === 'dark' ? 'white' : 'black', flex: 1, paddingRight: '4rem' }}
                          />
                          <Dropdown style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}>
                            <Dropdown.Toggle
                              as={CustomToggle}
                              className="btn-sm border-0 p-0 ps-1 text-secondary rounded"
                              style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', color: themeQuality === 'dark' ? 'white' : 'black' }}
                              icon="fas fa-caret-down ms-2"
                              useDefaultIcon={false}
                            >
                              {valueUnit}
                            </Dropdown.Toggle>
                            <Dropdown.Menu style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black' } as React.CSSProperties}>
                              <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => setValueUnit('wei')} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>wei</Dropdown.Item>
                              <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => setValueUnit('gwei')} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>gwei</Dropdown.Item>
                              <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => setValueUnit('finney')} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>finney</Dropdown.Item>
                              <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => setValueUnit('ether')} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>ether</Dropdown.Item>
                            </Dropdown.Menu>
                          </Dropdown>
                        </div>
                      </div>

                      {/* Gas Limit */}
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <label className="mb-2" style={{ fontSize: '0.9rem', minWidth: '75px', color: themeQuality === 'dark' ? 'white' : 'black' }}>
                          <FormattedMessage id="udapp.gasLimit" defaultMessage="Gas limit" />
                        </label>
                        <div className="position-relative flex-fill">
                          <span
                            className="p-1 pt-0 rounded"
                            style={{
                              position: 'absolute',
                              left: '0.5rem',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              backgroundColor: 'var(--custom-onsurface-layer-2)',
                              color: 'var(--bs-primary)',
                              cursor: 'pointer',
                              zIndex: 1
                            }}
                            onClick={() => {
                              if (gasLimit === 0) {
                                // Switch from auto to custom - set a default value
                                setGasLimit(3000000)
                              } else {
                                // Switch from custom to auto - set to 0
                                setGasLimit(0)
                              }
                            }}
                          >
                            {gasLimit === 0 ? 'auto' : 'custom'}
                          </span>
                          <input
                            type="number"
                            className="form-control form-control-sm border-0"
                            placeholder="0000000"
                            value={gasLimit}
                            onChange={(e) => setGasLimit(parseInt(e.target.value))}
                            disabled={gasLimit === 0}
                            style={{
                              backgroundColor: 'var(--bs-body-bg)',
                              color: themeQuality === 'dark' ? 'white' : 'black',
                              flex: 1,
                              paddingLeft: '4rem',
                              opacity: gasLimit === 0 ? 0.6 : 1,
                              cursor: gasLimit === 0 ? 'not-allowed' : 'text'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className='d-flex justify-content-between pt-3 border-top'>
                    <div>Balance</div>
                    <div>0 ETH</div>
                  </div>
                </>
              ) : (
                <div className="text-muted pt-3 text-center">No ABI available for this contract</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
