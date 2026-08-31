/**
 * @sentinel/llm — Available Models Catalog
 *
 * Provides a structured list of supported models for each provider,
 * along with display metadata, context limits, and default selections.
 */

export interface ModelInfo {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly contextWindow: number;
  readonly description: string;
  readonly isDefault?: boolean;
}

export interface ProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly requiresBaseUrl?: boolean;
  readonly defaultBaseUrl?: string;
  readonly keyHelpUrl: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'google',
    name: 'Google AI Studio (Gemini)',
    description: 'Gemini 2.5 Flash, 2.5 Pro, 2.0 Flash — Fast & powerful with large context',
    keyHelpUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4o-mini, o1, o3-mini — Industry standard reasoning models',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    description: 'Claude 3.7 Sonnet, Claude 3.5 Sonnet, Claude 3.5 Haiku — Excellent coding & reasoning',
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible / OpenRouter / Ollama , etc)',
    description: 'Connect any OpenAI-compatible API endpoint (OpenRouter, DeepSeek, Local LLMs, vLLM)',
    requiresBaseUrl: true,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    keyHelpUrl: 'https://openrouter.ai/keys',
  },
];

export const MODELS: Record<string, ModelInfo[]> = {
  google: [
    {
      id: 'gemini-3.1-pro',
      name: 'Gemini 3.1 Pro (Recommended)',
      provider: 'google',
      contextWindow: 2_000_000,
      description: 'Google’s current flagship model for complex reasoning and advanced coding',
      isDefault: true,
    },
    {
      id: 'gemini-3.7-flash',
      name: 'Gemini 3.7 Flash',
      provider: 'google',
      contextWindow: 1_000_000,
      description: 'Newest, fastest Gemini 3 flash model with improved coding and multimodal performance',
    },
    {
      id: 'gemini-3.6-flash',
      name: 'Gemini 3.6 Flash',
      provider: 'google',
      contextWindow: 1_000_000,
      description: 'Next-gen balance of speed, intelligence, and large context, using fewer output tokens',
    },
    {
      id: 'gemini-3.5-flash-lite',
      name: 'Gemini 3.5 Flash-Lite',
      provider: 'google',
      contextWindow: 1_000_000,
      description: 'Low-cost model designed for high-volume, latency-sensitive workloads',
    },
    {
      id: 'gemini-3.1-flash-lite',
      name: 'Gemini 3.1 Flash-Lite',
      provider: 'google',
      contextWindow: 1_000_000,
      description: 'Cost-efficient and fast lightweight model for rapid iterations',
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      provider: 'google',
      contextWindow: 2_000_000,
      description: 'Proven previous-generation model for code review, technical documents, and large datasets',
    },
  ],

  openai: [
    {
      id: 'gpt-5.6-sol',
      name: 'GPT-5.6 Sol (Recommended)',
      provider: 'openai',
      contextWindow: 1_050_000,
      description: 'Flagship GPT-5.6 model with frontier reasoning, coding, and agentic capabilities',
      isDefault: true,
    },
    {
      id: 'gpt-5.6-terra',
      name: 'GPT-5.6 Terra',
      provider: 'openai',
      contextWindow: 1_050_000,
      description: 'Balanced GPT-5.6 tier with performance competitive with GPT-5.5 at lower cost',
    },
    {
      id: 'gpt-5.6-luna',
      name: 'GPT-5.6 Luna',
      provider: 'openai',
      contextWindow: 1_050_000,
      description: 'Fastest, most affordable GPT-5.6 model for high-volume everyday tasks',
    },
    {
      id: 'gpt-5.6-cyber',
      name: 'GPT-5.6 Cyber',
      provider: 'openai',
      contextWindow: 1_050_000,
      description: 'Cybersecurity-specialized model built on Sol for vulnerability research and exploit validation',
    },
    {
      id: 'gpt-5.3-codex',
      name: 'GPT-5.3 Codex',
      provider: 'openai',
      contextWindow: 1_050_000,
      description: 'Specialized model optimized for agentic coding, refactoring, and terminal workflows',
    },
  ],

  anthropic: [
    {
      id: 'claude-opus-4-8',
      name: 'Claude Opus 4.8 (Recommended)',
      provider: 'anthropic',
      contextWindow: 200_000,
      description: 'Anthropic’s most capable model for deep reasoning and architectural synthesis',
      isDefault: true,
    },
    {
      id: 'claude-sonnet-5',
      name: 'Claude Sonnet 5',
      provider: 'anthropic',
      contextWindow: 200_000,
      description: 'Industry-standard model for software engineering, tool use, and everyday agentic tasks',
    },
    {
      id: 'claude-haiku-4-5-20251001',
      name: 'Claude Haiku 4.5',
      provider: 'anthropic',
      contextWindow: 200_000,
      description: 'Lightning-fast, highly capable model for rapid agent execution',
    },
    {
      id: 'claude-fable-5',
      name: 'Claude Fable 5',
      provider: 'anthropic',
      contextWindow: 200_000,
      description: 'Mythos-tier model above Opus, with added safety measures for biology, cyber, and LLM R&D',
    },
  ],

  custom: [
    {
      id: 'deepseek/deepseek-v4-pro',
      name: 'DeepSeek V4 Pro (OpenRouter / Custom)',
      provider: 'custom',
      contextWindow: 1_000_000,
      description: 'Open-weights cost-performance and coding leader with strong reasoning at scale',
      isDefault: true,
    },
    {
      id: 'deepseek/deepseek-v4-flash',
      name: 'DeepSeek V4 Flash (OpenRouter / Custom)',
      provider: 'custom',
      contextWindow: 1_000_000,
      description: 'Lighter DeepSeek V4 sibling retrained for coding, agents, and tool use',
    },
    {
      id: 'meta-llama/llama-4-maverick',
      name: 'Llama 4 Maverick (OpenRouter / Custom)',
      provider: 'custom',
      contextWindow: 1_000_000,
      description: 'Open flagship MoE model from Meta with strong 128-language generation',
    },
    {
      id: 'mistralai/mistral-large-3',
      name: 'Mistral Large 3 (OpenRouter / Custom)',
      provider: 'custom',
      contextWindow: 128_000,
      description: 'Strongest non-Chinese open-weight model for agentic systems, with native function calling',
    },
    {
      id: 'qwen/qwen3-coder',
      name: 'Qwen3 Coder (OpenRouter / Custom)',
      provider: 'custom',
      contextWindow: 128_000,
      description: 'Specialized code generation and editing model competitive with frontier coding assistants',
    },
  ],
};

/**
 * Get available models for a given provider name.
 */
export function getAvailableModels(provider: string): ModelInfo[] {
  const norm = provider.toLowerCase();
  if (norm.includes('google') || norm.includes('gemini')) {
    return MODELS['google'] ?? [];
  }
  if (norm.includes('anthropic') || norm.includes('claude')) {
    return MODELS['anthropic'] ?? [];
  }
  if (norm.includes('openai')) {
    return MODELS['openai'] ?? [];
  }
  return MODELS[norm] ?? MODELS['custom'] ?? [];
}

/**
 * Get the default model ID for a provider.
 */
export function getDefaultModelForProvider(provider: string): string {
  const models = getAvailableModels(provider);
  const def = models.find((m) => m.isDefault);
  return def ? def.id : models[0]?.id ?? 'gemini-2.5-flash';
}
