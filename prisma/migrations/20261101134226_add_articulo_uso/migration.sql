-- CreateTable
CREATE TABLE `ArticuloUso` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `articuloId` INTEGER NOT NULL,
    `pesoActual` DECIMAL(10, 2) NOT NULL,
    `tipoPeso` ENUM('G', 'ML', 'UNIDAD') NOT NULL,

    UNIQUE INDEX `ArticuloUso_articuloId_key`(`articuloId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ArticuloUso` ADD CONSTRAINT `ArticuloUso_articuloId_fkey` FOREIGN KEY (`articuloId`) REFERENCES `Articulo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
