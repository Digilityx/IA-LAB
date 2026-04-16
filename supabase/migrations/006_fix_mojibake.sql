-- 006_fix_mojibake.sql
-- Corrige le double-encodage UTF-8 (mojibake) dans les champs texte.
-- Symptôme : "Clément" stocké comme "ClÃ©ment", "François" comme "FranÃ§ois", etc.
-- Cause : lors d'un import passé, des octets UTF-8 ont été décodés comme Latin-1
--         puis re-encodés en UTF-8, ce qui donne 2 caractères par caractère accentué.
-- Fix   : pour chaque ligne contenant 'Ã' ou 'Â', re-encoder la chaîne en Latin-1
--         (on récupère les octets UTF-8 originels) puis décoder en UTF-8.
-- Idempotent : la clause WHERE '~' '[ÃÂ]' ne matche plus après le fix.

-- Optionnel : exécuter d'abord ce SELECT pour prévisualiser les lignes qui seront modifiées
-- SELECT id, full_name AS before, convert_from(convert_to(full_name, 'LATIN1'), 'UTF8') AS after
-- FROM profiles WHERE full_name ~ '[ÃÂ]';

BEGIN;

-- profiles
UPDATE profiles
SET full_name = convert_from(convert_to(full_name, 'LATIN1'), 'UTF8')
WHERE full_name ~ '[ÃÂ]';

UPDATE profiles
SET department = convert_from(convert_to(department, 'LATIN1'), 'UTF8')
WHERE department ~ '[ÃÂ]';

-- use_cases
UPDATE use_cases
SET title = convert_from(convert_to(title, 'LATIN1'), 'UTF8')
WHERE title ~ '[ÃÂ]';

UPDATE use_cases
SET description = convert_from(convert_to(description, 'LATIN1'), 'UTF8')
WHERE description ~ '[ÃÂ]';

UPDATE use_cases
SET short_description = convert_from(convert_to(short_description, 'LATIN1'), 'UTF8')
WHERE short_description ~ '[ÃÂ]';

UPDATE use_cases
SET documentation = convert_from(convert_to(documentation, 'LATIN1'), 'UTF8')
WHERE documentation ~ '[ÃÂ]';

UPDATE use_cases
SET next_steps = convert_from(convert_to(next_steps, 'LATIN1'), 'UTF8')
WHERE next_steps ~ '[ÃÂ]';

UPDATE use_cases
SET transfer_status = convert_from(convert_to(transfer_status, 'LATIN1'), 'UTF8')
WHERE transfer_status ~ '[ÃÂ]';

UPDATE use_cases
SET deliverable_type = convert_from(convert_to(deliverable_type, 'LATIN1'), 'UTF8')
WHERE deliverable_type ~ '[ÃÂ]';

UPDATE use_cases
SET usage_type = convert_from(convert_to(usage_type, 'LATIN1'), 'UTF8')
WHERE usage_type ~ '[ÃÂ]';

UPDATE use_cases
SET tools = convert_from(convert_to(tools, 'LATIN1'), 'UTF8')
WHERE tools ~ '[ÃÂ]';

UPDATE use_cases
SET target_users = convert_from(convert_to(target_users, 'LATIN1'), 'UTF8')
WHERE target_users ~ '[ÃÂ]';

-- sprints
UPDATE sprints
SET name = convert_from(convert_to(name, 'LATIN1'), 'UTF8')
WHERE name ~ '[ÃÂ]';

-- tags
UPDATE tags
SET name = convert_from(convert_to(name, 'LATIN1'), 'UTF8')
WHERE name ~ '[ÃÂ]';

COMMIT;
