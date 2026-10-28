STACK — Application pour Android (V5 épurée)
=============================================

Ce dossier est une PWA : elle s'installe depuis Chrome une fois publiée sur HTTPS.
Elle conserve le suivi de stack, les blindes/antes, les notes, les tournois,
les graphiques en jetons/BB, le zoom et le mode logarithmique.

METTRE EN LIGNE GRATUITEMENT (GitHub Pages)
1. Sur github.com, créer un dépôt PUBLIC nommé poker-stack-tracker.
2. Dans ce dépôt, choisir Add file > Upload files.
3. Envoyer TOUS les fichiers du ZIP, extraits à la racine du dépôt,
   avec le dossier icons/. Ne pas envoyer le ZIP tel quel.
   Fichiers : index.html, sw.js, manifest.webmanifest, .nojekyll et icons/.
4. Cliquer Commit changes.
5. Settings > Pages > Build and deployment > Source : Deploy from a branch.
   Branch : main ; Folder : /(root) ; Save.
6. Ouvrir https://VOTRE_PSEUDO.github.io/poker-stack-tracker/
   dans Chrome sur Android, connecté à Internet pour la première visite.
7. Menu ⋮ de Chrome > Ajouter à l'écran d'accueil > Installer.
   Si le bouton + Installer apparaît dans STACK, il peut aussi être utilisé.
8. Ouvrir l'app depuis son icône et tester une fois le mode avion.

RÉCUPÉRER LES ANCIENS TOURNOIS
1. Ouvrir l'ancienne application V5 dans le navigateur où les tournois existent.
2. Réglages > Sauvegarder : télécharger le JSON.
3. Ouvrir la nouvelle application depuis la vraie adresse GitHub Pages.
4. Réglages > Récupérer mes tournois (JSON) : choisir la sauvegarde.
5. Vérifier l'historique, puis conserver le JSON en lieu sûr.

IMPORTANT
- Les tournois restent sur le téléphone, dans le stockage du navigateur/PWA,
  PAS sur GitHub. Rien n'est synchronisé entre appareils.
- Garder toujours la même adresse GitHub Pages, navigateur et installation.
- Ne pas effacer les données de site / l'app sans exporter un JSON.
- GitHub Pages héberge le code, pas vos tournois et pas vos notes.
- Les données stockées par l'ancien fichier HTML ne sont pas transférées
  automatiquement vers la PWA : un import JSON est nécessaire.
- Après le premier chargement, l'application fonctionne normalement hors ligne.
