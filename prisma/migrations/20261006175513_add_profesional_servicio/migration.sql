-- CreateTable
CREATE TABLE `ProfesionalServicio` (
    `profesionalId` INTEGER NOT NULL,
    `servicioId` INTEGER NOT NULL,
    `fechaBaja` DATETIME(3) NULL,

    INDEX `ProfesionalServicio_servicioId_idx`(`servicioId`),
    PRIMARY KEY (`profesionalId`, `servicioId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProfesionalServicio` ADD CONSTRAINT `ProfesionalServicio_profesionalId_fkey` FOREIGN KEY (`profesionalId`) REFERENCES `Profesional`(`legajo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProfesionalServicio` ADD CONSTRAINT `ProfesionalServicio_servicioId_fkey` FOREIGN KEY (`servicioId`) REFERENCES `Servicio`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
