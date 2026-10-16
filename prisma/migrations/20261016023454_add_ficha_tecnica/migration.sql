-- CreateTable
CREATE TABLE `FichaTecnica` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `turnoDetalleId` INTEGER NOT NULL,
    `porosidad` ENUM('BAJA', 'MEDIA', 'ALTA') NULL,
    `elasticidad` ENUM('BAJA', 'MEDIA', 'ALTA') NULL,
    `porcentajeCanas` INTEGER NULL,
    `tipoDePelo` ENUM('LISO', 'ONDULADO', 'RIZADO', 'AFRO') NULL,
    `volumenDePelo` ENUM('FINO', 'MEDIO', 'GRUESO') NULL,
    `tratamientosPrevios` VARCHAR(1000) NULL,
    `observacionesInternas` VARCHAR(1000) NULL,
    `indicacionesCliente` VARCHAR(1000) NULL,
    `creadaEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadaEn` DATETIME(3) NOT NULL,
    `cerradaEn` DATETIME(3) NULL,
    `fechaBaja` DATETIME(3) NULL,

    INDEX `FichaTecnica_turnoDetalleId_idx`(`turnoDetalleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FichaTecnica` ADD CONSTRAINT `FichaTecnica_turnoDetalleId_fkey` FOREIGN KEY (`turnoDetalleId`) REFERENCES `TurnoDetalle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
