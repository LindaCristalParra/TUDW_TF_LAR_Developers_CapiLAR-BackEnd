-- CreateTable
CREATE TABLE `Categoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `fechaBaja` DATETIME(3) NULL,

    UNIQUE INDEX `Categoria_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Initial categories (PWA-288).
INSERT INTO `Categoria` (`nombre`) VALUES
    ('Color'), ('Corte'), ('Diagnóstico'), ('Peinados'), ('Tratamientos');

-- AlterTable: added as NULL first so existing services can get a category, then NOT NULL.
ALTER TABLE `Servicio` ADD COLUMN `categoriaId` INTEGER NULL;

-- The services in production by name; any other one goes to Tratamientos.
UPDATE `Servicio` s
JOIN `Categoria` c ON c.`nombre` = CASE s.`tipo`
    WHEN 'Corte' THEN 'Corte'
    WHEN 'Baby lights' THEN 'Color'
    WHEN 'Brushing' THEN 'Peinados'
    ELSE 'Tratamientos'
END
SET s.`categoriaId` = c.`id`;

ALTER TABLE `Servicio` MODIFY `categoriaId` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `Servicio` ADD CONSTRAINT `Servicio_categoriaId_fkey` FOREIGN KEY (`categoriaId`) REFERENCES `Categoria`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
