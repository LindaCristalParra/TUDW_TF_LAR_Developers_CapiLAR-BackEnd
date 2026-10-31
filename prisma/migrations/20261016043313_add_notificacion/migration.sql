-- CreateTable
CREATE TABLE `Notificacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `turnoId` INTEGER NULL,
    `usuarioId` INTEGER NOT NULL,
    `medio` ENUM('EMAIL', 'WHATSAPP') NOT NULL,
    `tipo` ENUM('RECORDATORIO', 'AGENDA_DIARIA') NOT NULL,
    `estadoEnvio` ENUM('ENVIADO', 'ERROR') NOT NULL,
    `fechaEnvio` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `inicioTurno` DATETIME(3) NULL,
    `tokenHash` CHAR(64) NULL,

    UNIQUE INDEX `Notificacion_tokenHash_key`(`tokenHash`),
    INDEX `Notificacion_turnoId_tipo_idx`(`turnoId`, `tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Notificacion` ADD CONSTRAINT `Notificacion_turnoId_fkey` FOREIGN KEY (`turnoId`) REFERENCES `Turno`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notificacion` ADD CONSTRAINT `Notificacion_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
