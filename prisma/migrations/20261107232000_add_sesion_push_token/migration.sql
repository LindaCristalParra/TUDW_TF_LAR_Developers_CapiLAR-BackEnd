-- AlterTable
ALTER TABLE `Sesion` ADD COLUMN `pushToken` VARCHAR(255) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Sesion_pushToken_key` ON `Sesion`(`pushToken`);
