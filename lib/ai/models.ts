import { openai, createOpenAI } from '@ai-sdk/openai';
// import { fireworks } from '@ai-sdk/fireworks';
import { createDeepSeek } from "@ai-sdk/deepseek";
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

export const DEFAULT_CHAT_MODEL: string = 'chat-model-small';

export const myProvider = customProvider({
  languageModels: {
    'chat-model-small': customOpenAI('gpt-4o-mini'),
    'chat-model-large': customOpenAI('gpt-4o'),
    "chat-model-reasoning": customDeepSeek("deepseek-r1"),
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
];
