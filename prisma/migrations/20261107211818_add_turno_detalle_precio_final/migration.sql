-- AlterTable
ALTER TABLE `TurnoDetalle` ADD COLUMN `precioFinal` DECIMAL(10, 2) NULL;

-- Turnos already completed: charged at the booking price.
UPDATE `TurnoDetalle` td
JOIN `Turno` t ON t.`id` = td.`turnoId`
SET td.`precioFinal` = td.`precioBase`
WHERE t.`estado` = 'COMPLETADO';
