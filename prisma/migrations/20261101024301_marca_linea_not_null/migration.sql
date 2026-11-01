-- No line is now '' instead of NULL, so the unique index (razonSocial, linea) also stops a
-- repeated brand without a line (MySQL lets NULLs repeat). The API keeps showing it as null.
UPDATE `Marca` SET `linea` = '' WHERE `linea` IS NULL;

-- AlterTable
ALTER TABLE `Marca` MODIFY `linea` VARCHAR(100) NOT NULL DEFAULT '';
