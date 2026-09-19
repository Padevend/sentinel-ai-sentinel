# Audit initial de complétion de Sentinel

Date de l’audit : 2026-09-18  
Répertoire audité : D:\Project\AI\Sentinel  
Référence : brief de complétion Sentinel, sections 1 à 7

## 1. Périmètre et méthode

Cet audit a été réalisé avant toute implémentation de fonctionnalité demandée par le brief. Il s’appuie sur :

- l’arborescence et les fichiers réellement présents dans le dépôt ;
- les manifestes package.json, pnpm-workspace.yaml, pnpm-lock.yaml et les dépendances installées ;
- la lecture des contrats et implémentations dans packages/* et apps/cli ;
- l’état Git observé avant la production de ce rapport ;
- l’exécution réelle de la suite de tests, du typecheck et du build.

Le dépôt contient déjà des modifications non committées qui ne sont pas attribuées à cet audit. Elles sont listées en section 6 et ont été conservées.

## 2. État exécutable de référence

Les vérifications suivantes ont été exécutées sur l’état observé :

| Commande | Résultat observé |
| --- | --- |
| pnpm test | Succès : 12 fichiers de test, 34 tests passés |
| pnpm typecheck | Succès sur les 11 projets compilés du workspace |
| pnpm build | Succès sur les 11 projets compilés du workspace |
| pnpm list --depth 0 -r | Dépendances installées et workspace résolu correctement |

Le README annonce encore 36 tests et l’ancien audit cartographique (docs/audit-cartographique.md) en annonce 31 ; le chiffre mesuré lors de cet audit est 34.

Ces résultats prouvent que la base actuelle compile et que les tests existants passent. Ils ne prouvent pas le respect des critères de sécurité, de listing dynamique ou des contrats d’API du brief.

## 3. Structure actuelle du repository

    Sentinel/
    ├─ apps/
    │  └─ cli/                         # CLI Ink + React
    ├─ packages/
    │  ├─ core/                        # types, config, erreurs, logs, doctor, événements
    │  ├─ llm/                         # abstraction et adaptateurs Google/OpenAI/Anthropic
    │  ├─ permissions/                 # PermissionManager et classifications d’outils
    │  ├─ tools/                       # registre, filesystem, shell et Git tools
    │  ├─ agent/                       # kernel, session, planification, vérification
    │  ├─ storage/                     # SQLite et repositories
    │  ├─ project/                     # détection, indexation, analyse structurelle
    │  ├─ context/                     # scoring et assemblage du contexte
    │  ├─ memory/                      # mémoire de session/projet et historique tools
    │  └─ git/                         # abstraction Git
    ├─ tests/
    │  ├─ fixtures/fullstack-app/
    │  └─ integration/
    ├─ docs/
    ├─ distribution/
    ├─ scripts/
    ├─ package.json
    ├─ pnpm-workspace.yaml
    ├─ pnpm-lock.yaml
    ├─ tsconfig.base.json
    └─ vitest.config.ts

### Manifestes et stack effectivement présents

- Node.js >=20, TypeScript strict, pnpm >=9 avec packageManager pnpm@10.14.0.
- UI : Ink 5, React 18, ink-text-input, ink-spinner.
- Persistance : better-sqlite3 11 avec migrations et mode WAL.
- LLM : openai 4, @anthropic-ai/sdk 0.36, appels REST directs Google.
- Validation/configuration : Zod.
- Indexation : fast-glob et ignore.
- Tests : Vitest.
- Il n’y a pas de dépendance ts-morph, Tree-sitter, fuzzysort ou équivalente, ni de file watcher dédié.
- Playwright est absent, ce qui est compatible avec le brief puisqu’il est explicitement hors scope de ce cycle.

## 4. État des modules du brief

L’état « complet » ci-dessous signifie que les critères d’acceptation du brief sont concrètement couverts, pas seulement que le package existe.

| Module | État | Fichiers observés | Écart principal par rapport au brief |
| --- | --- | --- | --- |
| 3.1 Agent Kernel | Partiel | packages/agent/src/kernel.ts, packages/agent/src/types.ts | run() retourne une Promise et non AsyncIterable<AgentEvent> ; pas de cancel(sessionId) ; streaming provider non consommé par le kernel ; persistance intermédiaire non garantie |
| 3.2 Model Provider Abstraction | Partiel | packages/llm/src/types.ts, packages/llm/src/providers/*, provider-registry.ts, models.ts | Pas de listModels(), pas de supportsNativeReasoningEffort(), modèles statiques en production ; OpenRouter/Ollama et listing custom non implémentés |
| 3.3 Permission/Sandbox Engine | Partiel, risque élevé | packages/permissions/src/index.ts, packages/tools/src/shell.ts, filesystem.ts | Pas de PermissionEngine.evaluate() avec scopes/règles ; absence de handler = autorisation implicite ; whitelist vide = tout shell autorisé ; aucune vérification centralisée pour chaque exécution |
| 3.4 Config Engine | Partiel | packages/core/src/config.ts | Cascade defaults/global/projet/env présente, mais contrat différent, modèle par défaut codé en dur, pas de vrais session overrides et secret conservé dans le settings global en clair |
| 3.5 Skills Engine | Absent | Aucun module skills dans packages ou apps | Pas de lecture frontmatter, catalogue de descriptions, lazy loading ni activation dynamique |
| 3.6 Context/File Engine @fichier | Partiel | packages/project/src/indexer.ts, packages/context/src/engine.ts, apps/cli/src/components/InputPrompt.tsx | Indexation ponctuelle via fast-glob, pas de watcher ; pas de ripgrep --files, fuzzy search dédié ni overlay @fichier |
| 3.7 Sessions SQLite | Partiel | packages/agent/src/session.ts, session-manager.ts, packages/storage/src/*, apps/cli/src/index.tsx | SQLite/checkpoints/reprise présents, mais identité Git/chemin, état Git, disponibilité provider et confirmation d’une session interrompue ne sont pas vérifiés avant reprise |
| 3.8 Terminal UI | Partiel | apps/cli/src/App.tsx, index.tsx, components/* | UI Ink présente, mais App/RootLauncher créent providers, résolvent config et prennent des décisions ; pas d’indicateur d’effort reasoning ni autocomplete @fichier |
| 3.9 Tool Engine | Partiel | packages/tools/src/registry.ts, filesystem.ts, shell.ts, git-tools.ts | Schémas exposés mais jamais validés avant exécution ; casts directs des inputs ; permissions appliquées par le kernel plutôt que par un moteur unique |
| 3.10 Diagnostics | Partiel | packages/core/src/doctor.ts, platform.ts, tests doctor | OS/architecture, shell, répertoires, écriture, Git et credentials contrôlés ; pas de ping léger du provider configuré ni de contrôle complet des permissions |

## 5. Constat détaillé par contrat

### 5.1 Agent Kernel

Présent : boucle reason → act → observe → adapt, appels de tools, confirmation via PermissionManager, AbortSignal, événements internes et vérification optionnelle.

Écarts bloquants :

- le contrat public est run(userInput, session): Promise<AgentStepResult> ; il ne produit pas l’AsyncIterable<AgentEvent> demandé ;
- chat() est appelé, alors que chatStream() existe dans les adaptateurs mais n’est pas utilisé par la boucle ;
- il n’existe pas de cancel(sessionId) ni de registre d’exécutions annulables ;
- une interruption ou un crash pendant la boucle ne garantit pas la sauvegarde du dernier état ; l’UI sauvegarde surtout après le retour du kernel ;
- il n’y a pas d’événement permission_required conforme au contrat ;
- l’effort de raisonnement n’est pas propagé dans la requête modèle.

### 5.2 Providers et modèles

Les adaptateurs Google, OpenAI-compatible et Anthropic gèrent des complétions synchrones et streamées. ProviderRegistry permet d’enregistrer une factory, ce qui est une base d’extensibilité utile.

Le différenciateur principal est toutefois en échec dans l’état actuel :

- packages/llm/src/models.ts contient une liste statique de modèles Google, OpenAI et Anthropic ;
- getDefaultModelForProvider() possède aussi un fallback statique gemini-2.5-flash ;
- packages/core/src/config.ts, packages/agent/src/session.ts et apps/cli/src/components/SetupWizard.tsx contiennent des modèles par défaut codés en dur ;
- ModelSelector appelle getAvailableModels() au lieu d’interroger le provider actif ;
- l’interface LLMProvider ne possède ni id, ni listModels(), ni supportsNativeReasoningEffort() ;
- aucune implémentation ne couvre le endpoint de listing Anthropic/OpenAI/Google/OpenRouter/Ollama/custom défini par le brief ;
- le provider custom réutilise l’adaptateur OpenAI pour compléter, mais ne fournit pas la découverte dynamique des modèles ;
- aucun mapping d’effort low/medium/high/max n’est modélisé. Les paramètres Anthropic extended thinking et OpenAI reasoning_effort ne sont pas gérés, pas plus que la politique orchestrée pour les providers sans reasoning natif.

### 5.3 Permissions et sandbox

PermissionManager fournit trois niveaux et une blocklist minimale. Le kernel consulte le manager pour les tool calls et bloque certains shell commands.

Les invariants de sécurité du brief ne sont pas atteints :

- la politique est centrée sur le nom du tool, pas sur des scopes shell/filesystem/network et des règles allow/ask/deny ;
- requestConfirmation() retourne true si aucun handler UI n’est installé ; c’est contraire au deny-by-default ;
- isCommandAllowed() retourne true si la whitelist est vide ; une commande shell non explicitement autorisée peut donc passer après confirmation/classification ;
- cwd dans execute_command est résolu mais n’est pas refusé s’il sort du workspace ;
- un appel direct à ToolRegistry.execute() contourne la consultation faite dans AgentKernel ;
- la politique réseau n’existe pas ;
- il n’existe pas de recordSessionOverride().

### 5.4 Configuration

La résolution defaults → ~/sentinel/config/settings.json → <project>/.sentinel/settings.json → environnement est déjà réelle et la configuration projet retire apiKey avant fusion. Le stockage runtime est séparé sous ~/sentinel/data, cache et logs.

Écarts :

- le modèle de données utilise model.model au lieu du modelId du contrat et ne possède pas reasoningEffort ;
- la configuration globale accepte/persiste apiKey en clair dans settings.json ; aucune implémentation de secret store chiffré n’est présente ;
- les overrides de session ne sont pas un type ou un mécanisme dédié ;
- les valeurs par défaut de modèle violent la règle « aucun nom de modèle codé en dur » ;
- les fichiers projet acceptent encore .sentinel/config.json en plus de settings.json, sans décision documentée dans le code.

### 5.5 Skills

Le schéma de configuration connaît un champ skills, mais aucun moteur ne parcourt les dossiers, ne parse le frontmatter Markdown ou ne charge une skill à la demande. Le critère « ajouter un Markdown sans redémarrage ni modification de code » n’est donc pas couvert.

### 5.6 Index et contexte @fichier

ProjectIndexer construit un index de fichiers et de symboles et réutilise certains symboles selon taille/mtime. ContextEngine assemble un résumé de projet, des fichiers pertinents et un Structural Twin déjà ajouté dans les changements présents.

Écarts :

- le scan utilise fast-glob('**/*'), pas ripgrep --files ;
- le scan n’est pas maintenu par watcher et ne répond pas à la frappe sans rescan explicite ;
- findSymbols() est un includes() simple, pas un scoring fuzzy type Smith-Waterman/fzf ;
- InputPrompt propose des commandes /, mais aucun parsing de token @ et aucun overlay de fichiers ;
- la pré-analyse structurée est fondée sur des expressions régulières dans structural-analyzer.ts/structural-twin.ts, pas sur ts-morph ou Tree-sitter ;
- le contexte structural est assemblé avant l’appel modèle, mais aucun benchmark « avec/sans pré-analyse » ni compteur de lectures exploratoires n’est présent.

### 5.7 Sessions et reprise

Le schéma SQLite contient sessions, messages sérialisés, checkpoints et les champs d’état/fichiers modifiés. --continue, --resume et --resume <id> existent.

Écarts :

- checkConsistency() compare principalement les mtime des fichiers modifiés ; il ne vérifie pas l’identité du remote Git en priorité, l’état Git courant ou les changements de branche ;
- la disponibilité du provider configuré n’est pas testée avant reprise ;
- une session interrompue est signalée, mais aucune confirmation dédiée n’est imposée avant continuation ;
- la table checkpoints existe, mais la sauvegarde courante sérialise également les checkpoints dans la ligne sessions, sans flux clair de checkpoint atomique à chaque étape ;
- des contournements as any existent dans les chemins de reprise et les fixtures de test.

### 5.8 UI

La CLI nue sentinel, les commandes de reprise, doctor, les confirmations inline, l’activité des tools et le streaming d’événements UI sont présents.

La séparation stricte demandée n’est pas respectée : RootLauncher instancie les repositories, indexer, ContextEngine, mémoire, registry tools, permissions et provider ; App reconfigure directement le provider et écrit la configuration. Ces décisions doivent être déplacées vers une couche application/session dédiée.

### 5.9 Tool Engine

Les tools attendus de base sont présents : lecture/écriture, patch, suppression, recherche texte, shell et Git. ToolRegistry capture les exceptions et retourne un ToolResult, ce qui protège contre certains crashes.

Le critère de validation programmatique n’est pas respecté : inputSchema est seulement transmis au provider et les implémentations font des casts directs (input as {...}). Un JSON invalide, un champ manquant ou un mauvais type peut donc atteindre l’exécution. La validation doit être effectuée avant tout effet et produire une erreur structurée récupérable.

### 5.10 Diagnostics

DoctorEngine vérifie les répertoires runtime, l’écriture atomique, la présence de la base SQLite, les credentials, le répertoire projet, Git, l’OS/architecture et le shell par défaut.

Il manque notamment :

- un ping léger et non destructif au provider configuré ;
- une vérification explicite des permissions filesystem nécessaires et de l’intégrité de la configuration ;
- une validation de la disponibilité du shell utilisable par le même chemin d’exécution que le tool shell.

## 6. État Git préexistant à préserver

Avant la création de ce rapport, git status --short indiquait déjà les modifications suivantes :

- modifications dans l’UI (apps/cli/src/App.tsx, apps/cli/src/index.tsx et plusieurs composants) ;
- modifications dans packages/agent, context, core, llm, permissions et project ;
- docs/audit-cartographique.md non suivi ;
- packages/project/src/structural-twin.ts et son test non suivis ;
- update.md non suivi.

Ces changements n’ont pas été réinitialisés ni écrasés. AUDIT.md est le seul fichier ajouté par cette étape d’audit.

## 7. Dettes techniques visibles

### Typage et validation

- any ou assertions non justifiées aux frontières SQLite (packages/storage/src/repositories.ts), dans apps/cli/src/index.tsx et plusieurs tests ;
- parsing JSON de la base et des réponses externes sans validation de schéma dédiée ;
- inputs de tools castés directement avant validation.

### Sécurité

- permissions non deny-by-default en l’absence de callback ;
- whitelist shell permissive lorsqu’elle est vide ;
- cwd shell non borné explicitement au workspace ;
- modèles statiques et clés API acceptées dans un settings global en clair ;
- la recherche filesystem récursive ne s’appuie pas sur le mécanisme ripgrep prévu et ne documente pas un filtre systématique des secrets pour le contexte.

### Architecture

- logique d’assemblage runtime et de création de providers dans les composants Ink ;
- kernel synchrone du point de vue de son API publique malgré la présence d’événements et de streams sous-jacents ;
- absence de couche dédiée skills/file-context/provider discovery ;
- deux représentations de session persistée (JSON dans sessions, table checkpoints) sans contrat d’écriture atomique clairement unifié.

### Tests manquants

- listing dynamique et TTL cache pour chaque provider ;
- mapping d’effort de raisonnement natif et orchestré ;
- refus par défaut d’une commande shell et d’une écriture hors workspace ;
- validation d’arguments invalides pour chaque tool ;
- annulation réelle du kernel et absence de processus enfant ;
- reprise après interruption avec changement remote/branche/état Git/provider ;
- découverte lazy des skills ;
- performance de recherche @auth sans rescan ;
- mesure de réduction des appels de lecture et du budget de tokens grâce à la pré-analyse.

## 8. Différenciateurs du brief

| Différenciateur | État mesuré | Preuve |
| --- | --- | --- |
| Listing dynamique sans modèles codés en dur | Non couvert | Catalogue statique dans packages/llm/src/models.ts, defaults dans core/config.ts et agent/session.ts |
| Effort reasoning cross-provider | Non couvert | Aucun champ ou méthode de contrat, aucun mapping d’adaptateur |
| Pré-analyse statique déterministe | Partiel | Index/symboles/Structural Twin présents, mais analyse regex, pas de benchmark ni compteur comparatif |
| Skills lazy-loaded par description | Non couvert | Aucun SkillsEngine ou parseur Markdown |
| Configuration projet versionnable séparée des données privées | Partiel | .sentinel/settings.json est chargé et apiKey y est retirée, mais les secrets globaux restent en clair et les overrides de session manquent |

## 9. Divergences de stack et décisions proposées

| Sujet cible | État réel | Décision proposée pour la suite |
| --- | --- | --- |
| SQLite | better-sqlite3 déjà en place | Conserver et renforcer les repositories/transactions |
| Tree-sitter ou ts-morph | Absent ; analyse regex existante | Ajouter une dépendance seulement après choix du périmètre TypeScript ; conserver l’analyse actuelle comme fallback documenté si nécessaire |
| File watcher | Absent | Introduire un watcher minimal et borné au workspace, avec index mémoire incrémental |
| Fuzzy search | Absent | Implémenter un scorer local léger ou ajouter une dépendance justifiée par une mesure de latence |
| Playwright | Absent | Ne pas ajouter dans ce cycle, conformément au brief |
| Providers OpenRouter/Ollama/custom | Pas d’adaptateurs dédiés ; custom réutilise OpenAI pour completion | Introduire le listing via une abstraction de transport, sans modifier le kernel pour chaque provider |

Aucune divergence ci-dessus n’a été modifiée pendant l’audit.

## 10. Priorisation de mise en œuvre

En respectant l’ordre du brief et les risques observés :

1. Config Engine : retirer les defaults de modèles codés en dur et formaliser les overrides/session secrets.
2. Provider abstraction : listModels, cache TTL, providers/transport de listing et effort reasoning.
3. Permission Engine : scopes, deny-by-default, bornage des chemins/cwd et overrides de session.
4. Tool Engine : validation JSON Schema avant exécution et tests d’appels malformés.
5. Agent Kernel : AsyncIterable<AgentEvent>, streaming réel, cancel et checkpoints résilients.
6. Sessions : identité Git/chemin, état Git, provider check et confirmation de reprise.
7. UI : déplacer la composition runtime hors Ink et brancher le flux d’événements public.
8. File Context : index incrémental, watcher, fuzzy search et overlay @fichier.
9. Skills : métadonnées visibles, chargement à la demande et tests sans redémarrage.
10. Pré-analyse : parser déterministe, contexte structuré et mesure avec/sans pré-analyse.
11. Doctor : ping provider, permissions et diagnostics de shell réellement utilisable.

Chaque étape devra conserver un build/test vert et ajouter les tests correspondant aux critères d’acceptation avant de passer à la suivante.

## Conclusion d’audit

Sentinel dispose d’un socle modulaire buildable et de primitives utiles : providers de complétion, tools, SQLite, index structurel, mémoire, vérification et UI terminal. La parité fonctionnelle et les différenciateurs du brief ne sont cependant pas atteints. Le risque prioritaire est la sécurité des permissions, suivi par l’absence de découverte dynamique des modèles et par l’écart du contrat public du kernel. L’implémentation peut commencer après cet audit, en traitant d’abord la configuration, les providers et les permissions comme prévu.

