export class AbortError extends Error {
  constructor(message: string = 'Request aborted') {
    super(message)
    this.name = 'AbortError'
  }
}
export type SessionContext = {
  request: any
  dataStream: any
}

export const modelClient = {

  processClaudeStream: async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    sessionContext: SessionContext
  ): Promise<{
    thinking: string
    content: string
  }> => {
    try {
      sessionContext.request.signal.addEventListener('abort', () => {
        console.log('Request aborted during Claude stream processing')
        reader.cancel()
        throw new AbortError()
      })


      const decoder = new TextDecoder()
      let thinking = ''
      let content = ''
      let buffer = ''
      let xmlBuffer = '' // Buffer to accumulate XML content
      let isCollectingXml = false // Flag to track if we're currently collecting XML
      let xmlProcessingComplete = false // Flag to track if XML processing is done


      // Helper function to escape quotes for the output format
      function encodeContent(str: string) {
        return str
          .replace(/\\/g, '\\\\') // Escape backslashes first
          .replace(/"/g, '\\"') // Escape double quotes
          .replace(/\n/g, '\\n') // Encode newlines
          .replace(/\r/g, '\\r') // Encode carriage returns
          .replace(/\t/g, '\\t') // Encode tabs
      }


      while (true) {
        const { done, value } = await reader.read()
        if (done) break


        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk


        // Extract complete data entries from the buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep the last potentially incomplete line in the buffer


        for (const line of lines) {
          if (line.trim() === '') continue


          // Handle data lines
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') {
              continue
            }


            try {
              console.log(`Claude stream data: ${data}`)
              const parsed = JSON.parse(data)


              // Handle thinking - look for content_block_delta with thinking_delta
              if (
                parsed.type === 'content_block_delta' &&
                parsed.delta &&
                parsed.delta.type === 'thinking_delta' &&
                parsed.delta.thinking
              ) {
                const thinkingContent = parsed.delta.thinking
                thinking += thinkingContent
                sessionContext.dataStream.write(
                  `g:"${encodeContent(thinkingContent)}"\n`
                )
              }


              // Handle content - look for content_block_delta with text_delta
              else if (
                parsed.type === 'content_block_delta' &&
                parsed.delta &&
                parsed.delta.type === 'text_delta' &&
                parsed.delta.text
              ) {
                const textContent = parsed.delta.text


                // If XML processing is complete, skip writing any further content
                if (xmlProcessingComplete) {
                  console.log(
                    `warning, remaining content after xml: ${textContent}`
                  )
                  continue
                }


                // Check if we're starting XML content
                if (!isCollectingXml && textContent.includes('<')) {
                  const xmlStartIndex = textContent.indexOf('<')
                  // Write any content before the XML start
                  if (xmlStartIndex > 0) {
                    const preXmlContent = textContent.substring(
                      0,
                      xmlStartIndex
                    )
                    content += preXmlContent
                    sessionContext.dataStream.write(
                      `0:"${encodeContent(preXmlContent)}"\n`
                    )
                  }
                  isCollectingXml = true
                  xmlBuffer = textContent.substring(xmlStartIndex)
                }
                // If we're collecting XML, add to buffer
                else if (isCollectingXml) {
                  xmlBuffer += textContent
                  // Check if XML block is complete
                  if (xmlBuffer.includes('</recommendations>')) {
                    isCollectingXml = false
                    xmlProcessingComplete = true // Set flag to prevent further content writing
                    // Extract the complete XML block
                    const xmlEndIndex =
                      xmlBuffer.indexOf('</recommendations>') +
                      '</recommendations>'.length
                    const completeXml = xmlBuffer.substring(0, xmlEndIndex)
                    // Write the complete XML block
                    sessionContext.dataStream.writeMessageAnnotation(
                      `${encodeContent(completeXml)}\n`
                    )
                    // Clear XML buffer and ignore any remaining content
                    xmlBuffer = ''
                  }
                }
                // If not collecting XML and XML processing not complete, write content normally
                else if (!xmlProcessingComplete) {
                  content += textContent
                  sessionContext.dataStream.write(
                    `0:"${encodeContent(textContent)}"\n`
                  )
                }
              }


              // Handle message completion - message_delta with stop_reason
              else if (
                parsed.type === 'message_delta' &&
                parsed.delta &&
                parsed.delta.stop_reason
              ) {
                // sessionContext.dataStream.write(
                //   `e:${JSON.stringify({
                //     finishReason: 'stop',
                //     usage: {
                //       promptTokens: null,
                //       completionTokens: parsed.usage?.output_tokens || null,
                //     },
                //     isContinued: false,
                //   })}\n`
                // )
                continue
              } else if (parsed.type === 'message_stop') {
                continue
              }
            } catch (e) {
              console.error('Failed to parse Claude stream chunk:', e)
            }
          }
        }
      }


      return {
        thinking,
        content,
      }
    } catch (e) {
      throw e
    }
  },

  getClaudeContentWithThinking: async (
    messages: any[],
    systemPrompt: string,
    sessionContext: SessionContext
  ): Promise<{
    thinking: string
    content: string
  }> => {
    // dataStream.write('g:"\\n"')
    // Get API key from environment variable
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set')
    }


    // Format messages to Claude's expected format
    const formattedMessages = messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    }))


    console.log(
      `getClaudeContentWithThinking formattedMessages: ${JSON.stringify(
        formattedMessages
      )}`
    )


    try {
      // Call Claude API
      const response = await fetch(
        `${process.env.ANTHROPIC_API_BASE}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-3-7-sonnet-20250219',
            system: systemPrompt,
            messages: formattedMessages,
            stream: true,
            thinking: {
              type: 'enabled',
              budget_tokens: 1024,
            },
            max_tokens: 4096,
          }),
        }
      )


      if (!response.ok || !response.body) {
        console.error(
          `Claude API error: ${response.status} ${response.statusText}`
        )
        throw new Error(`HTTP error! status: ${response.status}`)
      }


      const reader = response.body.getReader()
      const { thinking, content } = await modelClient.processClaudeStream(
        reader,
        sessionContext
      )
      return {
        thinking,
        content,
      }
    } catch (error) {
      if (!(error instanceof AbortError)) {
        console.error('Error in Claude API call:', error)
      }
      throw error
    }
  },


  getClaudeContentWithoutThinking: async (
    messages: any[],
    systemPrompt: string,
    sessionContext: SessionContext
  ): Promise<string> => {
    console.log(
      `getClaudeContentWithoutThinking messages: ${JSON.stringify(messages)}`
    )
    // Get API key from environment variable
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set')
    }


    // Format messages to Claude's expected format
    const formattedMessages = messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    }))


    try {
      // Call Claude API
      const response = await fetch(
        `${process.env.ANTHROPIC_API_BASE}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-3-7-sonnet-20250219',
            system: systemPrompt,
            messages: formattedMessages,
            stream: true,
            max_tokens: 4096,
          }),
        }
      )


      if (!response.ok || !response.body) {
        console.error(
          `Claude API error: ${response.status} ${response.statusText}`
        )
        throw new Error(`HTTP error! status: ${response.status}`)
      }


      const reader = response.body.getReader()
      const { content } = await modelClient.processClaudeStream(
        reader,
        sessionContext
      )
      return content
    } catch (error) {
      if (!(error instanceof AbortError)) {
        console.error('Error in Claude API call:', error)
      }
      throw error
    }
  },
}
