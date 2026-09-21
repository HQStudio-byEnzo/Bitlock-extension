# QVault — Extension Chrome

L’extension QVault permet de rechercher, déchiffrer, copier, remplir et
enregistrer des identifiants depuis votre coffre-fort QVault.

## Fonctions

- appairage par code à 6 chiffres (production ou instance locale) ;
- déverrouillage avec le mot de passe maître, conservé uniquement en mémoire ;
- affichage prioritaire des comptes correspondant au site actif ;
- remplissage du username et du mot de passe ;
- capture après une action explicite de soumission ;
- validation avant enregistrement d’un identifiant détecté ;
- chiffrement AES-256-GCM (PBKDF2-SHA256, 600 000 itérations) côté extension ;
- génération de mots de passe forts ;
- recherche locale dans les éléments déjà déchiffrés.

## Prérequis

1. Avoir un compte QVault (par défaut `https://qvault.hqmerchant.xyz`, ou votre
   instance locale sur `http://localhost:3000`).
2. Se connecter à QVault.
3. Ouvrir les paramètres QVault et cliquer sur **Associer avec un code**.
4. Saisir le code à 6 chiffres dans le popup de l’extension.

Le code est valable quelques minutes et à usage unique. La connexion repose
ensuite sur un jeton d’extension révocable, visible dans la section « Avancé »
des paramètres QVault.

## Installation

1. Ouvrir `chrome://extensions/`.
2. Activer le mode développeur.
3. Choisir **Charger l’extension non empaquetée**.
4. Sélectionner ce dossier (`Bitlock-extension`).
5. Ouvrir le popup QVault, choisir le serveur, puis coller le jeton.

Après une modification du code, utiliser le bouton **Actualiser** de la carte
de l’extension dans `chrome://extensions/`.

## Sécurité

- Le mot de passe maître n’est jamais écrit dans `chrome.storage`.
- Une credential capturée reste en mémoire dans le service worker pendant deux
  minutes au maximum.
- Le serveur reçoit uniquement un payload chiffré avec AES-256-GCM.
- Le jeton d’extension donne accès uniquement aux routes dédiées aux mots de
  passe chiffrés.
- Le remplissage est déclenché par un clic explicite dans le popup.
- L’extension ne demande ni la permission `cookies`, ni la permission `tabs`.

Le jeton est stocké dans l’espace privé de l’extension afin de conserver la
connexion après le redémarrage du navigateur. Verrouiller le coffre efface
immédiatement les données déchiffrées de la mémoire du popup.

## Compatibilité de chiffrement

L’extension lit le format de payload courant de QVault
(`v2:600000:<salt>:<ciphertext>`) et, en lecture seule, l’ancien format
(`<salt>:<ciphertext>`, 100 000 itérations). Les nouveaux identifiants sont
toujours écrits au format courant.

## Validation

```powershell
bun run test
```

Le validateur contrôle la syntaxe JavaScript, le manifeste, les permissions,
les hôtes autorisés, les identifiants DOM, l’absence d’ancienne marque ou URL,
le facteur PBKDF2, le marqueur maître gelé et les erreurs d’encodage.

## Structure

```text
manifest.json
icons/
scripts/validate.mjs
src/background.js
src/content/autosave.js
src/popup/popup.html
src/popup/popup.js
src/popup/popup.css
src/popup/tokens.css
```
