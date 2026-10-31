-- Working hours are now loaded per date instead of per weekday.
-- Rows by weekday can't be turned into dates, so they are removed: each professional loads their dates again.
DELETE FROM `DisponibilidadHoraria`;

-- DropForeignKey (MySQL uses the old index for it)
ALTER TABLE `DisponibilidadHoraria` DROP FOREIGN KEY `DisponibilidadHoraria_profesionalId_fkey`;

-- DropIndex
DROP INDEX `DisponibilidadHoraria_profesionalId_diaSemana_idx` ON `DisponibilidadHoraria`;

-- AlterTable
ALTER TABLE `DisponibilidadHoraria` DROP COLUMN `diaSemana`,
    ADD COLUMN `fecha` DATE NOT NULL;

-- CreateIndex
CREATE INDEX `DisponibilidadHoraria_profesionalId_fecha_idx` ON `DisponibilidadHoraria`(`profesionalId`, `fecha`);

-- AddForeignKey
ALTER TABLE `DisponibilidadHoraria` ADD CONSTRAINT `DisponibilidadHoraria_profesionalId_fkey` FOREIGN KEY (`profesionalId`) REFERENCES `Profesional`(`legajo`) ON DELETE RESTRICT ON UPDATE CASCADE;
