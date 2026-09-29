-- AlterTable
ALTER TABLE `Order` ADD COLUMN `durationMinutes` INTEGER NULL,
    ADD COLUMN `vehicleId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Vehicle` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `licensePlate` VARCHAR(191) NULL,
    `vin` VARCHAR(191) NULL,
    `make` VARCHAR(191) NULL,
    `model` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `firstRegistration` VARCHAR(191) NULL,
    `vehicleType` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Vehicle_organizationId_vin_idx`(`organizationId`, `vin`),
    INDEX `Vehicle_organizationId_licensePlate_idx`(`organizationId`, `licensePlate`),
    INDEX `Vehicle_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Order_vehicleId_idx` ON `Order`(`vehicleId`);

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Datenübernahme: Fahrzeugbestand aus bestehenden Aufträgen aufbauen
-- (ein Fahrzeug je FIN bzw. – ohne FIN – je Kennzeichen, Daten aus dem jüngsten Auftrag)
INSERT INTO `Vehicle` (`id`, `organizationId`, `customerId`, `licensePlate`, `vin`, `make`, `model`, `color`, `firstRegistration`, `vehicleType`, `createdAt`, `updatedAt`)
SELECT UUID(), o.`organizationId`, o.`customerId`, o.`licensePlate`, o.`vin`, o.`make`, o.`model`, o.`color`, o.`firstRegistration`, o.`vehicleType`, o.`createdAt`, NOW(3)
FROM `Order` o
WHERE (o.`vin` IS NOT NULL OR o.`licensePlate` IS NOT NULL)
  AND o.`id` = (
    SELECT o2.`id` FROM `Order` o2
    WHERE o2.`organizationId` = o.`organizationId`
      AND COALESCE(o2.`vin`, o2.`licensePlate`) = COALESCE(o.`vin`, o.`licensePlate`)
    ORDER BY o2.`updatedAt` DESC, o2.`id`
    LIMIT 1
  );

UPDATE `Order` o
JOIN `Vehicle` v
  ON v.`organizationId` = o.`organizationId`
 AND ((o.`vin` IS NOT NULL AND v.`vin` = o.`vin`)
   OR (o.`vin` IS NULL AND v.`vin` IS NULL AND v.`licensePlate` = o.`licensePlate`))
SET o.`vehicleId` = v.`id`
WHERE o.`vehicleId` IS NULL;
