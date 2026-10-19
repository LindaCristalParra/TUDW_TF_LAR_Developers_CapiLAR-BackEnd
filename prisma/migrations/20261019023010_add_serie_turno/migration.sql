-- AlterTable
ALTER TABLE `Turno` ADD COLUMN `serieId` INTEGER NULL;

-- CreateTable
CREATE TABLE `SerieTurno` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clienteId` INTEGER NOT NULL,
    `profesionalId` INTEGER NOT NULL,
    `servicioId` INTEGER NOT NULL,
    `frecuencia` ENUM('SEMANAL', 'QUINCENAL', 'CADA_20_DIAS', 'MENSUAL') NOT NULL,
    `horaInicio` CHAR(5) NOT NULL,
    `fechaInicio` DATE NOT NULL,
    `fechaFin` DATE NOT NULL,
    `estado` ENUM('ACTIVA', 'SUSPENDIDA', 'BAJA') NOT NULL DEFAULT 'ACTIVA',
    `turnoOrigenId` INTEGER NOT NULL,
    `creadaEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SerieTurno_clienteId_idx`(`clienteId`),
    INDEX `SerieTurno_profesionalId_idx`(`profesionalId`),
    INDEX `SerieTurno_turnoOrigenId_idx`(`turnoOrigenId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Turno` ADD CONSTRAINT `Turno_serieId_fkey` FOREIGN KEY (`serieId`) REFERENCES `SerieTurno`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SerieTurno` ADD CONSTRAINT `SerieTurno_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`usuarioId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SerieTurno` ADD CONSTRAINT `SerieTurno_profesionalId_fkey` FOREIGN KEY (`profesionalId`) REFERENCES `Profesional`(`legajo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SerieTurno` ADD CONSTRAINT `SerieTurno_servicioId_fkey` FOREIGN KEY (`servicioId`) REFERENCES `Servicio`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SerieTurno` ADD CONSTRAINT `SerieTurno_turnoOrigenId_fkey` FOREIGN KEY (`turnoOrigenId`) REFERENCES `Turno`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
