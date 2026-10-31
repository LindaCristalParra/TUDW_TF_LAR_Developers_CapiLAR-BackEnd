-- CreateTable
CREATE TABLE `Alergia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `fechaBaja` DATETIME(3) NULL,

    UNIQUE INDEX `Alergia_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClienteAlergia` (
    `clienteId` INTEGER NOT NULL,
    `alergiaId` INTEGER NOT NULL,

    INDEX `ClienteAlergia_alergiaId_idx`(`alergiaId`),
    PRIMARY KEY (`clienteId`, `alergiaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClienteAlergia` ADD CONSTRAINT `ClienteAlergia_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`usuarioId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClienteAlergia` ADD CONSTRAINT `ClienteAlergia_alergiaId_fkey` FOREIGN KEY (`alergiaId`) REFERENCES `Alergia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Initial list (to be reviewed by the salon; the ADMIN can change it later).
INSERT INTO `Alergia` (`nombre`, `descripcion`) VALUES
    ('Amoníaco', 'Presente en muchas tinturas permanentes.'),
    ('PPD (parafenilendiamina)', 'Colorante de tinturas oscuras.'),
    ('Resorcinol', 'Componente de tinturas.'),
    ('Persulfatos', 'Presentes en decolorantes.'),
    ('Látex', 'Guantes y algunos productos.'),
    ('Níquel', 'Herramientas y accesorios metálicos.'),
    ('Fragancias', 'Perfumes de shampoos y productos.'),
    ('Formaldehído', 'Presente en algunos alisados.');
