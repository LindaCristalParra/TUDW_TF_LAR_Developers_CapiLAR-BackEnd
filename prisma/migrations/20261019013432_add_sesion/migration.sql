-- CreateTable
CREATE TABLE `Sesion` (
    `sid` CHAR(32) NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `vence` DATETIME(3) NOT NULL,
    `revocadaEn` DATETIME(3) NULL,
    `creadaEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Sesion_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`sid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Sesion` ADD CONSTRAINT `Sesion_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep the open sessions: Usuario.refreshToken held "<sid>:<sha256 of the token>".
-- The refresh token itself still expires on its own, so 7 days is only an upper bound.
INSERT INTO `Sesion` (`sid`, `usuarioId`, `tokenHash`, `vence`)
SELECT SUBSTRING_INDEX(`refreshToken`, ':', 1), `id`, SUBSTRING_INDEX(`refreshToken`, ':', -1),
       UTC_TIMESTAMP(3) + INTERVAL 7 DAY
FROM `Usuario`
WHERE `refreshToken` IS NOT NULL;

-- AlterTable
ALTER TABLE `Usuario` DROP COLUMN `refreshToken`;
