-- Same column now holds the reason for a rejection or a cancellation (keeps existing data).
ALTER TABLE `Turno` RENAME COLUMN `motivoRechazo` TO `motivo`;
