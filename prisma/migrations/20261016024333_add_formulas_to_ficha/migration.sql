-- CreateTable
CREATE TABLE `Formula` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fichaId` INTEGER NOT NULL,
    `descripcion` VARCHAR(500) NULL,
    `oxidanteVolumen` INTEGER NULL,
    `tiempoPoseMin` INTEGER NULL,
    `orden` INTEGER NOT NULL,

    INDEX `Formula_fichaId_idx`(`fichaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FormulaInsumo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `formulaId` INTEGER NOT NULL,
    `producto` VARCHAR(100) NOT NULL,
    `marca` VARCHAR(100) NULL,
    `tono` VARCHAR(50) NULL,
    `cantidad` DECIMAL(10, 2) NULL,
    `unidad` ENUM('G', 'ML', 'UNIDAD') NULL,
    `articuloId` INTEGER NULL,

    INDEX `FormulaInsumo_formulaId_idx`(`formulaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Formula` ADD CONSTRAINT `Formula_fichaId_fkey` FOREIGN KEY (`fichaId`) REFERENCES `FichaTecnica`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FormulaInsumo` ADD CONSTRAINT `FormulaInsumo_formulaId_fkey` FOREIGN KEY (`formulaId`) REFERENCES `Formula`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
