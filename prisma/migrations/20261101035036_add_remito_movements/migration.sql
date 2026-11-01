-- CreateTable
CREATE TABLE `Remito` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tipo` ENUM('COMPRA', 'INGRESO', 'EGRESO', 'AJUSTE') NOT NULL,
    `estado` ENUM('PENDIENTE', 'APLICADO', 'ANULADO') NOT NULL,
    `numComprobante` VARCHAR(30) NULL,
    `proveedorId` INTEGER NULL,
    `usuarioId` INTEGER NOT NULL,
    `motivo` VARCHAR(255) NULL,

    INDEX `Remito_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RemitoDetalle` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `remitoId` INTEGER NOT NULL,
    `articuloId` INTEGER NOT NULL,
    `cantidad` DECIMAL(10, 3) NOT NULL,
    `costoUnitario` DECIMAL(10, 2) NULL,

    INDEX `RemitoDetalle_remitoId_idx`(`remitoId`),
    INDEX `RemitoDetalle_articuloId_idx`(`articuloId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Remito` ADD CONSTRAINT `Remito_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RemitoDetalle` ADD CONSTRAINT `RemitoDetalle_remitoId_fkey` FOREIGN KEY (`remitoId`) REFERENCES `Remito`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RemitoDetalle` ADD CONSTRAINT `RemitoDetalle_articuloId_fkey` FOREIGN KEY (`articuloId`) REFERENCES `Articulo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
