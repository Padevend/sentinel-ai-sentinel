# Sentinel — build, release GitHub, installation et usage

Ce guide décrit le parcours supporté pour compiler Sentinel, publier une release GitHub, installer le CLI sous Linux ou Windows et l'utiliser depuis n'importe quel répertoire de projet.

## 1. Pré-requis

Pour utiliser une release compilée :

- Node.js 20 ou supérieur ;
- Git, pour l'identification du projet et les opérations Git ;
- un fournisseur LLM configuré au premier lancement.

Pour compiler depuis les sources :

- Node.js 20 ou supérieur ;
- pnpm 9 ou supérieur, idéalement la version déclarée par `packageManager` ;
- les outils de compilation natifs de la plateforme si `better-sqlite3` ne fournit pas de binaire précompilé.

Activer pnpm avec Corepack :

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
```

Les clés API ne doivent jamais être ajoutées au dépôt ni aux secrets de GitHub Actions de build. Elles sont configurées localement par l'utilisateur et stockées par Sentinel dans son espace de configuration protégé.

## 2. Build local depuis les sources

Cloner le dépôt et installer exactement le lockfile :

```bash
git clone https://github.com/OWNER/REPO.git
cd REPO
pnpm install --frozen-lockfile
```

Valider le dépôt avant de produire un artefact :

```bash
pnpm test
pnpm typecheck
pnpm build
```

Créer le bundle CLI :

```bash
pnpm bundle
node apps/cli/dist/index.js --version
node apps/cli/dist/index.js doctor
node apps/cli/dist/index.js --self-test
```

`pnpm bundle` produit `dist/sentinel.mjs`. Le build workspace `apps/cli/dist/index.js` sert à vérifier localement le CLI avec la résolution pnpm. Le fichier `dist/sentinel.mjs` devient exécutable comme archive de distribution après l'étape de staging qui ajoute les dépendances runtime (`better-sqlite3`, Ink, React et leurs dépendances natives).

Pour lancer la version locale dans le projet courant :

```bash
node apps/cli/dist/index.js
```

## 3. Déployer une release via GitHub Actions

### 3.1 Configurer le dépôt

Le dépôt doit être poussé sur GitHub et le workflow doit être disponible dans `.github/workflows/release.yml`.

Les installateurs utilisent par défaut `sentinel-ai/sentinel`. Si le dépôt réel a un autre propriétaire ou nom, définir `SENTINEL_REPO` lors de l'installation ou remplacer cette valeur par défaut dans `distribution/install.sh` et `distribution/install.ps1` avant la première release.

Vérifier le remote local :

```bash
git remote -v
git remote add origin https://github.com/OWNER/REPO.git
```

Le workflow GitHub doit avoir la permission `contents: write` pour créer une release. Aucun secret de fournisseur LLM n'est nécessaire au workflow.

### 3.2 Publier une version

Depuis une branche propre :

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm bundle

git add .
git commit -m "release: v0.1.0"
git push origin master

git tag -a v0.1.0 -m "Sentinel v0.1.0"
git push origin v0.1.0
```

Tout tag correspondant à `v*` déclenche le workflow. Il :

1. installe les dépendances avec le lockfile ;
2. exécute la suite de tests ;
3. construit le bundle sur Linux, macOS et Windows ;
4. ajoute le wrapper de lancement et les dépendances runtime, dont le module natif SQLite ;
5. crée les archives ;
6. génère `SHA256SUMS` ;
7. publie une GitHub Release avec les notes automatiques.

Les assets attendus sont :

```text
sentinel-linux-x64.tar.gz
sentinel-darwin-arm64.tar.gz
sentinel-windows-x64.zip
SHA256SUMS
```

Le lancement manuel du workflow peut servir au diagnostic, mais la publication est conditionnée à un événement de tag `v*`. Après publication, vérifier l'onglet **Actions**, puis **Releases**, avant de diffuser l'URL d'installation.

## 4. Installation Linux via curl

L'installateur Linux télécharge l'archive GitHub correspondant à l'architecture, installe Sentinel dans `~/.sentinel/bin`, crée les répertoires runtime et ajoute ce dossier au profil shell.

Installation depuis le dépôt par défaut :

```bash
curl -fsSL https://raw.githubusercontent.com/sentinel-ai/sentinel/main/distribution/install.sh | sh
```

Installation depuis un dépôt différent :

```bash
export SENTINEL_REPO="OWNER/REPO"
curl -fsSL "https://raw.githubusercontent.com/${SENTINEL_REPO}/main/distribution/install.sh" | sh
```

Installer une version précise :

```bash
export SENTINEL_REPO="OWNER/REPO"
export SENTINEL_VERSION="0.1.0"
curl -fsSL "https://raw.githubusercontent.com/${SENTINEL_REPO}/main/distribution/install.sh" | sh
```

Après l'installation, ouvrir un nouveau terminal ou recharger le profil :

```bash
source ~/.bashrc       # Bash
source ~/.zshrc        # Zsh
sentinel --version
sentinel doctor
```

Pour un contrôle avant exécution, télécharger puis inspecter le script au lieu de le pipe directement vers le shell :

```bash
curl -fsSL "https://raw.githubusercontent.com/${SENTINEL_REPO}/main/distribution/install.sh" -o /tmp/sentinel-install.sh
less /tmp/sentinel-install.sh
sh /tmp/sentinel-install.sh
rm -f /tmp/sentinel-install.sh
```

## 5. Installation Windows via curl.exe

Utiliser `curl.exe` explicitement dans PowerShell afin de ne pas appeler l'alias PowerShell `curl` :

```powershell
$env:SENTINEL_REPO = "OWNER/REPO"
$env:SENTINEL_VERSION = "0.1.0" # optionnel ; supprimer pour la dernière release
$installer = Join-Path $env:TEMP "sentinel-install.ps1"
curl.exe -fsSL "https://raw.githubusercontent.com/$($env:SENTINEL_REPO)/main/distribution/install.ps1" -o $installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer
Remove-Item -Force $installer
```

Pour le dépôt par défaut, remplacer la première ligne d'environnement par :

```powershell
$env:SENTINEL_REPO = "sentinel-ai/sentinel"
```

L'installateur installe dans `%USERPROFILE%\.sentinel\bin`, ajoute ce dossier au PATH utilisateur et télécharge l'archive Windows. Fermer puis rouvrir PowerShell avant de vérifier :

```powershell
sentinel --version
sentinel doctor
```

Le script PowerShell direct reste possible, mais la procédure `curl.exe` ci-dessus permet d'inspecter le fichier téléchargé avant son exécution.

## 6. Utiliser Sentinel depuis n'importe quel répertoire

Sentinel est un CLI global. L'installation ne dépend pas du dossier depuis lequel la commande est appelée.

Se placer dans le projet à analyser, puis lancer la commande nue :

```bash
cd ~/src/my-project
sentinel
```

Sous Windows :

```powershell
Set-Location C:\src\my-project
sentinel
```

Sentinel utilise le répertoire courant pour :

- détecter le projet et son dépôt Git ;
- indexer les fichiers ;
- appliquer `.sentinel/settings.json` si ce fichier existe ;
- limiter les écritures et commandes au workspace autorisé.

Les données utilisateur restent séparées du projet :

```text
Linux/macOS : ~/.sentinel/
Windows     : %USERPROFILE%\.sentinel\
```

Depuis n'importe quel projet, les commandes de démarrage utiles sont :

```text
sentinel              # session interactive
sentinel --continue   # reprendre la session pertinente la plus récente
sentinel --resume     # choisir une session précédente
sentinel --resume ID  # reprendre une session précise
sentinel doctor       # diagnostiquer l'environnement
sentinel --self-test  # auto-test non destructif
```

Dans l'interface interactive :

```text
/model                # modèles réellement listés chez le provider
/reasoning            # effort auto/low/medium/high/max
/permissions          # permissions de session ou persistées globalement
/status               # projet, provider, modèle et Git
/clear                # vider l'historique de la session
/reset                # réinitialiser puis fermer la session
/exit                 # enregistrer et fermer
```

Au premier lancement, suivre l'assistant de configuration. Les providers et modèles sont ensuite découverts dynamiquement ; aucun identifiant de modèle ne doit être ajouté dans ce guide ou dans le code.

## 7. Vérification d'installation et dépannage

### `sentinel` n'est pas reconnu

Recharger le shell ou vérifier le PATH :

```bash
echo "$PATH" | tr ':' '\n' | grep '\.sentinel/bin'
```

Sous PowerShell :

```powershell
$env:Path -split ';' | Where-Object { $_ -like '*\.sentinel\bin*' }
```

### L'installateur répond 404

Le tag et le dépôt doivent correspondre exactement aux assets de la release :

```bash
export SENTINEL_REPO="OWNER/REPO"
export SENTINEL_VERSION="0.1.0"
```

Vérifier que `sentinel-linux-x64.tar.gz` ou `sentinel-windows-x64.zip` existe dans la GitHub Release correspondante.

### Node.js est trop ancien

```bash
node --version
```

Installer Node.js 20 ou supérieur, puis relancer l'installateur. Les releases Sentinel utilisent un bundle ESM Node.js (`.mjs`), et non un exécutable natif autonome.

### SQLite échoue au démarrage

Utiliser une archive issue d'une release GitHub publiée par le workflow courant. Elle contient les dépendances runtime et le module natif `better-sqlite3` adapté à l'OS et à l'architecture. Un bundle local `pnpm bundle` doit être exécuté depuis le checkout ayant ses dépendances installées.

### Clés provider

Ne jamais mettre une clé API dans une commande copiée dans un ticket, dans Git ou dans les logs CI. Utiliser l'assistant Sentinel, les variables d'environnement documentées ou le store de secrets local.
