-- CreateTable
CREATE TABLE `Proveedor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cuit` CHAR(11) NOT NULL,
    `razonSocial` VARCHAR(150) NOT NULL,
    `telefono` VARCHAR(30) NULL,
    `email` VARCHAR(191) NULL,
    `condicionesComerciales` VARCHAR(500) NULL,
    `fechaAlta` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fechaBaja` DATETIME(3) NULL,

    UNIQUE INDEX `Proveedor_cuit_key`(`cuit`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- The Proveedor table is new, so any proveedorId already stored points nowhere and would break the FK.
UPDATE `Remito` SET `proveedorId` = NULL WHERE `proveedorId` IS NOT NULL;

-- CreateIndex
CREATE INDEX `Remito_proveedorId_numComprobante_idx` ON `Remito`(`proveedorId`, `numComprobante`);

-- AddForeignKey
ALTER TABLE `Remito` ADD CONSTRAINT `Remito_proveedorId_fkey` FOREIGN KEY (`proveedorId`) REFERENCES `Proveedor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
