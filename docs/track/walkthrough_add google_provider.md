# Walkthrough — Migration `settings.json`, Provider Google AI, Setup Wizard & Build

L'ensemble des objectifs demandés a été implémenté, testé et validé avec succès.

---

## 1. Modifications Apportées

### A. `@sentinel/core` — Remplacement de `.env` par `settings.json`
- **Fichier modifié** : [`packages/core/src/config.ts`](file:///d:/Project/AI/Sentinel/packages/core/src/config.ts)
  - Suppression complète du parsing de `.env` et `.env.local`.
  - Implémentation du système de configuration hiérarchique avec stockage persistant global dans `~/.sentinel/settings.json`.
  - Ajout des fonctions de gestion :
    - [`isFirstLaunch()`](file:///d:/Project/AI/Sentinel/packages/core/src/config.ts#L100) : Détecte si aucune configuration/clé n'est définie.
    - [`loadSettings()`](file:///d:/Project/AI/Sentinel/packages/core/src/config.ts#L125) : Charge la configuration utilisateur depuis `~/.sentinel/settings.json`.
    - [`saveSettings(settings)`](file:///d:/Project/AI/Sentinel/packages/core/src/config.ts#L138) : Écrit le fichier avec permissions sécurisées (mode `0600`).
    - [`updateSettings(partial)`](file:///d:/Project/AI/Sentinel/packages/core/src/config.ts#L152) : Met à jour partiellement la configuration (ex: changement de modèle).
    - [`resetSettings()`](file:///d:/Project/AI/Sentinel/packages/core/src/config.ts#L170) : Supprime `settings.json` pour réinitialiser la configuration à 0.
  - Valeurs par défaut mises à jour :
    - `provider` : `'google'`
    - `model` : `'gemini-2.5-flash'`

### B. `@sentinel/llm` — Provider Google AI Studio & Catalogue de Modèles
- **Nouveau provider** : [`packages/llm/src/providers/google.ts`](file:///d:/Project/AI/Sentinel/packages/llm/src/providers/google.ts)
  - Implémente `LLMProvider` avec `chat()` et `chatStream()`.
  - Support natif des modèles Gemini (Gemini 2.5 Flash, 2.5 Pro, 2.0 Flash, 1.5 Pro, etc.).
  - Support complet du tool calling / function calling (déclarations et réponses).
  - Gestion du streaming SSE avec calcul d'usage des tokens et retries automatiques (backoff exponentiel).
- **Catalogue de modèles** : [`packages/llm/src/models.ts`](file:///d:/Project/AI/Sentinel/packages/llm/src/models.ts)
  - Modèles récents répertoriés pour chaque provider :
    - **Google AI** : `gemini-2.5-flash` (par défaut), `gemini-2.5-pro`, `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-1.5-pro`, `gemini-1.5-flash`
    - **OpenAI** : `gpt-4o`, `gpt-4o-mini`, `o3-mini`, `o1`, `gpt-4.5-preview`
    - **Anthropic** : `claude-3-7-sonnet-20250219`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-opus-20240229`
    - **Custom** : `deepseek/deepseek-r1`, `deepseek/deepseek-chat`, `meta-llama/llama-3.3-70b-instruct`, `mistralai/mistral-large-2411`, `qwen/qwen-2.5-coder-32b-instruct`
- **Registre** : [`packages/llm/src/provider-registry.ts`](file:///d:/Project/AI/Sentinel/packages/llm/src/provider-registry.ts) mis à jour pour instancier `GoogleProvider` par défaut.

### C. `@sentinel/cli` — Setup Wizard & Commandes `/model` et `/reset`
- **Assistant premier lancement** : [`apps/cli/src/components/SetupWizard.tsx`](file:///d:/Project/AI/Sentinel/apps/cli/src/components/SetupWizard.tsx)
  - Étape 1 : Choix du provider (Google AI Studio [recommandé], OpenAI, Anthropic, Custom).
  - Étape 2 (si Custom) : Saisie de la Base URL (ex: `https://openrouter.ai/api/v1`).
  - Étape 3 : Saisie sécurisée et masquée (`*`) de la clé API avec liens d'aide directs.
  - Étape 4 : Sélection du modèle parmi les plus récents du provider sélectionné.
  - Étape 5 : Sauvegarde automatique dans `~/.sentinel/settings.json` et démarrage immédiat de l'interface chat.
- **Sélecteur de modèle interactif** : [`apps/cli/src/components/ModelSelector.tsx`](file:///d:/Project/AI/Sentinel/apps/cli/src/components/ModelSelector.tsx)
  - Déclenché via la commande `/model`.
  - Navigation flèches haut/bas + validation Enter pour changer de modèle actif à chaud.
  - Met à jour la configuration persistée dans `settings.json`.
- **Commande `/reset`** : [`apps/cli/src/commands.ts`](file:///d:/Project/AI/Sentinel/apps/cli/src/commands.ts) & [`apps/cli/src/App.tsx`](file:///d:/Project/AI/Sentinel/apps/cli/src/App.tsx)
  - Réinitialise à 0 la configuration et supprime `settings.json`.
- **Point d'entrée** : [`apps/cli/src/index.tsx`](file:///d:/Project/AI/Sentinel/apps/cli/src/index.tsx) vérifie `isFirstLaunch()` pour afficher le wizard ou démarrer directement la session.

### D. Documentation & Guide de Build
- **Nouveau guide** : [`BUILD.md`](file:///d:/Project/AI/Sentinel/BUILD.md)
  - Guide complet de build (`pnpm install && pnpm build`).
  - Procédures d'installation sur une autre machine (via Git ou archive autonome).
  - Documentation détaillée du fichier `~/.sentinel/settings.json`.
- **Mise à jour de `README.md`** et scripts dans [`package.json`](file:///d:/Project/AI/Sentinel/package.json).

---

## 2. Résultats des Tests et Validations

- **Build de tous les packages (`pnpm build`)** :
  - `@sentinel/core` → `dist/` ✓
  - `@sentinel/git` → `dist/` ✓
  - `@sentinel/llm` → `dist/` ✓
  - `@sentinel/permissions` → `dist/` ✓
  - `@sentinel/storage` → `dist/` ✓
  - `@sentinel/memory` → `dist/` ✓
  - `@sentinel/project` → `dist/` ✓
  - `@sentinel/tools` → `dist/` ✓
  - `@sentinel/context` → `dist/` ✓
  - `@sentinel/agent` → `dist/` ✓
  - `@sentinel/cli` → `dist/` ✓
- **Tests unitaires et d'intégration (`pnpm test`)** : **24/24 tests passés avec succès**.
