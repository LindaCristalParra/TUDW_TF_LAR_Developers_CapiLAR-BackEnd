-- AlterTable
ALTER TABLE `FormulaInsumo` MODIFY `producto` VARCHAR(150) NOT NULL,
    MODIFY `marca` VARCHAR(201) NULL;

-- CreateIndex
CREATE INDEX `FormulaInsumo_articuloId_idx` ON `FormulaInsumo`(`articuloId`);

-- Before this, articuloId was a free number (no Articulo table): clear the ones that point nowhere.
UPDATE `FormulaInsumo` fi
SET fi.`articuloId` = NULL
WHERE fi.`articuloId` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `Articulo` a WHERE a.`id` = fi.`articuloId`);

-- AddForeignKey
ALTER TABLE `FormulaInsumo` ADD CONSTRAINT `FormulaInsumo_articuloId_fkey` FOREIGN KEY (`articuloId`) REFERENCES `Articulo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
