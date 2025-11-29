import { Actions, CompilationRawResult, VisitedContract } from "../types"
import { Plugin } from "@remixproject/engine"
import { trackMatomoEvent } from "@remix-api"
import { CompilerAbstract } from "@remix-project/remix-solidity"
import type { ContractData } from "@remix-project/core-plugin"
import { execution } from '@remix-project/remix-lib'

export async function broadcastCompilationResult (compilerName: string, compileRawResult: CompilationRawResult, plugin: Plugin, dispatch: React.Dispatch<Actions>) {
  const { file, source, languageVersion, data, input } = compileRawResult
  await trackMatomoEvent(plugin, { category: 'udapp', action: 'broadcastCompilationResult', name: compilerName, isClick: false })
  // TODO check whether the tab is configured
  const compiler = new CompilerAbstract(languageVersion, data, source, input)
  await plugin.call('compilerArtefacts', 'saveCompilerAbstract', file, compiler)
  // plugin.compilersArtefacts[languageVersion] = compiler
  // plugin.compilersArtefacts.__last = compiler

  const contracts = getCompiledContracts(compiler).map((contract) => {
    // return { name: languageVersion, alias: contract.name, file: contract.file, compiler, compilerName }
  })
  // if ((contracts.length > 0)) {
  //   const contractsInCompiledFile = contracts.filter(obj => obj.file === file)
  //   let currentContract
  //   if (contractsInCompiledFile.length) currentContract = contractsInCompiledFile[0].alias
  //   else currentContract = contracts[0].alias
  //   dispatch(setCurrentContract(currentContract))
  // }
  // const isUpgradeable = await plugin.call('openzeppelin-proxy', 'isConcerned', data.sources && data.sources[file] ? data.sources[file].ast : {})

  // if (isUpgradeable) {
  //   const options = await plugin.call('openzeppelin-proxy', 'getProxyOptions', data, file)

  //   dispatch(addDeployOption({ [file]: options }))
  // } else {
  //   dispatch(addDeployOption({ [file]: {} }))
  // }
  // dispatch(fetchContractListSuccess({ [file]: contracts }))
  // dispatch(setCurrentFile(file))
  // // TODO: set current contract
}

function getCompiledContracts (compiler: CompilerAbstract) {
  const contracts: ContractData[] = []

  compiler.visitContracts((contract: VisitedContract) => {
    const contractData = getContractData(contract.name, compiler)

    if (contractData && contractData.bytecodeObject.length === 0) {
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