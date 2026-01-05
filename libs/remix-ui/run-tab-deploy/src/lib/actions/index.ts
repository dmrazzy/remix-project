import { Actions, CompilationRawResult, OZDeployMode, VisitedContract } from "../types"
import { Plugin } from "@remixproject/engine"
import { trackMatomoEvent } from "@remix-api"
import { CompilerAbstract } from "@remix-project/remix-solidity"
import type { ContractData } from "@remix-project/core-plugin"
import { execution } from '@remix-project/remix-lib'
import { IntlShape } from "react-intl"
import { deployWithProxyMsg, isOverSizePrompt } from "@remix-ui/helper"

export async function broadcastCompilationResult (compilerName: string, compileRawResult: CompilationRawResult, plugin: Plugin, dispatch: React.Dispatch<Actions>) {
  const { file, source, languageVersion, data, input } = compileRawResult
  await trackMatomoEvent(plugin, { category: 'udapp', action: 'broadcastCompilationResult', name: compilerName, isClick: false })
  // TODO check whether the tab is configured
  const compiler = new CompilerAbstract(languageVersion, data, source, input)
  await plugin.call('compilerArtefacts', 'saveCompilerAbstract', file, compiler)

  const contracts = getCompiledContracts(compiler)
  if (contracts.length > 0) {
    contracts.forEach(async (contract) => {
      if (contract.contract.file !== source.target) {
        dispatch({ type: 'UPDATE_COMPILED_CONTRACT', payload: { name: contract.name, filePath: file, contractData: contract, isUpgradeable: false } })
      } else {
        const isUpgradeable = await plugin.call('openzeppelin-proxy', 'isConcerned', data.sources && data.sources[file] ? data.sources[file].ast : {})

        let proxyOptions = null
        if (isUpgradeable) {
          try {
            const contractProxyOptions = await plugin.call('openzeppelin-proxy', 'getProxyOptions', data, file)

            proxyOptions = contractProxyOptions[contract.name].initializeOptions.inputs
          } catch (error) {
            console.error('Error fetching proxy options:', error)
          }
        }

        dispatch({ type: 'UPDATE_COMPILED_CONTRACT', payload: { name: contract.name, filePath: file, contractData: contract, isUpgradeable: isUpgradeable, proxyOptions } })
      }
    })
  }
}

function getCompiledContracts (compiler: CompilerAbstract) {
  const contracts: ContractData[] = []

  compiler.visitContracts((contract: VisitedContract) => {
    const contractData = getContractData(contract.name, compiler)

    if (contractData && contractData.bytecodeObject.length !== 0) {
      contracts.push(contractData)
    }
  })
  return contracts
}

function getContractData (contractName: string, compiler: CompilerAbstract): ContractData {
  if (!contractName) return null
  if (!compiler) return null

  const contract = compiler.getContract(contractName)

  return {
    name: contractName,
    contract: contract,
    compiler: compiler,
    abi: contract.object.abi,
    bytecodeObject: contract.object.evm.bytecode.object,
    bytecodeLinkReferences: contract.object.evm.bytecode.linkReferences,
    object: contract.object,
    deployedBytecode: contract.object.evm.deployedBytecode,
    getConstructorInterface: () => {
      return execution.txHelper.getConstructorInterface(contract.object.abi)
    },
    getConstructorInputs: () => {
      const constructorInterface = execution.txHelper.getConstructorInterface(contract.object.abi)
      return execution.txHelper.inputParametersDeclarationToString(constructorInterface.inputs)
    },
    isOverSizeLimit: async (args: string) => {
      const encodedParams = await execution.txFormat.encodeParams(args, execution.txHelper.getConstructorInterface(contract.object.abi))
      const bytecode = contract.object.evm.bytecode.object + (encodedParams as any).dataHex
      // https://eips.ethereum.org/EIPS/eip-3860
      const initCodeOversize = bytecode && (bytecode.length / 2 > 2 * 24576)
      const deployedBytecode = contract.object.evm.deployedBytecode
      // https://eips.ethereum.org/EIPS/eip-170
      const deployedBytecodeOversize = deployedBytecode && (deployedBytecode.object.length / 2 > 24576)
      return {
        overSizeEip3860: initCodeOversize,
        overSizeEip170: deployedBytecodeOversize
      }
    },
    metadata: contract.object.metadata
  }
}

export function deployContract(selectedContract: ContractData, args: string, deployMode: OZDeployMode, plugin: Plugin, intl: IntlShape, dispatch: React.Dispatch<Actions>) {
  const isProxyDeployment = deployMode.deployWithProxy
  const isContractUpgrade = deployMode.upgradeWithProxy

  if (selectedContract.bytecodeObject.length === 0) {
    return plugin.call('notification', 'modal', {
      title: intl.formatMessage({ id: 'udapp.alert' }),
      message: intl.formatMessage({ id: 'udapp.thisContractMayBeAbstract' }),
      okLabel: intl.formatMessage({ id: 'udapp.ok' }),
      cancelLabel: intl.formatMessage({ id: 'udapp.cancel' })
    })
  } else {
    // if (selectedContract.name !== currentContract && selectedContract.name === 'ERC1967Proxy') selectedContract.name = currentContract

    if (isProxyDeployment) {
      plugin.call('notification', 'modal', {
        id: 'confirmProxyDeployment',
        title: 'Deploy Implementation & Proxy (ERC1967)',
        message: deployWithProxyMsg(),
        okLabel: intl.formatMessage({ id: 'udapp.proceed' }),
        okFn: async () => {
          try {
            const contract = await createInstance(selectedContract, args, deployMode, false, plugin, dispatch)
            const initABI = contract.selectedContract.abi.find(abi => abi.name === 'initialize')

            plugin.call('openzeppelin-proxy', 'executeUUPSProxy', contract.address, deployMode.deployArgs, initABI, contract.selectedContract)
          } catch (error) {
            console.error(`creation of ${selectedContract.name} errored: ${error.message ? error.message : error}`)
          }
        },
        cancelLabel: intl.formatMessage({ id: 'udapp.cancel' }),
        cancelFn: () => {}
      })
    } else if (isContractUpgrade) {
    //     props.modal(
    //       'Deploy Implementation & Update Proxy',
    //       upgradeWithProxyMsg(),
    //       intl.formatMessage({ id: 'udapp.proceed' }),
    //       () => {
    //         props.createInstance(
    //           loadedContractData,
    //           props.gasEstimationPrompt,
    //           props.passphrasePrompt,
    //           props.publishToStorage,
    //           props.mainnetPrompt,
    //           isOverSizePrompt,
    //           args,
    //           deployMode,
    //           isVerifyChecked
    //         )
    //       },
    //       intl.formatMessage({ id: 'udapp.cancel' }),
    //       () => {}
    //     )
    } else {
      createInstance(selectedContract, args, deployMode, false, plugin, dispatch)
    }
  }
}

export const createInstance = async (selectedContract: ContractData, args, deployMode: OZDeployMode, isVerifyChecked: boolean, plugin: Plugin, dispatch: React.Dispatch<Actions>) => {
  let contractMetadata
  try {
    contractMetadata = await plugin.call('compilerMetadata', 'deployMetadataOf', selectedContract.name, selectedContract.contract.file)
  } catch (error) {
    // return statusCb(`creation of ${selectedContract.name} errored: ${error.message ? error.message : error}`)
  }
  const compilerContracts = await plugin.call('compilerArtefacts', 'getLastCompilationResult')
  const currentParams = !deployMode.deployWithProxy && !deployMode.upgradeWithProxy ? args : ''
  let overSize
  try {
    overSize = await selectedContract.isOverSizeLimit(currentParams)
  } catch (error) {
    // return statusCb(`creation of ${selectedContract.name} errored: ${error.message ? error.message : error}`)
  }
  if (overSize && (overSize.overSizeEip170 || overSize.overSizeEip3860)) {
    return new Promise((resolve, reject) => {
      plugin.call('notification', 'modal', {
        id: 'contractCodeSizeOverLimit',
        title: 'Contract code size over limit',
        message: isOverSizePrompt(overSize),
        okLabel: 'Force Send',
        okFn: async () => {
          await deployOnBlockchain(selectedContract, args, contractMetadata, compilerContracts, plugin)
          resolve(undefined)
        },
        cancelLabel: 'Cancel',
        cancelFn: () => {
          reject(`creation of ${selectedContract.name} canceled by user.`)
        }
      })
    })
  }
  return await deployOnBlockchain(selectedContract, args, contractMetadata, compilerContracts, plugin)
}

const deployOnBlockchain = async (selectedContract: ContractData, args: string, contractMetadata: any, compilerContracts: any, plugin: Plugin) => {
  // trackMatomoEvent(plugin, { category: 'udapp', action: 'DeployContractTo', name: plugin.REACT_API.networkName, isClick: true })
  if (!contractMetadata || (contractMetadata && contractMetadata.autoDeployLib)) {
    return await plugin.call('blockchain', 'deployContractAndLibraries', selectedContract, args, contractMetadata, compilerContracts)
  }
  if (Object.keys(selectedContract.bytecodeLinkReferences).length) {
    // statusCb(`linking ${JSON.stringify(selectedContract.bytecodeLinkReferences, null, '\t')} using ${JSON.stringify(contractMetadata.linkReferences, null, '\t')}`)
  }
  return await plugin.call('blockchain', 'deployContractWithLibrary', selectedContract, args, contractMetadata, compilerContracts)
}
// const statusCb = (msg: string) => {
//   const log = logBuilder(msg)

//   return terminalLogger(plugin, log)
// }

// const finalCb = async (error, contractObject, address) => {
//   if (error) {
//     const log = logBuilder(error)
//     return terminalLogger(plugin, log)
//   }

//   addInstance(dispatch, { contractData: contractObject, address, name: contractObject.name })
//   const data = await plugin.compilersArtefacts.getCompilerAbstract(contractObject.contract.file)
//   plugin.compilersArtefacts.addResolvedContract(addressToString(address), data)

//   if (isVerifyChecked) {
//     trackMatomoEvent(plugin, { category: 'udapp', action: 'DeployAndPublish', name: plugin.REACT_API.networkName, isClick: true })

//     try {
//       const status = plugin.blockchain.getCurrentNetworkStatus()
//       if (status.error || !status.network) {
//         throw new Error(`Could not get network status: ${status.error || 'Unknown error'}`)
//       }
//       const currentChainId = parseInt(status.network.id)

//       const response = await fetch('https://chainid.network/chains.json')
//       if (!response.ok) throw new Error('Could not fetch chains list from chainid.network.')
//       const allChains = await response.json()
//       const currentChain = allChains.find(chain => chain.chainId === currentChainId)

//       if (!currentChain) {
//         const errorMsg = `Could not find chain data for Chain ID: ${currentChainId}. Verification cannot proceed.`
//         const errorLog = logBuilder(errorMsg)
//         terminalLogger(plugin, errorLog)
//         return
//       }

//       const etherscanApiKey = await plugin.call('config', 'getAppParameter', 'etherscan-access-token')

//       const verificationData = {
//         chainId: currentChainId.toString(),
//         currentChain: currentChain,
//         contractAddress: addressToString(address),
//         contractName: selectedContract.name,
//         compilationResult: await plugin.compilersArtefacts.getCompilerAbstract(selectedContract.contract.file),
//         constructorArgs: args,
//         etherscanApiKey: etherscanApiKey
//       }

//       setTimeout(async () => {
//         await plugin.call('contract-verification', 'verifyOnDeploy', verificationData)
//       }, 1500)

//     } catch (e) {
//       const errorMsg = `Verification setup failed: ${e.message}`
//       const errorLog = logBuilder(errorMsg)
//       terminalLogger(plugin, errorLog)
//     }

//   } else {
//     trackMatomoEvent(plugin, { category: 'udapp', action: 'DeployOnly', name: plugin.REACT_API.networkName, isClick: true })
//   }

//   if (isProxyDeployment) {
//     const initABI = contractObject.abi.find(abi => abi.name === 'initialize')
//     plugin.call('openzeppelin-proxy', 'executeUUPSProxy', addressToString(address), args, initABI, contractObject)
//   } else if (isContractUpgrade) {
//     plugin.call('openzeppelin-proxy', 'executeUUPSContractUpgrade', args, addressToString(address), contractObject)
//   }
// }

// const deployContract = (plugin: RunTab, selectedContract, args, contractMetadata, compilerContracts) => {
//   trackMatomoEvent(plugin, { category: 'udapp', action: 'DeployContractTo', name: plugin.REACT_API.networkName, isClick: true })

//   if (!contractMetadata || (contractMetadata && contractMetadata.autoDeployLib)) {
//     return plugin.blockchain.deployContractAndLibraries(selectedContract, args, contractMetadata, compilerContracts)
//   }
//   // if (Object.keys(selectedContract.bytecodeLinkReferences).length) statusCb(`linking ${JSON.stringify(selectedContract.bytecodeLinkReferences, null, '\t')} using ${JSON.stringify(contractMetadata.linkReferences, null, '\t')}`)
//   plugin.blockchain.deployContractWithLibrary(selectedContract, args, contractMetadata, compilerContracts)
// }