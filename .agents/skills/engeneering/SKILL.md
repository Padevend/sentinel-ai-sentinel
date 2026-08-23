---
name: sentinel-engineering-guidelines
description: Règles d'ingénierie, d'architecture et de qualité permanentes du projet Sentinel (agent de développement logiciel open source). À consulter systématiquement dès qu'une tâche touche à la conception ou à l'implémentation de Sentinel — nouvelle fonctionnalité, nouveau module ou outil, refactoring, revue de code, choix d'architecture, gestion des erreurs, sécurité (filesystem/shell/Git), tests, conventions de nommage, ou toute décision structurante du code. Doit être appliquée même si l'utilisateur ne cite pas explicitement ces règles — elles priment sauf instruction ultérieure explicite qui les remplace.
---

# Sentinel — Engineering & Architecture Guidelines

Ce skill encode les règles d'ingénierie permanentes de Sentinel, un agent de développement logiciel open source. Elles s'appliquent à toute tâche de conception, d'implémentation, de revue ou de refactoring sur le projet — pas seulement quand elles sont explicitement mentionnées.

## Comment utiliser ce skill

Avant d'écrire ou de modifier du code pour Sentinel :
1. Identifier à quelle(s) section(s) ci-dessous la tâche se rattache (architecture, types, gestion d'erreurs, sécurité, tests, etc.).
2. Vérifier que la solution proposée respecte les principes correspondants avant de produire le code.
3. En cas de tension entre deux principes, trancher avec la hiérarchie de la Règle finale (section 15) : Correctness > Safety > Maintainability > Clarity > Performance > Cleverness.
4. Ne jamais introduire de complexité (microservices, event-sourcing systématique, abstraction prématurée, etc.) qui ne résout pas un problème réel de la tâche en cours (voir Architecture progressive / YAGNI / KISS).

---

## 1. Mission du projet

Sentinel doit comprendre une application comme un **système fonctionnel complet**, pas une simple collection de fichiers. Vision cible du flux à représenter :

```text
Utilisateur → Interaction → Action → Frontend → API → Backend
→ Validation → Logique métier → Persistance → Effets secondaires
→ Réponse → Frontend → État final utilisateur
```

L'architecture doit rester assez modulaire pour accueillir progressivement : Project Intelligence, Structural Twin, Behavioral Twin, Runtime Explorer, Workflow Graph, Memory, Multi-Agent orchestration, Model routing, Verification Engine.

## 2. Principe architectural fondamental

Ne jamais coupler directement interface, agent, outils, modèle et persistance. La direction des dépendances reste contrôlée :

```text
UI → Application/Session Layer → Agent Kernel
  ├── Context Engine
  ├── Tool Engine
  ├── Memory Engine
  ├── Verification Engine
  → Domain Services (Project Intelligence, Model Abstraction, Storage, Git)
```

Les détails d'implémentation dépendent des abstractions, pas l'inverse, quand cela apporte une vraie valeur.

## 3. SOLID (sans dogmatisme)

- **Single Responsibility** : une classe/module = une responsabilité claire. Éviter un `AgentManager` qui appelle le LLM, modifie des fichiers, gère Git, affiche le terminal et persiste la mémoire. Préférer `AgentKernel`, `ModelProvider`, `ToolRegistry`, `ContextEngine`, `MemoryStore`, `PermissionManager`.
- **Open/Closed** : le système doit accueillir `NewModelProvider`, `NewTool`, `NewParser`, `NewStorageBackend`, `NewRuntimeExplorer` sans modifier de grandes portions du cœur.
- **Liskov Substitution** : toute implémentation d'une abstraction respecte son contrat réel — ne pas créer de fausses abstractions juste pour cocher SOLID.
- **Interface Segregation** : plusieurs petites interfaces cohérentes plutôt qu'une interface universelle géante.
- **Dependency Inversion** : le cœur ne dépend pas directement d'OpenAI SDK, Anthropic SDK, SQLite, Ink, Node filesystem au niveau métier — créer des abstractions quand le découplage est réellement utile.

## 4. Clean Architecture pragmatique

Pas une religion. Principe à retenir : les règles métier importantes restent indépendantes des détails externes autant que raisonnable.

```text
packages/
├── core/
├── domain/
├── application/
├── infrastructure/
└── ui/
```

Éviter les chaînes de dépendances absurdes et les imports circulaires.

## 5. Modularité

Chaque domaine (agent, context, tools, models, memory, project, parser, storage, git, permissions, verification, ui) a des frontières claires et une API publique minimale.

Préférer `import { AgentKernel } from "@sentinel/agent"` à `import { InternalPlanner } from "../../agent/src/internal/planner"`.

## 6. Éviter le God Object

Interdiction pratique d'un objet central de plusieurs milliers de lignes. `AgentKernel` orchestre ; il ne doit pas devenir lui-même planner + filesystem + git + LLM + memory + database + UI + parser + security.

## 7. Composition plutôt que complexité

Préférer `AgentKernel(ContextEngine, ToolRegistry, ModelProvider, Memory, PermissionManager)` à une chaîne d'héritage. Privilégier la composition.

## 8. Types forts (TypeScript strict)

Interdits : `any` sans justification, `as any` pour contourner le compilateur, types génériques trop vagues, objets métier non typés. Préférer des types sémantiques (`ToolCallId`, `ToolCall { id, toolName, input: unknown }`). Les frontières entre modules doivent être fortement typées.

## 9. Validation des données

Toute donnée externe (LLM, filesystem, JSON, configuration, environnement, subprocess, réseau, utilisateur) est potentiellement invalide → validation explicite avant usage :

```text
External input → Validation → Typed domain object
```

Ne jamais faire confiance à une sortie LLM simplement parce qu'elle a été demandée en JSON.

## 10. Le LLM n'est jamais une source de vérité absolue

Le modèle est une source de décision probabiliste, jamais une autorité factuelle. Vérifier ses affirmations via filesystem, AST, Git, tests, compiler, runtime, logs, API traces plutôt que de les accepter telles quelles.

## 11. Distinguer hypothèse, observation et fait

Ne jamais mélanger :
- **Observation** : `POST /api/events observed during runtime.`
- **Déduction** : `This request probably creates an event.`
- **Fait confirmé** : `POST /api/events calls EventService.create()`

Prévoir un niveau de confiance :

```ts
interface KnowledgeAssertion {
  statement: string;
  confidence: number;
  sources: SourceReference[];
  status: "observed" | "inferred" | "verified";
}
```

Règle fondamentale pour le futur Behavioral Twin.

## 12. Événements lorsque pertinent

Utiliser des événements (`ToolStarted`, `ToolCompleted`, `FileChanged`, `TestStarted`, `TestCompleted`, `ModelRequestStarted`, `ModelRequestCompleted`, `WorkflowDiscovered`) seulement quand cela améliore réellement le découplage — pas pour « faire moderne ».

## 13. Async first & 14. Cancellation

LLM, filesystem important, Git, subprocess, tests, indexing, parsing, runtime exploration sont potentiellement longs → les abstractions supportent cancellation, timeout, retry, progress, errors.

Toute opération agentique longue doit pouvoir être interrompue proprement :

```text
Ctrl+C → Cancel current operation → Cancel tool → Cancel subprocess
→ Cancel pending model request → Return to prompt
```

Ne jamais laisser des processus enfants tourner silencieusement après une interruption.

## 15. Error handling

Éviter `throw new Error("Something went wrong")` quand une info utile peut être fournie. Utiliser des catégories : `ModelError`, `ToolError`, `PermissionError`, `ParseError`, `StorageError`, `GitError`, `ProcessError`, `ConfigurationError`. Une erreur doit permettre de déterminer si elle est récupérable, réessayable, due à l'utilisateur, due à l'environnement, ou critique.

## 16. Retry intelligent

Ne jamais appliquer un `retry x5` automatique partout. Distinguer :
- Retry pertinent : erreur réseau temporaire, rate limit, échec subprocess transitoire.
- Retry inutile : TypeScript invalide, mauvaise commande, fichier manquant, permission refusée.

Backoff exponentiel pour les appels modèle si besoin.

## 17. Concurrency

Concurrence explicite. Lectures parallèles OK ; jamais deux écritures simultanées sur le même fichier. La sécurité des modifications prime sur la vitesse.

## 18. Filesystem safety

Toujours résoudre les chemins, détecter les chemins relatifs, empêcher les traversées de répertoire involontaires (`../../`), vérifier les symlinks, respecter les permissions.

## 19. Shell safety

Distinguer command requested → validated → authorized → executed → result. Prévoir timeout, exit code, stdout, stderr, cancellation, environnement contrôlé, politique de permission. Ne jamais donner au LLM un accès shell illimité pour simplifier l'implémentation.

## 20. Git safety

Avant modification importante : `git status` / `git diff` pour identifier l'état préexistant. Ne jamais exécuter automatiquement `git reset --hard` ou `git clean -fd` sans autorisation explicite. Toujours distinguer User changes / Agent changes / Unknown changes.

## 21. Immutabilité lorsque pertinente

Éviter les mutations globales cachées, surtout pour agent state, session state, context, tool result, memory. Préférer des transformations explicites et prévisibles.

## 22. État de l'agent

État explicite via une union de type plutôt qu'une multitude de booléens incohérents :

```ts
type AgentState =
  | "idle" | "planning" | "executing"
  | "waiting_for_confirmation" | "verifying"
  | "completed" | "failed" | "cancelled";
```

## 23–24. Tool Design & Tool results

Chaque outil a : Name, Description, Input schema, Permissions, Execution, Result schema — et fait une seule chose clairement définie (éviter un `superTool()` qui lit, écrit, lance Git et lance des tests). Préférer des outils composables.

Résultats structurés, pas de logs bruts injectés aveuglément :

```ts
interface ToolResult {
  success: boolean;
  output: string;
  data?: unknown;
  metadata?: ToolMetadata;
  error?: ToolError;
}
```

## 25. Context engineering

Le contexte du modèle est une ressource critique : privilégier « relevant context » sur « all context ». Le Context Engine sélectionne, résume, déduplique, priorise, tronque. Chaque élément de contexte connaît idéalement source, relevance, size, timestamp, confidence.

## 26. Pas de RAG partout

Choisir le mécanisme adapté :
- **Recherche textuelle** : identifiant exact, route, symbole, message d'erreur.
- **AST / graph** : imports, calls, dependencies, relations.
- **Semantic search** : explication conceptuelle, documentation, intention en langage naturel.

Le moteur peut combiner ces méthodes.

## 27. Parser first, LLM second

Quand une information est obtenable de manière déterministe (AST/search, dependency analysis), l'obtenir ainsi plutôt que de demander une estimation au LLM. Le LLM intervient là où l'analyse déterministe atteint ses limites.

## 28. Architecture progressive & 29. Local-first

Ne pas implémenter prématurément graph database distribuée, microservices, Kafka, Kubernetes, cloud obligatoire, multi-agent massif. Le MVP fonctionne localement avec une architecture simple ; la complexité n'apparaît que pour résoudre un problème réel.

Par défaut : données du projet, index, mémoire et configuration restent locaux. Les appels externes aux modèles doivent être explicitement contrôlables. L'architecture ne doit pas imposer un backend cloud futur.

## 30. Privacy by design

Ne jamais envoyer automatiquement `.env`, secrets, clés privées, credentials, tokens, certificats. Prévoir un filtrage configurable (`.env`, `.env.*`, `*.pem`, `*.key`, `credentials.*`, `service-account*.json`, etc.).

## 31. Observabilité

Journaliser de façon structurée (timestamp, session, operation, component, duration, status, error, model, tool) sans exposer secrets ou contenu sensible.

## 32. Performance

Pas d'optimisation prématurée, mais éviter les erreurs évidentes : indexation incrémentale, cache, lecture ciblée, parallélisation sûre, streaming, lazy loading. Ne jamais analyser tout le projet à chaque question.

## 33–35. Tests

Tester surtout les comportements critiques, pas uniquement viser la couverture.
- **Unit** : tool registry, permissions, context selection, project detection, parser, storage, model adapters.
- **Integration** : agent+filesystem, agent+shell, agent+Git, agent+model.
- **E2E** : vrais scénarios utilisateur.

Fixtures de test petites et déterministes (`fixtures/simple-node/`, `react-app/`, `fullstack-app/`, `broken-app/`, `git-dirty-app/`, `security-test-app/`). Les tests du cœur évitent de dépendre d'un LLM distant réel : mock provider, réponses déterministes, fixtures fixes ; les tests LLM réels sont séparés.

## 36. Documentation

Expliquer le rôle, les responsabilités, les dépendances, l'API publique et les invariants de chaque module important — le **pourquoi**, pas seulement le **quoi**. Préférer « The ContextEngine prevents the full repository from being injected into the model context. It combines structural and semantic signals to select only information relevant to the current task. » à « ContextEngine selects context. »

## 37–38. Naming & pas de dossier utils

Noms explicites (`PermissionManager`, `ContextSelector`, `ToolRegistry`, `ProjectIndexer`, `ModelProvider`) plutôt que `Manager`/`Helper`/`Utils`/`Service`/`Processor`/`Handler` génériques. Pas de gros dossier `utils/` fourre-tout — créer des modules sémantiques (`path/`, `git/`, `formatting/`, `validation/`, `logging/`).

## 39–41. Duplication, YAGNI, KISS

Extraire une abstraction seulement quand plusieurs composants partagent une logique métier importante — pas pour deux lignes identiques. « Duplication temporaire contrôlée > abstraction prématurée incorrecte. » Ne pas construire pour un besoin hypothétique futur (YAGNI). Entre deux architectures qui résolvent correctement le problème, choisir la plus simple (KISS).

## 42. Separation of Concerns

Séparer clairement UI, agent logic, domain logic, infrastructure, persistance, model integration, tool execution. Un changement d'interface terminal ne doit pas toucher l'orchestrateur ; un changement de fournisseur LLM ne doit pas toucher la logique métier ; un changement de stockage ne doit pas toucher l'agent.

## 43. Abstractions à coût acceptable

Une abstraction doit résoudre un problème réel (interchangeabilité, testabilité, découplage, extension, sécurité) — pas exister par principe pour chaque classe.

## 44–45. Design for failure & Human in the loop

Toujours supposer que le LLM peut se tromper, le réseau tomber, le processus échouer, le fichier être modifié en parallèle, Git être dans un état inattendu, le test être flaky, l'utilisateur interrompre l'opération — Sentinel doit échouer proprement.

L'autonomie n'exclut pas le contrôle : plan → explain → ask confirmation → execute → verify. Pour les opérations sensibles, l'utilisateur reste l'autorité finale.

## 46. Transparence de l'agent

Ne pas exposer les chaînes de raisonnement internes, mais expliquer les actions observables (fichiers trouvés/modifiés, résultat de vérification) de façon utile sans révéler de données internes inutiles.

## 47–48. Reversibility & séparation plan/exécution

Préférer des opérations réversibles (patches, Git diff, snapshots, transactions) et un cycle « small change → verify → next change » plutôt que « massive change → hope ». Même si le modèle fait les deux, l'architecture distingue Plan / Execution / Verification, avec un plan inspectable avant exécution.

## 49. Verification-first

Toute modification importante est suivie d'une vérification objective, par priorité : Compiler → Tests → Lint → Typecheck → Runtime, avant de se contenter d'une affirmation du modèle du type « It should work. »

## 50–51. Préparer le Behavioral Twin & vérité comportementale

Les données pertinentes doivent pouvoir accueillir plus tard Entity/Relation/Workflow/Action/Observation/Source/Confidence — sans coder le Behavioral Twin maintenant, mais sans construire une architecture qui le rendrait impossible.

En cas de contradiction entre « Code says X » et « Runtime does Y », conserver la contradiction au lieu de trancher arbitrairement (ex. : Code infers `POST /api/events`, Runtime observe `POST /api/events/v2` → enregistrer les deux, pas fusionner).

## 52. API et contrats internes

Types sémantiques explicites entre modules plutôt que `Record<string, unknown>` partout (ex. `ProjectFile`, `ProjectSymbol`, `ContextItem`).

## 53–54. Configuration & Compatibility

Configuration hiérarchisée : Defaults → User config → Project config → Session overrides, secrets séparés de la config normale. Pour une API publique : documenter les changements, éviter les breaking changes arbitraires, conserver une compatibilité raisonnable (contrats publics open source difficiles à changer).

## 55–56. Dependency management & supply chain

Avant d'ajouter une dépendance : vérifier maintenance, licence, taille, sécurité, compatibilité Node, qualité, nécessité réelle — ne pas l'ajouter pour économiser 30 lignes. Surveiller dépendances mal maintenues, scripts postinstall, packages suspects, secrets dans les logs. Lockfile obligatoire.

## 57–58. Git workflow & code review interne

Commits atomiques et cohérents plutôt que gros commits mélangés ; pas de commit automatique dans le MVP sauf demande explicite. Avant de considérer une partie terminée, vérifier : responsabilité claire, dépendances maîtrisées, types corrects, tests, gestion d'erreurs, sécurité, performance raisonnable, documentation nécessaire.

## 59. Definition of Done

Une tâche est terminée quand Implementation + Tests + Verification + Error handling + Documentation (si pertinent) sont satisfaits — pas simplement quand « code compiles ».

## 60. Règle finale (hiérarchie de priorité)

```text
Correctness > Safety > Maintainability > Clarity > Performance > Cleverness
```

Ne jamais sacrifier fiabilité et maintenabilité pour une architecture impressionnante. Le code reste lisible, testable, modulaire, observable, sécurisé, extensible, pragmatique — Sentinel est construit pour être maintenu plusieurs années.

**Principe directeur** : *Build the simplest architecture that can support the next level of Sentinel's intelligence.* Ne jamais confondre sophistication de l'agent et complexité inutile du logiciel.