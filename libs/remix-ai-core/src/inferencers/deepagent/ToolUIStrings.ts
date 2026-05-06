function getFileName(path: string): string {
  return path.split('/').pop() || path
}

function truncateAddress(address: string): string {
  if (address.length <= 13) return address
  return `${address.substring(0, 10)}...`
}

export function resolveToolUIString(toolName: string, toolInput?: Record<string, any>): string {
  const args = toolInput || {}

  switch (toolName) {
  case 'file_read':
    return args.path ? `Reading file ${getFileName(args.path)}` : 'Reading file...'
  case 'read_file':
    return args.path ? `Reading file ${getFileName(args.path)}` : 'Reading file...'

  case 'file_write':
  case 'write_file':
    return args.path ? `Writing file ${getFileName(args.path)}` : 'Writing file...'

  case 'file_create':
    return args.path ? `Creating ${args.type || 'file'} ${getFileName(args.path)}` : 'Creating file...'

  case 'file_delete':
    return args.path ? `Deleting file ${getFileName(args.path)}` : 'Deleting file...'

  case 'file_move':
    return args.sourcePath ? `Moving file ${getFileName(args.sourcePath)}` : 'Moving file...'

  case 'file_copy':
    return args.sourcePath ? `Copying file ${getFileName(args.sourcePath)}` : 'Copying file...'

  case 'file_replace':
    return args.path ? `Replacing content in ${getFileName(args.path)}` : 'Replacing content in file...'

  case 'edit_file':
    return args.path ? `Editing file ${getFileName(args.path)}` : 'Editing file...'

  case 'file_exists':
    return args.path ? `Checking if ${getFileName(args.path)} exists` : 'Checking if file exists...'

  case 'read_file_chunk':
    return args.path ? `Reading chunk from ${getFileName(args.path)}` : 'Reading file chunk...'

  case 'grep_file':
    return args.pattern ? `Searching for "${args.pattern}"` : 'Searching in files...'

  case 'directory_list':
  case 'list_directory':
    return args.path ? `Listing directory ${getFileName(args.path)}` : 'Listing directory contents...'

  case 'ls':
    return args.path ? `Listing ${getFileName(args.path)}` : 'Listing files...'

  case 'get_current_file':
    return 'Getting current file...'

  case 'get_opened_files':
    return 'Getting opened files...'

  case 'open_file':
    return args.path ? `Opening file ${getFileName(args.path)}` : 'Opening file...'

  // Compilation
  case 'solidity_compile': {
    const file = args.path || args.filePath || args.fileName
    return file ? `Compiling ${getFileName(file)}` : 'Compiling Solidity contract...'
  }
  case 'compile_solidity': {
    const file = args.path || args.filePath || args.fileName
    return file ? `Compiling ${getFileName(file)}` : 'Compiling Solidity contract...'
  }

  case 'get_compilation_result':
    return 'Getting compilation results...'

  case 'get_compilation_result_sources_by_file_path':
    return 'Getting compilation sources...'

  case 'get_compiler_config':
    return 'Getting compiler configuration...'

  case 'set_compiler_config':
    return args.version ? `Setting compiler config (v${args.version})` : 'Setting compiler config...'

  case 'get_compiler_versions':
    return 'Getting available compiler versions...'

  case 'get_contract_abi':
    return args.contractName ? `Getting ABI for ${args.contractName}` : 'Getting contract ABI...'

  case 'get_verified_contract_from_etherscan':
    return args.address ? `Fetching verified contract ${truncateAddress(args.address)}` : 'Fetching verified contract from Etherscan...'

  case 'compile_with_hardhat':
  case 'hardhat_compile':
    return 'Compiling with Hardhat...'

  case 'compile_with_foundry':
  case 'foundry_compile':
    return 'Compiling with Foundry...'

  case 'compile_with_truffle':
    return 'Compiling with Truffle...'

  case 'hardhat_sync':
    return 'Syncing Hardhat artifacts...'

  case 'foundry_sync':
    return 'Syncing Foundry artifacts...'

  case 'analyze_contract':
    return args.contractName ? `Analyzing contract ${args.contractName}` : 'Analyzing contract...'

  case 'slither_scan':
    return args.path ? `Running Slither scan on ${getFileName(args.path)}` : 'Running Slither security scan...'

  case 'solidity_scan':
    return args.filePath ? `Scanning contract ${getFileName(args.filePath)}` : 'Scanning contract...'

  case 'solidity_answer':
    return 'Analyzing Solidity code...'

  case 'deploy_contract':
    return args.contractName ? `Deploying contract ${args.contractName}` : 'Deploying contract...'

  case 'call_contract':
    return args.functionName ? `Calling ${args.functionName}` : 'Calling contract...'

  case 'send_transaction':
    return 'Sending transaction...'

  case 'simulate_transaction':
    return 'Simulating transaction...'

  case 'get_deployed_contracts':
    return 'Getting deployed contracts...'

  case 'set_execution_environment':
    return args.environment ? `Setting environment to ${args.environment}` : 'Setting execution environment...'

  case 'get_current_environment':
    return 'Getting current environment...'

  case 'get_account_balance':
  case 'get_balance':
    return args.address ? `Getting balance for ${truncateAddress(args.address)}` : 'Getting account balance...'

  case 'get_user_accounts':
    return 'Getting user accounts...'

  case 'set_selected_account':
    return args.address ? `Setting account to ${truncateAddress(args.address)}` : 'Setting selected account...'

  case 'run_script':
    return args.scriptPath ? `Running script ${getFileName(args.scriptPath)}` : 'Running script...'

  case 'execute_script':
    return args.path ? `Executing script ${getFileName(args.path)}` : 'Executing script...'

  case 'get_transaction':
    return args.hash ? `Retrieving transaction ${truncateAddress(args.hash)}` : 'Retrieving transaction...'

  case 'get_contract_code':
    return args.address ? `Getting contract code at ${truncateAddress(args.address)}` : 'Getting contract code...'

  case 'estimate_gas':
    return 'Estimating gas...'

  case 'debug_transaction':
    return args.txHash ? `Debugging transaction ${truncateAddress(args.txHash)}` : 'Debugging transaction...'

  case 'start_debug_session':
    return 'Starting debug session...'

  case 'decode_local_variable':
    return args.name ? `Decoding local variable ${args.name}` : 'Decoding local variable...'

  case 'decode_state_variable':
    return args.name ? `Decoding state variable ${args.name}` : 'Decoding state variable...'

  case 'get_valid_source_location_from_vm_trace_index':
    return 'Getting source location...'

  case 'extract_locals_at':
    return 'Extracting local variables...'

  case 'decode_locals_at':
    return 'Decoding local variables...'

  case 'extract_state_at':
    return 'Extracting state...'

  case 'decode_state_at':
    return 'Decoding state...'

  case 'storage_view_at':
    return 'Viewing storage...'

  case 'jump_to':
    return args.step ? `Jumping to step ${args.step}` : 'Jumping to location...'

  case 'get_stack_at':
    return 'Getting stack...'

  case 'get_scopes_with_root':
    return 'Getting scopes...'

  case 'set_breakpoint':
    return args.line ? `Setting breakpoint at line ${args.line}` : 'Setting breakpoint...'

  case 'dapp_create':
    return args.name ? `Creating DApp ${args.name}` : 'Creating DApp...'

  case 'dapp_update':
    return args.name ? `Updating DApp ${args.name}` : 'Updating DApp...'

  case 'dapp_list':
    return 'Listing DApps...'

  case 'dapp_get_status':
    return 'Getting DApp status...'

  case 'dapp_open':
    return args.name ? `Opening DApp ${args.name}` : 'Opening DApp...'

  case 'dapp_navigate':
    return 'Navigating in DApp...'

  case 'get_skill':
    return args.name ? `Getting skill ${args.name}` : 'Getting skill...'

  case 'list_skills':
    return 'Listing available skills...'

  case 'wei_to_ether':
    return args.wei ? `Converting ${args.wei} wei to ether` : 'Converting Wei to Ether...'

  case 'ether_to_wei':
    return args.ether ? `Converting ${args.ether} ether to wei` : 'Converting Ether to Wei...'

  case 'decimal_to_hex':
    return args.decimal ? `Converting ${args.decimal} to hex` : 'Converting decimal to hex...'

  case 'hex_to_decimal':
    return args.hex ? `Converting ${args.hex} to decimal` : 'Converting hex to decimal...'

  case 'timestamp_to_date':
    return 'Converting timestamp to date...'

  case 'chartjs_generate':
    return args.chartType ? `Generating ${args.chartType}` : 'Generating chart...'

  case 'tutorials_list':
    return 'Listing tutorials...'

  case 'tutorials':
  case 'start_tutorial':
    return args.tutorial ? `Starting tutorial ${args.tutorial}` : 'Starting tutorial...'

  case 'get_foundry_hardhat_info':
    return 'Getting Foundry/Hardhat info...'

  case 'amp_dataset_manifest':
    return 'Getting AMP dataset manifest...'

  case 'get_tool_schema':
    return args.toolName ? `Getting schema for ${args.toolName}` : 'Getting tool schema...'

  case 'call_tool':
    if (args.toolName) {
      return resolveToolUIString(args.toolName, args.arguments)
    }
    return 'Calling tool...'

  case 'write_todos':
    return 'Updating task list...'

  case 'web_search':
    return args.query ? `Searching web: ${args.query}` : 'Searching web...'

  case 'file_search':
    return args.query ? `Searching files: ${args.query}` : 'Searching files...'

  default: {
    const formattedName = toolName
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim()

    return `${formattedName.charAt(0).toUpperCase() + formattedName.slice(1)}...`
  }
  }
}
