/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { shortenAddress } from "@remix-ui/helper"
import { RunTab } from "../types/run-tab"
import { trackMatomoEvent } from '@remix-api'
import { clearInstances, setAccount, setExecEnv } from "./actions"
import { displayNotification, fetchAccountsListFailed, fetchAccountsListRequest, fetchAccountsListSuccess, setMatchPassphrase, setPassphrase } from "./payload"
import { toChecksumAddress, bytesToHex, isZeroAddress } from '@ethereumjs/util'
import { aaSupportedNetworks, aaLocalStorageKey, getPimlicoBundlerURL, toAddress } from '@remix-project/remix-lib'
import { SmartAccount } from "../types"
import { BrowserProvider, BaseWallet, SigningKey, isAddress } from "ethers"
import "viem/window"
import { custom, createWalletClient, createPublicClient, http } from "viem"
import * as chains from "viem/chains"
import { entryPoint07Address } from "viem/account-abstraction"
const { createSmartAccountClient } = require("permissionless") /* eslint-disable-line  @typescript-eslint/no-var-requires */
const { toSafeSmartAccount } = require("permissionless/accounts") /* eslint-disable-line  @typescript-eslint/no-var-requires */
const { createPimlicoClient } = require("permissionless/clients/pimlico") /* eslint-disable-line  @typescript-eslint/no-var-requires */

const _getProviderDropdownValue = (plugin: RunTab): string => {
  return plugin.blockchain.getProvider()
}

export const setExecutionContext = (plugin: RunTab, dispatch: React.Dispatch<any>, executionContext: { context: string, fork: string }) => {
  if (executionContext.context && executionContext.context !== plugin.REACT_API.selectExEnv) {
    if (executionContext.context === 'walletconnect') {
      setWalletConnectExecutionContext(plugin, dispatch, executionContext)
    } else {
      plugin.blockchain.changeExecutionContext(executionContext, null, (alertMsg) => {
        plugin.call('notification', 'toast', alertMsg)
      }, async () => {})
    }
  }
}

export const delegationAuthorization = async (contractAddress: string, plugin: RunTab) => {
  try {
    if (!isAddress(toChecksumAddress(contractAddress))) {
      await plugin.call('terminal', 'log', { type: 'info', value: `Please use an ethereum address of a contract deployed in the current chain.` })
      return
    }
  } catch (e) {
    throw new Error(`Error while validating the provided contract address. \n ${e.message}`)
  }

  const provider = {
    request: async (query) => {
      const ret = await plugin.call('web3Provider', 'sendAsync', query)
      return ret.result
    }
  }

  plugin.call('terminal', 'log', { type: 'info', value: !isZeroAddress(contractAddress) ? 'Signing and activating delegation...' : 'Removing delegation...' })

  const ethersProvider = new BrowserProvider(provider)
  const pKey = await ethersProvider.send('eth_getPKey', [plugin.REACT_API.accounts.selectedAccount])
  const authSignerPKey = new BaseWallet(new SigningKey(bytesToHex(pKey)), ethersProvider)
  const auth = await authSignerPKey.authorize({ address: contractAddress, chainId: 0 });
  const signerForAuth = Object.keys(plugin.REACT_API.accounts.loadedAccounts).find((a) => a !== plugin.REACT_API.accounts.selectedAccount)
  const signer = await ethersProvider.getSigner(signerForAuth)
  let tx

  try {
    tx = await signer.sendTransaction({
      type: 4,
      to: plugin.REACT_API.accounts.selectedAccount,
      authorizationList: [auth]
    });
  } catch (e) {
    console.error(e)
    throw e
  }

  let receipt
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
      plugin.call('udapp', 'addInstance', plugin.REACT_API.accounts.selectedAccount, artefact.contract.abi, 'Delegated ' + artefact.name, contractObject)
      await plugin.call('compilerArtefacts', 'addResolvedContract', plugin.REACT_API.accounts.selectedAccount, data)
      plugin.call('terminal', 'log', { type: 'info',
        value: `Contract interation with ${plugin.REACT_API.accounts.selectedAccount} has been added to the deployed contracts. Please make sure the contract is pinned.` })
    }
    plugin.call('terminal', 'log', { type: 'info',
      value: `Delegation for ${plugin.REACT_API.accounts.selectedAccount} activated. This account will be running the code located at ${contractAddress} .` })
  } else {
    plugin.call('terminal', 'log', { type: 'info',
      value: `Delegation for ${plugin.REACT_API.accounts.selectedAccount} removed.` })
  }

  await plugin.call('blockchain', 'dumpState')

  return { txHash: receipt.hash }
}

export const signMessageWithAddress = (plugin: RunTab, dispatch: React.Dispatch<any>, account: string, message: string, modalContent: (hash: string, data: string) => JSX.Element, passphrase?: string) => {
  plugin.blockchain.signMessage(message, account, passphrase, (err, msgHash, signedData) => {
    if (err) {
      console.error(err)
      return plugin.call('notification', 'toast', typeof err === 'string' ? err : err.message)
    }
    dispatch(displayNotification('Signed Message', modalContent(msgHash, signedData), 'OK', null, () => {}, null))
  })
}

export const addFileInternal = async (plugin: RunTab, path: string, content: string) => {
  const file = await plugin.call('fileManager', 'writeFileNoRewrite', path, content)
  await plugin.call('fileManager', 'open', file.newPath)
}

const setWalletConnectExecutionContext = (plugin: RunTab, dispatch: React.Dispatch<any>, executionContext: { context: string, fork: string }) => {
  plugin.call('walletconnect', 'openModal').then(() => {
    plugin.on('walletconnect', 'connectionSuccessful', () => {
      plugin.blockchain.changeExecutionContext(executionContext, null, (alertMsg) => {
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
  })
}

const cleanupWalletConnectEvents = (plugin: RunTab) => {
  plugin.off('walletconnect', 'connectionFailed')
  plugin.off('walletconnect', 'connectionDisconnected')
  plugin.off('walletconnect', 'connectionSuccessful')
}
