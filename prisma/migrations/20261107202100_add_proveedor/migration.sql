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

-- No code wrote Remito.proveedorId before this table existed. If a database has one anyway (loaded by
-- hand), the ADD CONSTRAINT below fails on purpose instead of erasing it: whoever runs the migration
-- decides what to do with those rows.

-- CreateIndex
CREATE INDEX `Remito_proveedorId_numComprobante_idx` ON `Remito`(`proveedorId`, `numComprobante`);

-- AddForeignKey
ALTER TABLE `Remito` ADD CONSTRAINT `Remito_proveedorId_fkey` FOREIGN KEY (`proveedorId`) REFERENCES `Proveedor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
