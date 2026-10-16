/*
  Warnings:

  - You are about to drop the `BloqueoAgenda` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `BloqueoAgenda` DROP FOREIGN KEY `BloqueoAgenda_profesionalId_fkey`;

-- DropTable
DROP TABLE `BloqueoAgenda`;
