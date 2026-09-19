# Sentinel - rapport post-audit

## Complément UX et interaction (2026-09-18)

- `/permissions` ouvre désormais un panneau clavier réel : flèches gauche/droite pour changer le niveau d'un outil, `Entrée` pour la session, `G` pour enregistrer globalement.
- `/reasoning` et ses alias `/effort` / `/think` ouvrent un sélecteur `auto`, `low`, `medium`, `high`, `max`; le kernel applique le choix aux tours suivants sans redémarrage.
- `/reset` efface la configuration, clôt la session avec le statut `cancelled`, la persiste puis ferme l'interface. `/exit`, `/quit`, `/q` et `/ecit` clôturent proprement la session.
- Palette CLI harmonisée autour du graphite, du texte clair et d'un accent vert; `/status` affiche maintenant provider et modèle actifs.
- Tests ajoutés pour les nouvelles actions slash et les changements de policy runtime.

## Documentation et distribution (2026-09-18)

- Guide opérationnel ajouté dans `docs/BUILD-DEPLOY-INSTALL.md` : build, tag GitHub, release, installation Linux/Windows via curl et usage global.
- `BUILD.md` devient un point d'entrée court vers ce guide.
- Bundle de production stabilisé en ESM `.mjs`; le workflow package les dépendances runtime nécessaires, vérifie les SHA-256 et publie les archives attendues par les installateurs.
- Vérifications : `pnpm bundle` réussi et smoke test `node dist/sentinel.mjs --version` réussi avec les dépendances runtime disponibles.

`AUDIT.md` conserve l’état initial exigé avant implémentation. Ce document décrit l’état mesuré après les étapes de complétion.

## Réalisé

- Configuration globale/projet avec `modelId`, `reasoningEffort` et secrets chiffrés séparément dans `~/sentinel/config/secrets.json`.
- Listing runtime des modèles Anthropic, OpenAI-compatible, Google, OpenRouter, Ollama et custom avec cache TTL ; aucun catalogue de modèles de production.
- Permission engine par scopes shell/filesystem/network, règles allow/ask/deny, refus par défaut, bornage des chemins canoniques et validation des tools.
- Kernel streaming avec `AgentRun` async iterable/awaitable, annulation, événements publics, persistance intermédiaire et effort de raisonnement natif/orchestré.
- Reprise SQLite avec vérification projet/Git/provider et confirmation interactive des sessions interrompues.
- UI Ink branchée au streaming, indicateur d’effort, sélecteur dynamique et autocomplete `@fichier`.
- Skills Markdown globales/projet exposant les descriptions par défaut et chargeant le contenu complet à la demande.
- Structural Twin alimenté par l’AST TypeScript, pré-analyse avant appel modèle, mesure `exploratoryReadsAvoided` et budget borné.
- `sentinel doctor` enrichi avec probe shell, écriture des répertoires runtime et disponibilité du provider.

## Vérifications exécutées

| Commande | Résultat |
| --- | --- |
| `pnpm test` | 16 fichiers, 44 tests passés |
| `pnpm typecheck` | Succès sur tous les packages et la CLI |
| `pnpm build` | Succès sur tous les packages et la CLI |
| `git diff --check` | Succès |

## Écarts résiduels connus

- La composition de runtime reste dans le launcher CLI, même si les composants Ink n’y prennent pas les décisions de permission/provider.
- Les systèmes sans watcher récursif natif utilisent `refreshIndex()` comme fallback explicite.
- Les probes internes de `doctor` et la validation Git sont des diagnostics contrôlés hors boucle de tools agentique.
- La capacité de reasoning par modèle reste approximée lorsque l’endpoint provider ne publie pas ce champ.
- Playwright reste hors scope conformément au brief.
