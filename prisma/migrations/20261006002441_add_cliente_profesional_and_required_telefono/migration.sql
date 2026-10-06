-- Existing users without a phone get an empty one, so the column can become NOT NULL.
UPDATE `Usuario` SET `telefono` = '' WHERE `telefono` IS NULL;

-- AlterTable
ALTER TABLE `Usuario` MODIFY `telefono` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `Cliente` (
    `usuarioId` INTEGER NOT NULL,
    `alergia` VARCHAR(255) NULL,

    PRIMARY KEY (`usuarioId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Profesional` (
    `legajo` INTEGER NOT NULL AUTO_INCREMENT,
    `usuarioId` INTEGER NOT NULL,

    UNIQUE INDEX `Profesional_usuarioId_key`(`usuarioId`),
    PRIMARY KEY (`legajo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Cliente` ADD CONSTRAINT `Cliente_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Profesional` ADD CONSTRAINT `Profesional_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing users get the subtype row that matches their role.
INSERT INTO `Cliente` (`usuarioId`) SELECT `id` FROM `Usuario` WHERE `rol` = 'CLIENTE';
INSERT INTO `Profesional` (`usuarioId`) SELECT `id` FROM `Usuario` WHERE `rol` = 'PROFESIONAL' ORDER BY `id`;
