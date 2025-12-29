import React from "react"
import { Plugin } from "@remixproject/engine"
import { Actions, Provider, SmartAccount, WidgetState } from "../types"
import { trackMatomoEvent } from "@remix-api"
import { IntlShape } from "react-intl"
import { addFVSProvider } from "./providers"
import { aaLocalStorageKey, aaSupportedNetworks, getPimlicoBundlerURL, toAddress } from "@remix-project/remix-lib"
import * as chains from "viem/chains"
import { custom, createWalletClient, createPublicClient, http } from "viem"
import { BrowserProvider, BaseWallet, SigningKey, isAddress } from "ethers"
import { toChecksumAddress, bytesToHex, isZeroAddress } from '@ethereumjs/util'
import { isAccountDeleted, getAccountAlias, deleteAccount as deleteAccountFromStorage, setAccountAlias, clearAccountPreferences } from '../utils/accountStorage'
export * from "./providers"
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { EnvironmentPlugin } from 'apps/remix-ide/src/app/udapp/udappEnv'
import { entryPoint07Address } from "viem/account-abstraction"
const { createSmartAccountClient } = require("permissionless") /* eslint-disable-line  @typescript-eslint/no-var-requires */
const { toSafeSmartAccount } = require("permissionless/accounts") /* eslint-disable-line  @typescript-eslint/no-var-requires */
const { createPimlicoClient } = require("permissionless/clients/pimlico") /* eslint-disable-line  @typescript-eslint/no-var-requires */

export async function resetVmState (plugin: EnvironmentPlugin, widgetState: WidgetState, dispatch: React.Dispatch<Actions>) {
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
  // Clear account preferences (aliases and deleted accounts)
  clearAccountPreferences()
  // Refresh account list to show default names and all accounts
  await getAccountsList(plugin, dispatch, widgetState)
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

  // Filter out deleted accounts
  accounts = accounts.filter(account => !isAccountDeleted(account))

  const defaultAccounts = []
  const smartAccounts = []
  let index = 1
  for (const account of accounts) {
    const balance = await plugin.blockchain.getBalanceInEther(account)
    // Get custom alias or use default
    const customAlias = getAccountAlias(account)
    const alias = customAlias || `Account ${index}`

    if (provider.startsWith('injected') && plugin.blockchain && plugin.blockchain['networkNativeCurrency'] && plugin.blockchain['networkNativeCurrency'].symbol)
      defaultAccounts.push({
        alias: alias,
        account: account,
        balance: parseFloat(balance).toFixed(4),
        symbol: plugin.blockchain['networkNativeCurrency'].symbol
      })
    else
      defaultAccounts.push({
        alias: alias,
        account: account,
        balance: parseFloat(balance).toFixed(4),
        symbol: plugin.blockchain['networkNativeCurrency'].symbol
      })
    if (safeAddresses.length && safeAddresses.includes(account)) smartAccounts.push({
      alias: alias,
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

export async function authorizeDelegation (contractAddress: string, plugin: EnvironmentPlugin, widgetState: WidgetState) {
  try {
    if (!isAddress(toChecksumAddress(contractAddress))) {
      await plugin.call('terminal', 'log', { type: 'info', value: `Please use an ethereum address of a contract deployed in the current chain.` })
      throw new Error('Invalid contract address')
    }
  } catch (e) {
    throw new Error(`Error while validating the provided contract address. \n ${e.message}`)
  }

  const provider = {
    request: async (query: any) => {
      const ret = await plugin.call('web3Provider', 'sendAsync', query)
      return ret.result
    }
  }

  plugin.call('terminal', 'log', { type: 'info', value: !isZeroAddress(contractAddress) ? 'Signing and activating delegation...' : 'Removing delegation...' })

  const ethersProvider = new BrowserProvider(provider)
  const pKey = await ethersProvider.send('eth_getPKey', [widgetState.accounts.selectedAccount])
  const authSignerPKey = new BaseWallet(new SigningKey(bytesToHex(pKey)), ethersProvider)
  const auth = await authSignerPKey.authorize({ address: contractAddress, chainId: 0 });
  const signerForAuth = widgetState.accounts.defaultAccounts.find((a) => a.account !== widgetState.accounts.selectedAccount)?.account
  const signer = await ethersProvider.getSigner(signerForAuth)
  let tx: any

  try {
    tx = await signer.sendTransaction({
      type: 4,
      to: widgetState.accounts.selectedAccount,
      authorizationList: [auth]
    });
  } catch (e) {
    console.error(e)
    throw e
  }

  let receipt: any
  try {
    receipt = await tx.wait()
  } catch (e) {
    console.error(e)
    throw e
  }

  if (!isZeroAddress(contractAddress)) {
    const artefact = await plugin.call('compilerArtefacts', 'getContractDataFromAddress', contractAddress)
    if (artefact) {
      const data = await plugin.call('compilerArtefacts', 'getCompilerAbstract', artefact.file)
      const contractObject = {
        name: artefact.name,
        abi: artefact.contract.abi,
        compiler: data,
        contract: {
          file : artefact.file,
          object: artefact.contract
        }
      }
      // plugin.call('udapp', 'addInstance', widgetState.accounts.selectedAccount, artefact.contract.abi, 'Delegated ' + artefact.name, contractObject)
      await plugin.call('compilerArtefacts', 'addResolvedContract', widgetState.accounts.selectedAccount, data)
      plugin.call('terminal', 'log', { type: 'info',
        value: `Contract interation with ${widgetState.accounts.selectedAccount} has been added to the deployed contracts. Please make sure the contract is pinned.` })
    }
    plugin.call('terminal', 'log', { type: 'info',
      value: `Delegation for ${widgetState.accounts.selectedAccount} activated. This account will be running the code located at ${contractAddress} .` })
  } else {
    plugin.call('terminal', 'log', { type: 'info',
      value: `Delegation for ${widgetState.accounts.selectedAccount} removed.` })
  }

  await plugin.call('blockchain', 'dumpState')

  return { txHash: receipt.hash }
}

export async function signMessageWithAddress (
  plugin: EnvironmentPlugin,
  account: string,
  message: string,
  passphrase?: string
): Promise<{ msgHash: string, signedData: string }> {
  try {
    const result = await plugin.call('blockchain', 'signMessage', message, account, passphrase)
    return result
  } catch (err) {
    console.error(err)
    const errorMsg = typeof err === 'string' ? err : err.message
    plugin.call('notification', 'toast', errorMsg)
    throw err
  }
}

export async function deleteAccountAction (
  accountAddress: string,
  plugin: EnvironmentPlugin,
  widgetState: WidgetState,
  dispatch: React.Dispatch<Actions>
) {
  // If this is the selected account, switch to the first available account
  if (widgetState.accounts.selectedAccount === accountAddress) {
    const remainingAccounts = widgetState.accounts.defaultAccounts.filter(
      acc => acc.account !== accountAddress
    )
    if (remainingAccounts.length > 0) {
      dispatch({ type: 'SET_SELECTED_ACCOUNT', payload: remainingAccounts[0].account })
    }
  }

  // Mark account as deleted in localStorage
  deleteAccountFromStorage(accountAddress)

  // Refresh accounts list
  await getAccountsList(plugin, dispatch, widgetState)

  plugin.call('notification', 'toast', `Account ${accountAddress} deleted`)
}

export async function updateAccountAlias (
  accountAddress: string,
  newAlias: string,
  plugin: EnvironmentPlugin,
  widgetState: WidgetState,
  dispatch: React.Dispatch<Actions>
) {
  // Save alias to localStorage
  setAccountAlias(accountAddress, newAlias)

  // Refresh accounts list to show updated alias
  await getAccountsList(plugin, dispatch, widgetState)

  plugin.call('notification', 'toast', `Account alias updated to "${newAlias}"`)
}
