-- Diagnoza structurată a sursei (A30): categoria eșecului, codul HTTP și
-- numărul de încercări se persistă separat de mesaj, fără chei sau corpuri
-- sensibile — pe bazele care au deja tabela creată fără coloană.
ALTER TABLE `source_cache` ADD COLUMN `error_diagnostic` text;
