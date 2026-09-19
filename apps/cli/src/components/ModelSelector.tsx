/**
 * Runtime model selector. The provider is queried when this view opens;
 * no model identifier is maintained in the UI source.
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { LLMProvider, ModelDiscovery, ModelInfo } from '@sentinel/llm';
import { THEME } from '../theme.js';

interface ModelSelectorProps {
  providerName: string;
  provider: LLMProvider;
  discovery: ModelDiscovery;
  currentModelId: string;
  onSelect: (modelId: string) => void;
  onCancel: () => void;
}

const VISIBLE_COUNT = 6;

// Composant réutilisé pour la cohérence UI avec le Header
const Dot: React.FC<{ color: string }> = ({ color }) => <Text color={color}>●</Text>;

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  providerName,
  provider,
  discovery,
  currentModelId,
  onSelect,
  onCancel,
}) => {
  const [models, setModels] = useState<readonly ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [customModelInput, setCustomModelInput] = useState(currentModelId);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError(undefined);
    discovery.listModels(provider).then((discovered) => {
      if (!active) return;
      setModels(discovered);
      const currentIndex = discovered.findIndex((model) => model.id === currentModelId);
      setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [discovery, provider, currentModelId]);

  useInput((input, key) => {
    if (isLoading) {
      if (key.escape) onCancel();
      return;
    }
    if (models.length === 0) {
      if (key.escape || input === 'q' || input === 'Q') onCancel();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((previous) => previous > 0 ? previous - 1 : models.length - 1);
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((previous) => previous < models.length - 1 ? previous + 1 : 0);
      return;
    }
    if (key.return) {
      const selected = models[selectedIndex];
      if (selected) onSelect(selected.id);
      return;
    }
    if (key.escape || input === 'q' || input === 'Q') onCancel();
  });

  // Logique de scroll virtuel
  let startIndex = selectedIndex - Math.floor(VISIBLE_COUNT / 2);
  if (startIndex < 0) startIndex = 0;
  if (startIndex + VISIBLE_COUNT > models.length) {
    startIndex = Math.max(0, models.length - VISIBLE_COUNT);
  }
  const visibleModels = models.slice(startIndex, startIndex + VISIBLE_COUNT);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.graphiteLight} paddingX={1} marginBottom={1}>

      {/* En-tête de la box aligné sur le style Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text bold color={THEME.green}>▲ Model Selector</Text>
          <Text color={THEME.muted}> · {providerName}</Text>
        </Box>
        <Box>
          <Text color={THEME.muted}>↑/↓ nav · ↵ select · esc cancel</Text>
        </Box>
      </Box>

      {/* États de chargement et erreurs */}
      {isLoading && <Text color={THEME.muted}>Discovering models...</Text>}
      {!isLoading && loadError && <Text color={THEME.warning}>Discovery failed: {loadError}</Text>}

      {/* Mode fallback si aucun modèle trouvé */}
      {!isLoading && models.length === 0 ? (
        <Box flexDirection="column">
          <Text color={THEME.muted}>No models found. Enter ID manually:</Text>
          <Box>
            <Box width={2}><Text color={THEME.green}>❯</Text></Box>
            <TextInput
              value={customModelInput}
              onChange={setCustomModelInput}
              onSubmit={(value) => {
                const model = value.trim();
                if (model) onSelect(model);
              }}
              placeholder="model identifier"
            />
          </Box>
        </Box>
      ) : null}

      {/* Rendu paginé des modèles */}
      {visibleModels.map((model, index) => {
        const absoluteIndex = startIndex + index;
        const selected = absoluteIndex === selectedIndex;
        const isActive = model.id === currentModelId;

        const context = model.contextLength === undefined
          ? '?'
          : model.contextLength >= 1_000_000
            ? `${(model.contextLength / 1_000_000).toFixed(0)}M`
            : `${(model.contextLength / 1_000).toFixed(0)}k`;

        const reasoning = model.supportsReasoningEffort ? ' · native reason' : '';

        return (
          <Box key={model.id}>
            {/* Curseur de sélection */}
            <Box width={2}>
              {selected ? <Text bold color={THEME.green}>❯</Text> : <Text> </Text>}
            </Box>

            {/* Indicateur d'état actif */}
            <Box width={3}>
              {isActive ? <Dot color={THEME.greenStrong} /> : <Text> </Text>}
            </Box>

            {/* Nom et infos du modèle */}
            <Text color={selected ? THEME.text : THEME.muted}>
              {model.displayName ?? model.id}
            </Text>
            <Text color={THEME.muted}>
              {' '}({model.id}) · {context} tokens{reasoning}
            </Text>
          </Box>
        );
      })}

      {/* Indicateurs de pagination visuelle */}
      {models.length > VISIBLE_COUNT && (
        <Box marginTop={1}>
          <Text color={THEME.muted}>
            {startIndex > 0 ? '▲ ' : '  '}
            Showing {startIndex + 1}-{startIndex + visibleModels.length} of {models.length}
            {startIndex + VISIBLE_COUNT < models.length ? ' ▼' : ''}
          </Text>
        </Box>
      )}
    </Box>
  );
};