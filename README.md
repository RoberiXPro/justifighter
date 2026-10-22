# WP Integrator V5.21 — GitHub Pages

Application statique HTML/CSS/JavaScript, issue de la V5.20 **candidate non validée**.

## Publication
1. Décompresser le ZIP.
2. Créer un dépôt GitHub et téléverser **le contenu de ce dossier** à la racine du dépôt (index.html, css/, js/, data/, README.md).
3. Dans Settings > Pages, choisir Deploy from a branch, branche `main`, répertoire `/(root)`.
4. Ouvrir `https://VOTRE-IDENTIFIANT.github.io/NOM-DU-DEPOT/`.

Les chemins des ressources sont relatifs et conviennent à GitHub Pages.

## Attention avant publication
Les fichiers JavaScript de `data/` embarquent les bases de maillage FR/BE/UK : elles seront consultables publiquement, même si le dépôt est privé mais le site publié. Ne publiez que si vous êtes autorisé à les exposer.

Le stockage navigateur (localStorage) est propre au domaine : les données stockées sur l'ancienne adresse ou via un fichier local ne seront pas transférées automatiquement.

Aucune modification fonctionnelle n'a été faite à l'application. La V5.20 reste une candidate non validée : vérifier les fonctions sur l'URL GitHub Pages avant utilisation en production.
