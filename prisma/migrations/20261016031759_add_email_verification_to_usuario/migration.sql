-- AlterTable
ALTER TABLE `Usuario` ADD COLUMN `emailVerificadoEn` DATETIME(3) NULL,
    ADD COLUMN `verificacionToken` VARCHAR(191) NULL,
    ADD COLUMN `verificacionTokenExpira` DATETIME(3) NULL;

-- Accounts created before email verification existed count as verified (decided by the team),
-- so nobody who already books is blocked.
UPDATE `Usuario` SET `emailVerificadoEn` = CURRENT_TIMESTAMP(3);
