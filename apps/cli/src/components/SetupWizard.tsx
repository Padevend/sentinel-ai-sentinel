/**
 * @sentinel/cli — First Launch Setup Wizard
 *
 * Guides the user through provider selection, API key configuration,
 * and initial model choice when starting Sentinel for the first time.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { saveSettings, type SettingsData } from "@sentinel/core";
import {
  PROVIDERS,
  ProviderRegistry,
  type ProviderInfo,
  type ModelInfo,
} from "@sentinel/llm";

type Step = "provider" | "base_url" | "api_key" | "model" | "saving";

interface SetupWizardProps {
  onComplete: (settings: SettingsData) => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState<Step>("provider");
  const [selectedProviderIndex, setSelectedProviderIndex] = useState(0);
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [availableModels, setAvailableModels] = useState<readonly ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const chosenProvider: ProviderInfo =
    PROVIDERS[selectedProviderIndex] ?? PROVIDERS[0]!;
  // Keyboard navigation for menu steps
  useInput((input, key) => {
    if (step === "provider") {
      if (key.upArrow) {
        setSelectedProviderIndex((prev) =>
          prev > 0 ? prev - 1 : PROVIDERS.length - 1,
        );
      }
      if (key.downArrow) {
        setSelectedProviderIndex((prev) =>
          prev < PROVIDERS.length - 1 ? prev + 1 : 0,
        );
      }
      if (key.return) {
        setErrorMessage("");
        if (chosenProvider.requiresBaseUrl) {
          setBaseUrlInput(chosenProvider.defaultBaseUrl ?? "");
          setStep("base_url");
        } else {
          setStep("api_key");
        }
      }
    } else if (step === "model" && chosenProvider.id !== "custom") {
      if (key.upArrow) {
        setSelectedModelIndex((prev) =>
          prev > 0 ? prev - 1 : availableModels.length - 1,
        );
      }
      if (key.downArrow) {
        setSelectedModelIndex((prev) =>
          prev < availableModels.length - 1 ? prev + 1 : 0,
        );
      }
      if (key.return) {
        const chosenModel =
          availableModels[selectedModelIndex] ?? availableModels[0];
        if (chosenModel) handleFinish(chosenModel.id);
      }
    }
  });

  const handleBaseUrlSubmit = (url: string) => {
    const trimmed = url.trim();
    try { new URL(trimmed); } catch { setErrorMessage("Base URL must be a valid URL."); return; }
    if (!trimmed && chosenProvider.id !== "custom" && chosenProvider.id !== "ollama") {
      setErrorMessage("Base URL cannot be empty.");
      return;
    }
    setErrorMessage("");
    setStep("api_key");
  };

  const handleApiKeySubmit = async (keyStr: string) => {
    const trimmed = keyStr.trim();
    if (!trimmed && chosenProvider.id !== "custom") {
      setErrorMessage("API key cannot be empty.");
      return;
    }
    setErrorMessage("");
    setApiKeyInput(trimmed);
    setSelectedModelIndex(0);
    setStep("model");
    setIsLoadingModels(true);
    try {
      const provider = new ProviderRegistry().create({
        provider: chosenProvider.id,
        apiKey: trimmed,
        baseUrl: chosenProvider.requiresBaseUrl ? baseUrlInput : chosenProvider.defaultBaseUrl,
      });
      setAvailableModels(await provider.listModels());
    } catch (error) {
      setAvailableModels([]);
      setErrorMessage(`Could not discover provider models: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleFinish = async (modelId: string) => {
    setStep("saving");
    const settings: SettingsData = {
      model: {
        provider: chosenProvider.id,
        modelId,
        apiKey: apiKeyInput,
        baseUrl: chosenProvider.requiresBaseUrl ? baseUrlInput : undefined,
      },
    };

    try {
      await saveSettings(settings);
      onComplete(settings);
    } catch (err) {
      setErrorMessage(
        `Failed to save settings: ${err instanceof Error ? err.message : String(err)}`,
      );
      setStep("model");
    }
  };

  const handleModelSubmit = (modelId: string) => {
    const trimmed = modelId.trim();
    if (!trimmed) {
      setErrorMessage("Model identifier cannot be empty.");
      return;
    }
    setErrorMessage("");
    handleFinish(trimmed);
  };
  return (
    <Box flexDirection="column" padding={1}>
      {/* Banner */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        marginBottom={1}
      >
        <Text bold color="cyan">
          🛡️ Sentinel — Software Engineering Agent
        </Text>
        <Text color="gray">
          First-time setup: configure your LLM provider and credentials.
        </Text>
      </Box>

      {errorMessage ? (
        <Box marginBottom={1}>
          <Text color="red">⚠ {errorMessage}</Text>
        </Box>
      ) : null}

      {/* Step 1: Provider */}
      {step === "provider" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="yellow">
              Step 1/3: Choose your LLM Provider
            </Text>
            <Text color="gray"> (Use ↑/↓ to navigate, Enter to confirm)</Text>
          </Box>

          {PROVIDERS.map((p, idx) => {
            const isSelected = idx === selectedProviderIndex;
            return (
              <Box
                key={p.id}
                flexDirection="column"
                paddingLeft={1}
                marginBottom={1}
              >
                <Box>
                  <Text bold color={isSelected ? "cyan" : "white"}>
                    {isSelected ? "❯ " : "  "}
                    {p.name}
                  </Text>
                  {p.id === "google" && (
                    <Text color="green"> [Default / Recommended]</Text>
                  )}
                </Box>
                <Box paddingLeft={2}>
                  <Text color={isSelected ? "white" : "gray"}>
                    {p.description}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Step 2: Custom Base URL (if custom) */}
      {step === "base_url" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="yellow">
              Step 2/4: Enter Custom API Base URL
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="gray">
              Example: https://openrouter.ai/api/v1 or http://localhost:11434/v1
            </Text>
          </Box>
          <Box>
            <Text color="cyan">&gt; </Text>
            <TextInput
              value={baseUrlInput}
              onChange={setBaseUrlInput}
              onSubmit={handleBaseUrlSubmit}
              placeholder="https://openrouter.ai/api/v1"
            />
          </Box>
        </Box>
      )}

      {/* Step 3: API Key */}
      {step === "api_key" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="yellow">
              Step {chosenProvider.requiresBaseUrl ? "3/4" : "2/3"}: Enter your{" "}
              {chosenProvider.name} API Key
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="gray">
              Credentials are stored in Sentinel’s protected secrets store. Leave blank for local providers.
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="blue">
              {chosenProvider.keyHelpUrl ? `Get an API key at: ${chosenProvider.keyHelpUrl}` : 'Use the local provider endpoint configured above.'}
            </Text>
          </Box>
          <Box>
            <Text color="cyan">&gt; </Text>
            <TextInput
              value={apiKeyInput}
              onChange={setApiKeyInput}
              onSubmit={handleApiKeySubmit}
              mask="*"
              placeholder="Paste your API key here and press Enter..."
            />
          </Box>
        </Box>
      )}

      {/* Step 4: Model selection */}
      {step === "model" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="yellow">
              Step {chosenProvider.requiresBaseUrl ? "4/4" : "3/3"}: Select
              Initial Model for {chosenProvider.name}
            </Text>
            <Text color="gray"> (Use ↑/↓ to navigate, Enter to finish)</Text>
          </Box>

          {isLoadingModels ? (
            <Text color="gray">Discovering models from the active provider…</Text>
          ) : availableModels.length === 0 ? (
            <>
              <TextInput
                value={modelInput}
                onChange={(value) => {
                  setModelInput(value);
                  setErrorMessage("");
                }}
                onSubmit={handleModelSubmit}
                placeholder="Enter the model identifier returned by the provider"
              />
            </>
          ) : (
            <>
              {availableModels.map((m, idx) => {
                const isSelected = idx === selectedModelIndex;
                const contextStr =
                  m.contextLength === undefined
                    ? "context unknown"
                    : m.contextLength >= 1_000_000
                      ? `${(m.contextLength / 1_000_000).toFixed(0)}M tokens`
                      : `${(m.contextLength / 1_000).toFixed(0)}k tokens`;

                return (
                  <Box
                    key={m.id}
                    flexDirection="column"
                    paddingLeft={1}
                    marginBottom={1}
                  >
                    <Box>
                      <Text bold color={isSelected ? "cyan" : "white"}>
                        {isSelected ? "❯ " : "  "}
                        {m.displayName ?? m.id}{" "}
                      </Text>
                      <Text color="gray">
                        ({m.id}) • {contextStr}
                      </Text>
                    </Box>
                    <Box paddingLeft={2}>
                      <Text color={isSelected ? "white" : "gray"}>
                        {m.supportsReasoningEffort ? "Native reasoning effort supported." : "Reasoning policy will be orchestrated by Sentinel."}
                      </Text>
                    </Box>
                  </Box>
                );
              })}
            </>
          )}
        </Box>
      )}

      {/* Step 5: Saving */}
      {step === "saving" && (
        <Box>
          <Text color="cyan">Saving settings and starting Sentinel...</Text>
        </Box>
      )}
    </Box>
  );
};
