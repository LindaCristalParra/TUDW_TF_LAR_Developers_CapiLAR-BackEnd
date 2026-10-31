-- CreateTable
CREATE TABLE `Servicio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` VARCHAR(100) NOT NULL,
    `tiempoDuracion` INTEGER NOT NULL,
    `precio` DECIMAL(10, 2) NOT NULL,
    `fechaBaja` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DisponibilidadHoraria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profesionalId` INTEGER NOT NULL,
    `diaSemana` INTEGER NOT NULL,
    `horarioInicio` CHAR(5) NOT NULL,
    `horarioFin` CHAR(5) NOT NULL,
    `fechaBaja` DATETIME(3) NULL,

    INDEX `DisponibilidadHoraria_profesionalId_diaSemana_idx`(`profesionalId`, `diaSemana`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BloqueoAgenda` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profesionalId` INTEGER NOT NULL,
    `fechaInicio` DATETIME(3) NOT NULL,
    `fechaFin` DATETIME(3) NOT NULL,
    `motivo` VARCHAR(255) NULL,
    `fechaBaja` DATETIME(3) NULL,

    INDEX `BloqueoAgenda_profesionalId_fechaInicio_idx`(`profesionalId`, `fechaInicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Turno` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clienteId` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `horaInicio` CHAR(5) NOT NULL,
    `horaFin` CHAR(5) NOT NULL,
    `metodoPago` ENUM('EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA') NULL,
    `estado` ENUM('PENDIENTE', 'CONFIRMADO', 'REPROGRAMADO', 'COMPLETADO', 'RECHAZADO', 'CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
    `motivoRechazo` VARCHAR(500) NULL,

    INDEX `Turno_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TurnoDetalle` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `turnoId` INTEGER NOT NULL,
    `profesionalId` INTEGER NOT NULL,
    `servicioId` INTEGER NOT NULL,
    `precioBase` DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DisponibilidadHoraria` ADD CONSTRAINT `DisponibilidadHoraria_profesionalId_fkey` FOREIGN KEY (`profesionalId`) REFERENCES `Profesional`(`legajo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BloqueoAgenda` ADD CONSTRAINT `BloqueoAgenda_profesionalId_fkey` FOREIGN KEY (`profesionalId`) REFERENCES `Profesional`(`legajo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Turno` ADD CONSTRAINT `Turno_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`usuarioId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TurnoDetalle` ADD CONSTRAINT `TurnoDetalle_turnoId_fkey` FOREIGN KEY (`turnoId`) REFERENCES `Turno`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TurnoDetalle` ADD CONSTRAINT `TurnoDetalle_profesionalId_fkey` FOREIGN KEY (`profesionalId`) REFERENCES `Profesional`(`legajo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TurnoDetalle` ADD CONSTRAINT `TurnoDetalle_servicioId_fkey` FOREIGN KEY (`servicioId`) REFERENCES `Servicio`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
