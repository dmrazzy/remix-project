import React from "react"
import { Plugin } from "@remixproject/engine"
import { Actions, Provider, SmartAccount, WidgetState } from "../types"
import { trackMatomoEvent } from "@remix-api"
import { IntlShape } from "react-intl"
import { addFVSProvider } from "./providers"
import { aaLocalStorageKey, aaSupportedNetworks, getPimlicoBundlerURL, toAddress } from "@remix-project/remix-lib"
import * as chains from "viem/chains"
import { custom, createWalletClient, createPublicClient, http } from "viem"
export * from "./providers"
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { EnvironmentPlugin } from 'apps/remix-ide/src/app/udapp/udappEnv'
import { entryPoint07Address } from "viem/account-abstraction"
const { createSmartAccountClient } = require("permissionless") /* eslint-disable-line  @typescript-eslint/no-var-requires */
const { toSafeSmartAccount } = require("permissionless/accounts") /* eslint-disable-line  @typescript-eslint/no-var-requires */
const { createPimlicoClient } = require("permissionless/clients/pimlico") /* eslint-disable-line  @typescript-eslint/no-var-requires */

export async function resetVmState (plugin: EnvironmentPlugin, widgetState: WidgetState) {
  const context = widgetState.providers.selectedProvider
  const contextExists = await plugin.call('fileManager', 'exists', `.states/${context}/state.json`)

  if (!contextExists) {
    plugin.call('notification', 'toast', `State not available to reset, as no transactions have been made for selected environment & selected workspace.`)
    throw new Error('State not available to reset')
  }

  const currentProvider = await plugin.call('blockchain', 'getCurrentProvider')
  // Reset environment blocks and account data
  await currentProvider.resetEnvironment()
  // Remove deployed and pinned contracts from UI
  await plugin.call('udapp', 'clearAllInstances')
  // Delete environment state file
  await plugin.call('fileManager', 'remove', `.states/${context}/state.json`)
  // If there are pinned contracts, delete pinned contracts folder
  const isPinnedContracts = await plugin.call('fileManager', 'exists', `.deploys/pinned-contracts/${context}`)
  if (isPinnedContracts) await plugin.call('fileManager', 'remove', `.deploys/pinned-contracts/${context}`)
  plugin.call('notification', 'toast', `VM state reset successfully.`)
  trackMatomoEvent(plugin, { category: 'udapp', action: 'deleteState', name: 'VM state reset', isClick: false })
}

export async function forkState (plugin: EnvironmentPlugin, dispatch: React.Dispatch<Actions>, currentProvider: Provider, forkName: string) {
  const provider = currentProvider

  if (!provider) {
    plugin.call('notification', 'toast', `Provider not found.`)
    throw new Error('Provider not found')
  }
  let context = provider.name
  context = context.replace('vm-fs-', '')

  let currentStateDb
  try {
    currentStateDb = JSON.parse(await plugin.call('blockchain', 'getStateDetails'))
  } catch (e) {
    plugin.call('notification', 'toast', `State not available to fork.`)
    throw e
  }

  if (Object.keys(currentStateDb.db).length === 0) {
    plugin.call('notification', 'toast', `State not available to fork, as no transactions have been made for selected environment & selected workspace.`)
    throw new Error('State not available to fork')
  }

  currentStateDb.stateName = forkName
  currentStateDb.forkName = provider.config.fork
  currentStateDb.nodeUrl = provider.config.nodeUrl
  currentStateDb.savingTimestamp = Date.now()
  await plugin.call('fileManager', 'writeFile', `.states/forked_states/${currentStateDb.stateName}.json`, JSON.stringify(currentStateDb, null, 2))
  await addFVSProvider(`.states/forked_states/${currentStateDb.stateName}.json`, 20, plugin, dispatch)
  const name = `vm-fs-${currentStateDb.stateName}`

  // trackMatomoEvent(plugin, { category: 'blockchain', action: 'providerPinned', name: name, isClick: false })
  // this.emit('providersChanged')
  await plugin.call('blockchain', 'changeExecutionContext', { context: name }, null, null, null)
  plugin.call('notification', 'toast', `New environment '${currentStateDb.stateName}' created with forked state.`)

  // we also need to copy the pinned contracts:
  if (await plugin.call('fileManager', 'exists', `.deploys/pinned-contracts/${provider.name}`)) {
    const files = await plugin.call('fileManager', 'readdir', `.deploys/pinned-contracts/${provider.name}`)
    if (files && Object.keys(files).length) {
      await plugin.call('fileManager', 'copyDir', `.deploys/pinned-contracts/${provider.name}`, `.deploys/pinned-contracts`, 'vm-fs-' + currentStateDb.stateName)
    }
  }
  trackMatomoEvent(plugin, { category: 'udapp', action: 'forkState', name: `forked from ${context}`, isClick: false })
}

export async function setExecutionContext (provider: Provider, plugin: EnvironmentPlugin, widgetState: WidgetState, dispatch: React.Dispatch<Actions>) {
  if (provider.name !== widgetState.providers.selectedProvider) {
    if (provider.name === 'walletconnect') {
      await setWalletConnectExecutionContext(plugin, { context: provider.name, fork: provider.config.fork })
    } else {
      await plugin.call('blockchain', 'changeExecutionContext', { context: provider.name, fork: provider.config.fork }, null, (alertMsg) => {
        plugin.call('notification', 'toast', alertMsg)
      }, async () => {})
    }
    dispatch({ type: 'SET_CURRENT_PROVIDER', payload: provider.name })
    plugin.emit('providersChanged', provider)
    if (provider.category === 'Browser Extension') {
      await plugin.call('layout', 'maximiseSidePanel', 0.25)
    } else {
      await plugin.call('layout', 'resetSidePanel')
    }
  }
}

async function setWalletConnectExecutionContext (plugin: Plugin, executionContext: { context: string, fork: string }) {
  await plugin.call('walletconnect', 'openModal')
  plugin.on('walletconnect', 'connectionSuccessful', () => {
    plugin.call('blockchain', 'changeExecutionContext', executionContext, null, (alertMsg) => {
      plugin.call('notification', 'toast', alertMsg)
    }, async () => {})
  })
  plugin.on('walletconnect', 'connectionFailed', (msg) => {
    plugin.call('notification', 'toast', msg)
    cleanupWalletConnectEvents(plugin)
  })
  plugin.on('walletconnect', 'connectionDisconnected', (msg) => {
    plugin.call('notification', 'toast', msg)
    cleanupWalletConnectEvents(plugin)
  })
}

function cleanupWalletConnectEvents (plugin: Plugin) {
  plugin.off('walletconnect', 'connectionFailed')
  plugin.off('walletconnect', 'connectionDisconnected')
  plugin.off('walletconnect', 'connectionSuccessful')
}

export async function getAccountsList (plugin: EnvironmentPlugin, dispatch: React.Dispatch<Actions>, widgetState: WidgetState) {
  let accounts = await plugin.call('blockchain', 'getAccounts')
  const provider = await plugin.call('blockchain', 'getProvider')
  let safeAddresses = []

  if (provider && provider.startsWith('injected') && accounts?.length) {
    const smartAccountsStr = localStorage.getItem(aaLocalStorageKey)
    let smartAccounts = {}

    if (smartAccountsStr) {
      const smartAccountsObj = JSON.parse(smartAccountsStr)

      if (smartAccountsObj[widgetState.network.chainId]) {
        smartAccounts = smartAccountsObj[widgetState.network.chainId]
      } else {
        smartAccountsObj[widgetState.network.chainId] = {}
        localStorage.setItem(aaLocalStorageKey, JSON.stringify(smartAccountsObj))
      }
    } else {
      const objToStore = {}
      objToStore[widgetState.network.chainId] = {}
      localStorage.setItem(aaLocalStorageKey, JSON.stringify(objToStore))
    }
    if (Object.keys(smartAccounts).length) {
      safeAddresses = Object.keys(smartAccounts)
      accounts.push(...safeAddresses)
    }
  }
  if (!accounts) accounts = []

  const defaultAccounts = []
  const smartAccounts = []
  let index = 1
  for (const account of accounts) {
    const balance = await plugin.blockchain.getBalanceInEther(account)
    if (provider.startsWith('injected') && plugin.blockchain && plugin.blockchain['networkNativeCurrency'] && plugin.blockchain['networkNativeCurrency'].symbol)
      defaultAccounts.push({
        alias: `Account ${index}`,
        account: account,
        balance: parseFloat(balance).toFixed(4),
        symbol: plugin.blockchain['networkNativeCurrency'].symbol
      })
    else
      defaultAccounts.push({
        alias: `Account ${index}`,
        account: account,
        balance: parseFloat(balance).toFixed(4),
        symbol: plugin.blockchain['networkNativeCurrency'].symbol
      })
    if (safeAddresses.length && safeAddresses.includes(account)) smartAccounts.push({
      alias: `Account ${index}`,
      account: account,
      balance: parseFloat(balance).toFixed(4)
    })
    index++
  }

  dispatch({ type: 'SET_ACCOUNTS', payload: defaultAccounts })
  dispatch({ type: 'SET_SMART_ACCOUNTS', payload: smartAccounts })
}

export async function createNewAccount (plugin: EnvironmentPlugin, widgetState: WidgetState, dispatch: React.Dispatch<Actions>) {
  try {
    const address = await plugin.call('blockchain', 'newAccount')

    plugin.call('notification', 'toast', `account ${address} created`)
    await getAccountsList(plugin, dispatch, widgetState)
  } catch (error) {
    return plugin.call('notification', 'toast', 'Cannot create an account: ' + error)
  }
}

export async function createSmartAccount (plugin: EnvironmentPlugin, widgetState: WidgetState, dispatch: React.Dispatch<Actions>) {
  plugin.call('notification', 'toast', `Preparing tx to sign...`)
  const chainId = widgetState.network.chainId
  console.log('chainId: ', chainId)
  const chain = chains[aaSupportedNetworks[chainId].name]
  const PUBLIC_NODE_URL = aaSupportedNetworks[chainId].publicNodeUrl
  const BUNDLER_URL = getPimlicoBundlerURL(chainId)
  const safeAddresses: string[] = widgetState.accounts.smartAccounts.map(account => account.account)
  let salt

  // @ts-ignore
  const [account] = await window.ethereum!.request({ method: 'eth_requestAccounts' })

  const walletClient = createWalletClient({
    account,
    chain,
    transport: custom(window.ethereum!),
  })

  const publicClient = createPublicClient({
    chain,
    transport: http(PUBLIC_NODE_URL) // choose any provider here
  })

  const safeAddressesLength = safeAddresses.length
  if (safeAddressesLength) {
    const lastSafeAddress: string = safeAddresses[safeAddressesLength - 1]
    const lastSmartAccount = widgetState.accounts.smartAccounts.find(account => account.account === lastSafeAddress)
    salt = lastSmartAccount.salt + 1
  } else salt = 0

  try {
    const safeAccount = await toSafeSmartAccount({
      client: publicClient,
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
      },
      owners: [walletClient],
      saltNonce: salt,
      version: "1.4.1"
    })

    const paymasterClient = createPimlicoClient({
      transport: http(BUNDLER_URL),
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
      },
    })

    const saClient = createSmartAccountClient({
      account: safeAccount,
      chain,
      paymaster: paymasterClient,
      bundlerTransport: http(BUNDLER_URL),
      userOperation: {
        estimateFeesPerGas: async () => (await paymasterClient.getUserOperationGasPrice()).fast,
      }
    })

    // Make a dummy tx to force smart account deployment
    const useropHash = await saClient.sendUserOperation({
      calls: [{
        to: toAddress,
        value: 0
      }]
    })
    plugin.call('notification', 'toast', `Waiting for tx confirmation, can take 5-10 seconds...`)
    await saClient.waitForUserOperationReceipt({ hash: useropHash })

    console.log('safeAccount: ', safeAccount)

    // To verify creation, check if there is a contract code at this address
    const safeAddress = safeAccount.address
    const sAccount: SmartAccount = {
      alias: `Smart Account ${safeAddressesLength + 1}`,
      account : safeAccount.address,
      balance: '0',
      salt,
      ownerEOA: account,
      timestamp: Date.now()
    }
    const smartAccounts = [...widgetState.accounts.smartAccounts, sAccount]
    // Save smart accounts in local storage
    const smartAccountsStr = localStorage.getItem(aaLocalStorageKey)
    if (!smartAccountsStr) {
      const objToStore = {}
      objToStore[chainId] = smartAccounts
      localStorage.setItem(aaLocalStorageKey, JSON.stringify(objToStore))
    } else {
      const smartAccountsObj = JSON.parse(smartAccountsStr)
      smartAccountsObj[chainId] = smartAccounts
      localStorage.setItem(aaLocalStorageKey, JSON.stringify(smartAccountsObj))
    }
    await getAccountsList(plugin, dispatch, widgetState)
    await trackMatomoEvent(plugin, { category: 'udapp', action: 'safeSmartAccount', name: `createdSuccessfullyForChainID:${chainId}`, isClick: false })
    return plugin.call('notification', 'toast', `Safe account ${safeAccount.address} created for owner ${account}`)
  } catch (error) {
    await trackMatomoEvent(plugin, { category: 'udapp', action: 'safeSmartAccount', name: `creationFailedWithError:${error.message}`, isClick: false })
    console.error('Failed to create safe smart account: ', error)
    if (error.message.includes('User rejected the request')) return plugin.call('notification', 'toast', `User rejected the request to create safe smart account !!!`)
    else return plugin.call('notification', 'toast', `Failed to create safe smart account !!!`)
  }
}
