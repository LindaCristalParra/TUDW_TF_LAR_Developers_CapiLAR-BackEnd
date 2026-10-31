-- CreateTable
CREATE TABLE `FotoFicha` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fichaId` INTEGER NOT NULL,
    `tipo` ENUM('ANTES', 'DESPUES') NOT NULL,
    `archivo` VARCHAR(100) NOT NULL,
    `creadaEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FotoFicha_fichaId_idx`(`fichaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FotoFicha` ADD CONSTRAINT `FotoFicha_fichaId_fkey` FOREIGN KEY (`fichaId`) REFERENCES `FichaTecnica`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
