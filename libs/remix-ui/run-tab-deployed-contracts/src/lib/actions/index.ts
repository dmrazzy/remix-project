import React from 'react'
import { trackMatomoEvent } from '@remix-api'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { DeployedContractsPlugin } from 'apps/remix-ide/src/app/udapp/udappDeployedContracts'
import { Actions } from '../types'

export async function loadAddress (plugin: DeployedContractsPlugin, dispatch: React.Dispatch<Actions>, address: string, currentFile: string, loadType: 'abi' | 'sol' | 'vyper' | 'lexon' | 'contract' | 'other') {
  // Show confirmation modal for ABI files
  if (loadType === 'abi') {
    plugin.call('notification', 'modal', {
      id: 'deployedContractsAtAddress',
      title: 'At Address',
      message: `Do you really want to interact with ${address} using the current ABI definition?`,
      okLabel: 'OK',
      cancelLabel: 'Cancel',
      okFn: async () => {
        try {
          const content = await plugin.call('fileManager', 'readFile', currentFile)
          let abi: any[]

          try {
            abi = JSON.parse(content)
            if (!Array.isArray(abi)) {
              await plugin.call('notification', 'toast', '⚠️ ABI should be an array')
              return
            }
            trackMatomoEvent(plugin, {
              category: 'udapp',
              action: 'useAtAddress',
              name: 'AtAddressLoadWithABI',
              isClick: true
            })
            await plugin.addInstance(address, abi, '<at address>')
            dispatch({ type: 'SET_ADDRESS_INPUT', payload: '' })
          } catch (e) {
            await plugin.call('notification', 'toast', '⚠️ Failed to parse ABI file')
          }
        } catch (e) {
          console.error('Error loading ABI:', e)
          await plugin.call('notification', 'toast', `⚠️ Error: ${e.message}`)
        }},
      cancelFn: () => {
        plugin.call('notification', 'toast', 'Cancelled by user')
      }
    })
  } else if (['sol', 'vyper', 'lexon', 'contract'].includes(loadType)) {
    try {
      const contractList: any = await plugin.call('udappDeploy', 'getCompiledContracts')
      const contract = contractList.find(contract => contract.filePath === currentFile)
      const contractData = contract?.contractData

      if (!contractData) {
        await plugin.call('notification', 'toast', '⚠️ Contract not compiled')
        return
      }

      // Add instance with contract data
      await plugin.addInstance(address, contractData.abi, contractData.name, contractData)
      dispatch({ type: 'SET_ADDRESS_INPUT', payload: '' })
    } catch (e) {
      console.error('Error loading contract:', e)
      await plugin.call('notification', 'toast', `⚠️ Error loading contract: ${e.message}`)
    }
  } else {
    plugin.call('notification', 'toast', '⚠️ Please open a contract ABI file or compile a contract')
  }
}

export async function loadPinnedContracts (plugin: DeployedContractsPlugin, dispatch, dirName) {
  dispatch({ type: 'CLEAR_ALL_CONTRACTS', payload: null })
  const isPinnedAvailable = await plugin.call('fileManager', 'exists', `.deploys/pinned-contracts/${dirName}`)

  if (isPinnedAvailable) {
    try {
      const list = await plugin.call('fileManager', 'readdir', `.deploys/pinned-contracts/${dirName}`)
      const filePaths = Object.keys(list)
      let codeError = false
      for (const file of filePaths) {
        const pinnedContract = await plugin.call('fileManager', 'readFile', file)
        const pinnedContractObj = JSON.parse(pinnedContract)
        const code = await plugin.call('blockchain', 'getCode', pinnedContractObj.address)

        if (code === '0x') {
          codeError = true
          const msg = `Cannot load pinned contract at ${pinnedContractObj.address}: Contract not found at that address.`

          await plugin.call('terminal', 'log', { type: 'error', value: msg })
        } else {
          if (pinnedContractObj) plugin.addInstance(pinnedContractObj.address, pinnedContractObj.abi, null, pinnedContractObj.name, pinnedContractObj.pinnedAt)
        }
      }
      if (codeError) {
        const msg = `Some pinned contracts cannot be loaded.\nCotracts deployed to a (Mainnet, Custom, Sepolia) fork are not persisted unless there were already on chain.\nDirectly forking one of these forks will enable you to use the pinned contracts feature.`
        await plugin.call('terminal', 'log', { type: 'log', value: msg })
      }
    } catch (err) {
      console.log(err)
    }
  }
}