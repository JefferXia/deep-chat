import { openai, createOpenAI } from '@ai-sdk/openai';
// import { fireworks } from '@ai-sdk/fireworks';
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createAnthropic } from '@ai-sdk/anthropic';
import {
  customProvider,
  // extractReasoningMiddleware,
  // wrapLanguageModel,
} from 'ai';

export const customOpenAI = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_API_BASE,
});

export const customDeepSeek = createDeepSeek({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  headers: {
    Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
  },
});

const customAnthropicFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  console.log(`url: ${input}`)
  console.log(`init: ${JSON.stringify(init)}`)
  let newInit = { ...init }

  if (init?.body && typeof init.body === 'string') {
    try {
      // Parse the JSON body string
      const bodyObj = JSON.parse(init.body)

      // Add the thinking parameter to the parsed object
      const newBodyObj = {
        ...bodyObj,
        thinking: { type: 'enabled', budget_tokens: 1024 },
      }

      // Update newInit with the modified and re-stringified body
      newInit.body = JSON.stringify(newBodyObj)
    } catch (error) {
      console.error('Error parsing request body:', error)
    }
  }

  console.log(`newInit: ${JSON.stringify(newInit)}`)

  return fetch(input, newInit)
}

export const customAnthropic = createAnthropic({
  baseURL: process.env.ANTHROPIC_API_BASE,
  apiKey: process.env.ANTHROPIC_API_KEY,
  fetch: customAnthropicFetch,
  headers: {
    Authorization: `Bearer ${process.env.ANTHROPIC_API_KEY}`,
  },
})


export const DEFAULT_CHAT_MODEL: string = 'chat-model-small';

export const myProvider = customProvider({
  languageModels: {
    'chat-model-small': customOpenAI('gpt-4o-mini'),
    'chat-model-large': customOpenAI('gpt-4o'),
    "chat-model-reasoning": customDeepSeek("deepseek-r1"),
    'chat-model-claude': customAnthropic('claude-3-7-sonnet-20250219') as any,
    // 'chat-model-reasoning': wrapLanguageModel({
    //   model: fireworks('accounts/fireworks/models/deepseek-r1'),
    //   middleware: extractReasoningMiddleware({ tagName: 'think' }),
    // }),
    'title-model': customOpenAI('gpt-4-turbo'),
    'artifact-model': customOpenAI('gpt-4o-mini'),
  },
  imageModels: {
    'small-model': customOpenAI.image('dall-e-2'),
    'large-model': customOpenAI.image('dall-e-3'),
  },
});

interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'chat-model-small',
    name: 'gpt-4o-mini',
    description: 'Small model for fast, lightweight tasks',
  },
  {
    id: 'chat-model-large',
    name: 'gpt-4o',
    description: 'Large model for complex, multi-step tasks',
  },
  {
    id: 'chat-model-reasoning',
    name: 'deepseek-r1满血版',
    description: 'Uses advanced reasoning',
  },
  {
    id: 'chat-model-claude',
    name: 'claude',
    description: 'Uses claude reasoning',
  },
];
