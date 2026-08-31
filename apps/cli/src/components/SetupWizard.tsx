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
  getAvailableModels,
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
  const [errorMessage, setErrorMessage] = useState("");

  const chosenProvider: ProviderInfo =
    PROVIDERS[selectedProviderIndex] ?? PROVIDERS[0]!;
  const availableModels: ModelInfo[] = getAvailableModels(chosenProvider.id);

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
          setBaseUrlInput(
            chosenProvider.defaultBaseUrl ?? "https://openrouter.ai/api/v1",
          );
          setStep("base_url");
        } else {
          setStep("api_key");
        }
      }
    } else if (step === "model") {
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
        handleFinish(chosenModel ? chosenModel.id : "gemini-2.5-flash");
      }
    }
  });

  const handleBaseUrlSubmit = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) {
      setErrorMessage("Base URL cannot be empty.");
      return;
    }
    setErrorMessage("");
    setStep("api_key");
  };

  const handleApiKeySubmit = (keyStr: string) => {
    const trimmed = keyStr.trim();
    if (!trimmed) {
      setErrorMessage("API key cannot be empty.");
      return;
    }
    setErrorMessage("");
    setApiKeyInput(trimmed);
    setSelectedModelIndex(0);
    setStep("model");
  };

  const handleFinish = async (modelId: string) => {
    setStep("saving");
    const settings: SettingsData = {
      model: {
        provider: chosenProvider.id,
        model: modelId,
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
    setErrorMessage("");
    handleFinish(modelId);
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
              Keys are securely stored in ~/.sentinel/settings.json.
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="blue">
              Get an API key at: {chosenProvider.keyHelpUrl}
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

          {chosenProvider.id === "custon" ? (
            <>
              <TextInput
                value={modelInput}
                onChange={(value) => {
                  setModelInput(value);
                  setErrorMessage("");
                }}
                onSubmit={handleModelSubmit}
                placeholder="Enter model name"
              />
            </>
          ) : (
            <>
              {availableModels.map((m, idx) => {
                const isSelected = idx === selectedModelIndex;
                const contextStr =
                  m.contextWindow >= 1_000_000
                    ? `${(m.contextWindow / 1_000_000).toFixed(0)}M tokens`
                    : `${(m.contextWindow / 1_000).toFixed(0)}k tokens`;

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
                        {m.name}{" "}
                      </Text>
                      <Text color="gray">
                        ({m.id}) • {contextStr}
                      </Text>
                      {m.isDefault && <Text color="green"> [Default]</Text>}
                    </Box>
                    <Box paddingLeft={2}>
                      <Text color={isSelected ? "white" : "gray"}>
                        {m.description}
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
