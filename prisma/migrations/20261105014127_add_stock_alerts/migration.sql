-- AlterTable
ALTER TABLE `Notificacion` ADD COLUMN `articuloId` INTEGER NULL,
    MODIFY `tipo` ENUM('RECORDATORIO', 'AGENDA_DIARIA', 'STOCK_MINIMO') NOT NULL;

-- CreateIndex
CREATE INDEX `Notificacion_articuloId_idx` ON `Notificacion`(`articuloId`);

-- AddForeignKey
ALTER TABLE `Notificacion` ADD CONSTRAINT `Notificacion_articuloId_fkey` FOREIGN KEY (`articuloId`) REFERENCES `Articulo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
