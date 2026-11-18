-- AlterTable
ALTER TABLE `FormulaInsumo` ADD COLUMN `costoSubtotal` DECIMAL(10, 2) NULL;

-- AlterTable
ALTER TABLE `Remito` ADD COLUMN `fichaId` INTEGER NULL,
    MODIFY `tipo` ENUM('COMPRA', 'INGRESO', 'EGRESO', 'AJUSTE', 'CONSUMO') NOT NULL;

-- CreateIndex
CREATE INDEX `Remito_fichaId_idx` ON `Remito`(`fichaId`);

-- AddForeignKey
ALTER TABLE `Remito` ADD CONSTRAINT `Remito_fichaId_fkey` FOREIGN KEY (`fichaId`) REFERENCES `FichaTecnica`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
