import { AIMessage, AgentMiddleware, BaseMessage, ModelRequest, WrapModelCallHandler, trimMessages } from 'langchain'

/**
 * Custom middleware for DeepAgent with beforeModel hook functionality
 */
export class RemixDeepAgentMiddleware implements AgentMiddleware {
  name = 'RemixDeepAgentMiddleware'

  /**
   * Hook called before each model invocation
   * @param request - The model request object
   * @param handler - Function to call the actual model
   * @returns The result from the model call
   */
  async wrapModelCall(request: ModelRequest, handler: WrapModelCallHandler) {
    console.log(request)
    // Before model call - log the request
    console.log('[RemixDeepAgentMiddleware] Before model call:', {
      messages: request?.messages?.length || 0,
      timestamp: new Date().toISOString()
    })
    
    removePeviousContextFromMessages(request)
    // await summarizeOldMessages(request)
    shortenToolDescription(request)    
    
    // Call the actual model
    const result = await handler(request as any)
    
    // After model call - log completion
    console.log('[RemixDeepAgentMiddleware] After model call completed')
    
    return result
  }
}

const removePeviousContextFromMessages = (request: ModelRequest) => {
  // Optimize message history by removing context from all human messages except the last one
  if (request.messages && request.messages.length > 1) {
    for (let i = 0; i < request.messages.length - 1; i++) {
      const message = request.messages[i]
      if (typeof message.content === 'string') {
        const content = message.content
        if (content.startsWith('Context:')) {
          const questionIndex = content.indexOf('Question:')
          if (questionIndex !== -1) {
            // Strip out everything between "Context:" and "Question:", including "Question:"
            const newContent = content.substring(questionIndex + 'Question:'.length).trim()
            ;(message as any).content = newContent
            console.log(`[RemixDeepAgentMiddleware] Stripped context from message ${i}`)
          }
        }
      }
    }
  }
}

const shortenToolDescription = (request: ModelRequest) => {
  request.tools.find((tool) => {
    if (tool.name === 'write_todos') {
      tool.description = shortWriteTodosDescription
    }
  })
}

function dummyTokenCounter(messages: BaseMessage[]): number {
  // treat each message like it adds 3 default tokens at the beginning
  // of the message and at the end of the message. 3 + 4 + 3 = 10 tokens
  // per message.

  const defaultContentLen = 4;
  const defaultMsgPrefixLen = 3;
  const defaultMsgSuffixLen = 3;

  let count = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      count += defaultMsgPrefixLen + defaultContentLen + defaultMsgSuffixLen;
    }
    if (Array.isArray(msg.content)) {
      count +=
        defaultMsgPrefixLen +
        msg.content.length * defaultContentLen +
        defaultMsgSuffixLen;
    }
  }
  return count;
}

const summarizeOldMessages = async (request: ModelRequest) => {
  if (!request.messages || request.messages.length <= 3) {
    return;
  }

  const messages = request.messages;
  const keptMessages: BaseMessage[] = [];
  
  // Always keep last 3 messages
  const lastThreeMessages = messages.slice(-3);
  const messagesToProcess = messages.slice(0, -3);
  
  let summaryContent = '';
  let i = 0;
  
  // Loop through messages except the last 3
  while (i < messagesToProcess.length) {
    const message = messagesToProcess[i];
    if (message.type === 'ai') {
      const aiMessage = message as AIMessage

      // check if this message contain a tool call block.
      const block = aiMessage.contentBlocks.find(block => {
        if (block.toolCallId) {
          return true;
        }
        return false;
      })
      if (!block) {
        aiMessage.contentBlocks.forEach(block => {
          if (typeof block.content === 'string') {
            summaryContent += `Assistant: ${block.content}\n`
          } else {
            summaryContent += `Assistant: [${block.type} content]\n`
          }
        })
      } else {
        // If we find a tool call block, we shouldn't summarize that message.
        // so we add any accumulated summary content as a human message before it, then add the original message with tool call as-is
        keptMessages.push({
          type: 'human',
          content: `Previous conversation summary: ${summaryContent.trim()}`
        } as BaseMessage)
        keptMessages.push(message)
        summaryContent = ''
      }      
    } else if (message.type === 'human') {
      if (typeof message.content === 'string') {
        summaryContent += `Human: ${message.content}\n`
      } else {
        summaryContent += `Human: [${JSON.stringify(message.content)}]\n`
      }
    } else if (message.type === 'tool') {
      // If we encounter a tool message, we want to keep it and all subsequent messages until the last 3, without summarizing
      if (summaryContent.trim()) {
        keptMessages.push({
          type: 'human',
          content: `Previous conversation summary: ${summaryContent.trim()}`
        } as BaseMessage)
      }
      keptMessages.push(message)
      summaryContent = ''
    } else if (message.type === 'system') {
      // For any other message types, we can also choose to ignore or handle them as needed. Here we choose to ignore them.
    } else {
      // For any other message types, we can also choose to ignore or handle them as needed. Here we choose to ignore them.
    }
    i++;
  }  
  // If we reached the end and have summary content, add it
  if (summaryContent.trim()) {
    keptMessages.push({
      type: 'human',
      content: `Previous conversation summary: ${summaryContent.trim()}`
    } as BaseMessage);
  }  
  // Always add the last 3 messages
  keptMessages.push(...lastThreeMessages);
  
  request.messages = keptMessages;
}

const shortWriteTodosDescription = 'Create and manage a structured task list for the current work session to track progress on complex, multi-step work. Use when: a task has 3+ distinct steps, requires planning across multiple operations, the user provides multiple tasks, or the user explicitly requests a todo list. Skip for trivial, single-step, or purely conversational requests where tracking adds no value. Mark tasks as in_progress before starting and completed immediately after finishing — never mark complete if blocked, partial, or errored. Always keep at least one task in_progress until all are done, and update the list in real time as scope changes.'