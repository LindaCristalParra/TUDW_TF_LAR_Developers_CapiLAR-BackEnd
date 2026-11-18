-- No line is now '' instead of NULL, so the unique index (razonSocial, linea) also stops a
-- repeated brand without a line (MySQL lets NULLs repeat). The API keeps showing it as null.

-- 1. Until now MySQL allowed the same brand without a line more than once. Those repeats would
--    clash once they become '', so first merge each group into its lowest id: its items move
--    to that row and the other rows are deleted. GROUP BY uses the column's case-insensitive
--    collation, the same as the unique index, so "fidelité" and "Fidelité" are one group.
UPDATE `Articulo` AS `a`
JOIN `Marca` AS `m` ON `m`.`id` = `a`.`marcaId` AND `m`.`linea` IS NULL
JOIN (
    SELECT `razonSocial`, MIN(`id`) AS `conservar`
    FROM `Marca`
    WHERE `linea` IS NULL
    GROUP BY `razonSocial`
    HAVING COUNT(*) > 1
) AS `d` ON `d`.`razonSocial` = `m`.`razonSocial` AND `m`.`id` <> `d`.`conservar`
SET `a`.`marcaId` = `d`.`conservar`;

DELETE `m` FROM `Marca` AS `m`
JOIN (
    SELECT `razonSocial`, MIN(`id`) AS `conservar`
    FROM `Marca`
    WHERE `linea` IS NULL
    GROUP BY `razonSocial`
    HAVING COUNT(*) > 1
) AS `d` ON `d`.`razonSocial` = `m`.`razonSocial` AND `m`.`linea` IS NULL AND `m`.`id` <> `d`.`conservar`;

-- 2. No line becomes ''.
UPDATE `Marca` SET `linea` = '' WHERE `linea` IS NULL;

-- AlterTable
ALTER TABLE `Marca` MODIFY `linea` VARCHAR(100) NOT NULL DEFAULT '';
