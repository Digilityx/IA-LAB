-- seed_ia_lab_uc_review.sql
-- IA Lab review data (March 2026). Run AFTER 000_ia_lab_initial.sql has been applied AND after the Airtable import.

-- 1. Outils de feedback, Backlog et Prio I Centraliser, notifier et prioriser
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'A finaliser si usage I a repasser au quarter si réel besoin',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%feedback%Backlog%Prio%Centraliser%';

-- 2. Outils de veille I actualités business
UPDATE ia_lab_use_cases SET
  category = 'PRODUCT',
  status = 'done',
  next_steps = 'Decliner le produit mapa en marque blanche',
  transfer_status = 'Oui'
WHERE title ILIKE '%veille%actualités business%';

-- 3. Outils de feedback, Backlog et Prio I Module de feedback Bubble
UPDATE ia_lab_use_cases SET
  category = 'PRODUCT',
  status = 'done',
  next_steps = '-',
  transfer_status = 'Oui'
WHERE title ILIKE '%feedback%Backlog%Prio%Module de feedback%';

-- 4. Base de connaissance I création d'une base onglet sur Stafftool
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'Pas d''utilisation aujourd''hui voir meme dérangeant la partie connaissance ==> à challenger au quarter produit (revoir et développer l''usage ou abandon)',
  transfer_status = 'Déjà transféré'
WHERE title ILIKE '%Base de connaissance%Stafftool%';

-- 5. Audit I auditer un compte Google Ads
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'Nouvel outils plus avancé en cours',
  transfer_status = 'Oui'
WHERE title ILIKE '%Audit%Google Ads%auditer%';

-- 6. Google Ads I Outil d'alerting slack
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'A challenger coté market sur l''usage ==> si utilisé est ce qu''il faut juste plus communiqué dessus ou développé un front ou des features',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%Google Ads%alerting%slack%';

-- 7. Automatisation de l'export des dépenses media
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'A challenger coté market sur l''usage ==> si utilisé est ce qu''il faut juste plus communiqué dessus ou développé un front ou des features',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%export des dépenses media%';

-- 8. Outil de veille I activités LinkedIn contacts 1er niveau
UPDATE ia_lab_use_cases SET
  category = 'IMPACT',
  status = 'done',
  next_steps = 'Dans le projet de Julie',
  transfer_status = NULL
WHERE title ILIKE '%veille%contacts de 1er niveau%';

-- 9. Mesure de la performance I Automatisation des analyse Performance Camp
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'A challenger coté market sur l''usage ==> si utilisé est ce qu''il faut juste plus communiqué dessus ou développé un front ou des features',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%Mesure de la performance%Performance Camp%';

-- 10. Outil SEO : scoring mots clés business par LLM
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = NULL,
  transfer_status = 'En cours de reprise'
WHERE title ILIKE '%SEO%scoring%mots clés%business%LLM%';

-- 11. Outil de génération d'articles à partir d'un mot clé
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'Front (comptes etc...) à créer',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%génération d''articles%mot clé%';

-- 12. Enrichissement de base I identifier et enrichir la base avec profils linkedin
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'Existe en manuel a venir sur le projet A+A',
  transfer_status = 'En cours de reprise'
WHERE title ILIKE '%Enrichissement%profils linkedin%email%téléphone%';

-- 13. Adaptation du Airtable Audit pour l'écoconception
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'A challenger coté UX sur l''usage ==> si utilisé est ce qu''il faut juste plus communiqué dessus ou développé un front ou des features',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%Airtable Audit%écoconception%';

-- 14. Recrutement : automatiser l'analyse des CVs
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'Reposer la question du legal ou non',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%Recrutement%analyse des CVs%';

-- 15. Outil de monitoring LLM
UPDATE ia_lab_use_cases SET
  category = 'PRODUCT',
  status = 'done',
  next_steps = 'Front (comptes etc...) à créer et optimiser le pipeline (surconso de token)',
  transfer_status = 'Oui'
WHERE title ILIKE '%monitoring LLM%prompts tapés%';

-- 16. Scoring de base I scorer et catégoriser les cibles
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'A challenger coté market sur l''usage ==> si utilisé est ce qu''il faut juste plus communiqué dessus ou développé un front ou des features',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%Scoring de base%scorer%catégoriser%';

-- 17. Enrichissement de base I enrichir la base avec les noms de domaine
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'A challenger coté market sur l''usage ==> si utilisé est ce qu''il faut juste plus communiqué dessus ou développé un front ou des features',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%Enrichissement%noms de domaine%';

-- 18. Enrichissement de base I post Linkedin postés sur un sujet
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'A challenger coté market sur l''usage ==> si utilisé est ce qu''il faut juste plus communiqué dessus ou développé un front ou des features',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%Enrichissement%post Linkedin%sujet particulier%';

-- 19. Audit I Automatisation des audit flash SEO
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'A challenger coté market sur l''usage ==> aujourd''hui output limité car pas accès à l''API Semrush car trop cher',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%Audit%audit flash SEO%';

-- 20. Création d'un outil de pilotage des initiatives / roadmap projet
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'abandon car pas d''usage',
  transfer_status = 'Non'
WHERE title ILIKE '%pilotage des initiatives%roadmap%';

-- 21. Outil de veille pour les campagnes SEA & SMA
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'A challenger coté market sur l''usage ==> Déja repris par Enzo pour Mapa ==> next step créer une interface marque blanche. Quid du coup de l''outil pour l''analyse des pubs en fonction du meta ID',
  transfer_status = 'Oui'
WHERE title ILIKE '%veille%campagnes SEA%SMA%';

-- 22. Enrichissement de base I enrichir une base avec les profils LinkedIn, Facebook, Twitter
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'A challenger coté market sur l''usage ==> si utilisé est ce qu''il faut juste plus communiqué dessus ou développé un front ou des features',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%Enrichissement%nom%prénom%LinkedIn%Facebook%Twitter%';

-- 23. Se brancher avec le MCP Server de GA
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'Intégré au projet Ads/analytics de manu',
  transfer_status = 'En cours de reprise'
WHERE title ILIKE '%MCP Server%GA%';

-- 24. Usine à création de contenu IA basé sur Airtable (catégorie "A revalider" => on ne touche pas)
UPDATE ia_lab_use_cases SET
  status = 'done',
  next_steps = 'Front (comptes etc...) à créer',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%Usine%création de contenu%Airtable%';

-- 25. Outil de création de message automatique pour Cold Emailing
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'A challenger coté market sur l''usage ==> si utilisé est ce qu''il faut juste plus communiqué dessus ou développé un front ou des features',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%Cold Emailing%message automatique%';

-- 26. Outil de génération de suggestion de maillage interne SEO
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'Front (comptes etc...) à créer',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%maillage interne%SEO%';

-- 27. Note de frais I automatiser la création des notes de frais
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'Abandon ou conservé : Deja créé dans ST mais pas en prod utilisé dans le process actuel.',
  transfer_status = 'Déjà transféré'
WHERE title ILIKE '%Note de frais%automatiser%';

-- 28. Newsletter de veille automatique
UPDATE ia_lab_use_cases SET
  category = 'IMPACT',
  status = 'done',
  next_steps = 'aujourd''hui c''est un IMPACT qui a été vendu a un client : Souhaite-on le revendre a d''autre client et si oui, est-il productisable',
  transfer_status = 'Oui si possible mais pas nécessaire'
WHERE title ILIKE '%Newsletter%veille automatique%';

-- 29. Personal planner - Booker des créneaux libre
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'Utilisation individuelle (Enzo) aujourd''hui ==> à challenger au quarter produit (revoir et développer l''usage ou abandon) Front (comptes etc...) à créer',
  transfer_status = 'Oui si confirmé'
WHERE title ILIKE '%Personal planner%créneaux%';

-- 30. Outils d'optimisation SEO des pages de contenus E-commerce
UPDATE ia_lab_use_cases SET
  category = 'IMPACT',
  status = 'done',
  next_steps = 'Veut-on le transformer en LAB si oui Front (comptes etc...) à créer',
  transfer_status = 'Oui'
WHERE title ILIKE '%optimisation SEO%E-commerce%';

-- 31. Interface de gestion des EAD onglet objectifs et Career path
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'Intérêt et Usage déja validé A valider et transférer',
  transfer_status = 'Oui'
WHERE title ILIKE '%EAD%objectifs%Career path%';

-- 32. Outils d'audit automatique GEO - scraping
UPDATE ia_lab_use_cases SET
  category = 'LAB',
  status = 'done',
  next_steps = 'Front (comptes etc...) à créer',
  transfer_status = 'Oui'
WHERE title ILIKE '%audit automatique GEO%scraping%';

-- 33. App gamifiée de veille & curations
UPDATE ia_lab_use_cases SET
  category = 'PRODUCT',
  status = 'done',
  next_steps = 'Decliner le produit en marque blanche et valider la publication sur les stores',
  transfer_status = 'Oui'
WHERE title ILIKE '%gamifiée%veille%curation%';
