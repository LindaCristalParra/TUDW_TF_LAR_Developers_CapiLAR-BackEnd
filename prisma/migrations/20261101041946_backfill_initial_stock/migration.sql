-- Items loaded before stock movements existed have stock but no history. Gives each item whose
-- stock differs from the sum of its movements one "Stock inicial" movement for the difference
-- (dated at its fechaAlta, registered by the first active admin), so the history adds up to the
-- stock, like an item created now. Without an active admin it does nothing.

SET @admin := (SELECT `id` FROM `Usuario` WHERE `rol` = 'ADMIN' AND `fechaBaja` IS NULL ORDER BY `id` LIMIT 1);
SET @base := (SELECT COALESCE(MAX(`id`), 0) FROM `Remito`);

-- One Remito per item: numbered here, so each detail can point to its own.
CREATE TEMPORARY TABLE `_stock_inicial` AS
SELECT
    @base + ROW_NUMBER() OVER (ORDER BY `a`.`id`) AS `remitoId`,
    `a`.`id` AS `articuloId`,
    `a`.`fechaAlta`,
    `a`.`stock` - COALESCE(SUM(`d`.`cantidad`), 0) AS `cantidad`
FROM `Articulo` `a`
LEFT JOIN `RemitoDetalle` `d` ON `d`.`articuloId` = `a`.`id`
WHERE @admin IS NOT NULL
GROUP BY `a`.`id`, `a`.`fechaAlta`, `a`.`stock`
HAVING `cantidad` <> 0;

-- Negative only if the stock was edited by hand below its movements: then it is a correction.
INSERT INTO `Remito` (`id`, `fecha`, `tipo`, `estado`, `usuarioId`, `motivo`)
SELECT `remitoId`, `fechaAlta`, IF(`cantidad` > 0, 'INGRESO', 'AJUSTE'), 'APLICADO', @admin, 'Stock inicial'
FROM `_stock_inicial`;

INSERT INTO `RemitoDetalle` (`remitoId`, `articuloId`, `cantidad`)
SELECT `remitoId`, `articuloId`, `cantidad`
FROM `_stock_inicial`;

DROP TEMPORARY TABLE `_stock_inicial`;
