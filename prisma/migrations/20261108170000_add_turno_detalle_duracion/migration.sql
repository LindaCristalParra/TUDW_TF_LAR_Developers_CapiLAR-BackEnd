-- AlterTable: nullable first, so the existing rows can be filled before it becomes required.
ALTER TABLE `TurnoDetalle` ADD COLUMN `duracion` INTEGER NULL;

-- Existing rows: the current duration of their service (the one they were already using).
UPDATE `TurnoDetalle` td
JOIN `Servicio` s ON s.`id` = td.`servicioId`
SET td.`duracion` = s.`tiempoDuracion`;

-- AlterTable
ALTER TABLE `TurnoDetalle` MODIFY `duracion` INTEGER NOT NULL;
