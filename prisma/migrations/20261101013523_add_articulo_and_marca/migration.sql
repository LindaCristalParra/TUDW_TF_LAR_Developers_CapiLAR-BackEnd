-- CreateTable
CREATE TABLE `Marca` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `razonSocial` VARCHAR(100) NOT NULL,
    `linea` VARCHAR(100) NULL,

    UNIQUE INDEX `Marca_razonSocial_linea_key`(`razonSocial`, `linea`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Articulo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(150) NOT NULL,
    `codigo` VARCHAR(30) NULL,
    `uso` ENUM('SALON', 'VENTA', 'AMBOS') NOT NULL,
    `tipoProducto` ENUM('TINTURA', 'OXIDANTE', 'DECOLORANTE', 'SHAMPOO', 'ACONDICIONADOR', 'MASCARA', 'AMPOLLA', 'SERUM', 'PEINADO', 'PROTECTOR_TERMICO', 'KIT', 'OTRO') NOT NULL,
    `stock` DECIMAL(10, 3) NOT NULL DEFAULT 0,
    `stockMinAlert` DECIMAL(10, 3) NOT NULL DEFAULT 0,
    `fechaVencimiento` DATE NULL,
    `precioCosto` DECIMAL(10, 2) NOT NULL,
    `precioVenta` DECIMAL(10, 2) NULL,
    `pesoInicial` DECIMAL(10, 2) NOT NULL,
    `tipoPeso` ENUM('G', 'ML', 'UNIDAD') NOT NULL,
    `tonalidad` VARCHAR(50) NULL,
    `tipoDeposito` ENUM('SALON', 'DEPOSITO', 'VITRINA') NOT NULL,
    `qr` VARCHAR(20) NOT NULL,
    `marcaId` INTEGER NOT NULL,
    `fechaAlta` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fechaBaja` DATETIME(3) NULL,

    UNIQUE INDEX `Articulo_qr_key`(`qr`),
    INDEX `Articulo_marcaId_idx`(`marcaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Articulo` ADD CONSTRAINT `Articulo_marcaId_fkey` FOREIGN KEY (`marcaId`) REFERENCES `Marca`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
