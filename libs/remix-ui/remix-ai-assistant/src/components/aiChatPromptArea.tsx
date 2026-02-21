import React from 'react'
import GroupListMenu from './contextOptMenu'
import { PromptArea } from './prompt'

interface AiChatPromptAreaProps {
  themeTracker: any
    showHistorySidebar: boolean
    isMaximized: boolean
    showAssistantOptions: boolean
    modelOpt: { top: number, left: number }
    menuRef: React.RefObject<HTMLDivElement>
    setShowAssistantOptions: React.Dispatch<React.SetStateAction<boolean>>
    assistantChoice: any
    setAssistantChoice: React.Dispatch<React.SetStateAction<any>>
    aiAssistantGroupList: any[]
    mcpEnabled: boolean
    mcpEnhanced: boolean
    setMcpEnhanced: React.Dispatch<React.SetStateAction<boolean>>
    availableModels: string[]
    selectedModel: any
    handleModelSelection: (modelName: string) => void
    input: string
    setInput: React.Dispatch<React.SetStateAction<string>>
    isStreaming: boolean
    handleSend: () => void
    stopRequest: () => void
    showModelOptions: boolean
    setShowModelOptions: React.Dispatch<React.SetStateAction<boolean>>
    handleSetAssistant: () => void
    handleSetModel: () => void
    handleGenerateWorkspace: () => void
    handleRecord: () => void
    isRecording: boolean
    dispatchActivity: (type: string, payload?: any) => void
    modelBtnRef: React.RefObject<HTMLButtonElement>
    modelSelectorBtnRef: React.RefObject<HTMLButtonElement>
    textareaRef?: React.RefObject<HTMLTextAreaElement>
    maximizePanel: () => Promise<void>
    showContextOptions: boolean
    setShowContextOptions: React.Dispatch<React.SetStateAction<boolean>>
    contextChoice: any
    setContextChoice: React.Dispatch<React.SetStateAction<any>>
    ollamaModels: string[]
    selectedOllamaModel: string
    handleOllamaModelSelection: (modelName: string) => void
    showOllamaModelSelector: boolean
    setShowOllamaModelSelector: React.Dispatch<React.SetStateAction<boolean>>
    contextFiles: any[]
    clearContext: () => void
    aiContextGroupList: any[]
    aiMode: string
    setAiMode: React.Dispatch<React.SetStateAction<string>>
    modelAccess: any
    setIsMaximized: React.Dispatch<React.SetStateAction<boolean>>
    showModelSelector: boolean
    setShowModelSelector: React.Dispatch<React.SetStateAction<boolean>>
    contextBtnRef: React.RefObject<any>
    handleAddContext: () => void
}

export default function AiChatPromptArea(props: AiChatPromptAreaProps) {

  {/* Prompt area - fixed at bottom */}
  return (
    <section
      id="remix-ai-prompt-area"
      className="ai-assistant-prompt-bg"
      style={{ flexShrink: 0, minHeight: '140px', backgroundColor: props.showHistorySidebar && props.isMaximized === false ? (props.themeTracker?.name.toLowerCase() === 'dark' ? 'var(--bs-dark)' : 'var(--bs-light)') : 'transparent' }}
      data-theme={props.themeTracker && props.themeTracker?.name.toLowerCase()}
    >
      {props.showAssistantOptions && (
        <div
          className="pt-2 mb-2 z-3 bg-light border border-text position-fixed"
          style={{ borderRadius: '8px', top: props.modelOpt.top, left: props.modelOpt.left, zIndex: 1000, minWidth: '300px', maxWidth: '400px' }}
          ref={props.menuRef}
        >
          <div className="text-uppercase ms-2 mb-2 small">AI Assistant Provider</div>
          <GroupListMenu
            setChoice={props.setAssistantChoice}
            setShowOptions={props.setShowAssistantOptions}
            choice={props.assistantChoice}
            groupList={props.aiAssistantGroupList}
          />
          {props.mcpEnabled && (
            <div className="border-top mt-2 pt-2">
              <div className="text-uppercase ms-2 mb-2 small">MCP Enhancement</div>
              <div className="form-check ms-2 mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="mcpEnhancementToggle"
                  checked={props.mcpEnhanced}
                  onChange={(e) => props.setMcpEnhanced(e.target.checked)}
                />
                <label className="form-check-label small" htmlFor="mcpEnhancementToggle">
                        Enable MCP context enhancement
                </label>
              </div>
              <div className="small text-muted ms-2">
                      Adds relevant context from configured MCP servers to AI requests
              </div>
            </div>
          )}
        </div>
      )}
      {props.showModelOptions && props.assistantChoice === 'ollama' && (
        <div
          className="pt-2 mb-2 z-3 bg-light border border-text w-75 position-absolute"
          style={{ borderRadius: '8px' }}
        >
          <div className="text-uppercase ml-2 mb-2 small">Ollama Model</div>
          <GroupListMenu
            setChoice={props.handleModelSelection}
            setShowOptions={props.setShowModelOptions}
            choice={props.selectedModel}
            groupList={props.availableModels.map(model => ({
              label: model,
              bodyText: `Use ${model} model`,
              icon: 'fa-solid fa-check',
              stateValue: model,
              dataId: `ollama-model-${model.replace(/[^a-zA-Z0-9]/g, '-')}`
            }))}
          />
        </div>
      )}
      <PromptArea
        input={props.input}
        maximizePanel={props.maximizePanel}
        setInput={props.setInput}
        isStreaming={props.isStreaming}
        handleSend={props.handleSend}
        handleStop={props.stopRequest}
        showContextOptions={props.showContextOptions}
        setShowContextOptions={props.setShowContextOptions}
        showModelSelector={props.showModelSelector}
        setShowModelSelector={props.setShowModelSelector}
        showOllamaModelSelector={props.showOllamaModelSelector}
        setShowOllamaModelSelector={props.setShowOllamaModelSelector}
        contextChoice={props.contextChoice}
        setContextChoice={props.setContextChoice}
        selectedModel={props.selectedModel}
        ollamaModels={props.ollamaModels}
        selectedOllamaModel={props.selectedOllamaModel}
        contextFiles={props.contextFiles}
        clearContext={props.clearContext}
        handleAddContext={props.handleAddContext}
        handleSetModel={props.handleSetModel}
        handleModelSelection={props.handleModelSelection}
        handleOllamaModelSelection={props.handleOllamaModelSelection}
        handleGenerateWorkspace={props.handleGenerateWorkspace}
        handleRecord={props.handleRecord}
        isRecording={props.isRecording}
        dispatchActivity={props.dispatchActivity}
        // contextBtnRef={props.contextBtnRef}
        modelBtnRef={props.modelBtnRef}
        modelSelectorBtnRef={props.modelSelectorBtnRef}
        aiContextGroupList={props.aiContextGroupList}
        textareaRef={props.textareaRef}
        // aiMode={props.aiMode}
        // setAiMode={props.setAiMode}
        isMaximized={props.isMaximized}
        setIsMaximized={props.setIsMaximized}
        modelAccess={props.modelAccess}
        showAssistantOptions={false}
        setShowAssistantOptions={props.setShowAssistantOptions}
        showModelOptions={props.showModelOptions}
        setShowModelOptions={props.setShowModelOptions}
        assistantChoice={props.assistantChoice}
        setAssistantChoice={props.setAssistantChoice}
        availableModels={props.availableModels}
        handleSetAssistant={props.handleSetAssistant}
        themeTracker={props.themeTracker}
      />
    </section>
  )
}
