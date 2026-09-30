-- AlterTable
ALTER TABLE `Customer` ADD COLUMN `buyerReference` VARCHAR(191) NULL,
    ADD COLUMN `discountDays` INTEGER NULL,
    ADD COLUMN `discountPercent` DECIMAL(5, 2) NULL,
    ADD COLUMN `paymentTermDays` INTEGER NULL,
    ADD COLUMN `pricePerKm` DECIMAL(10, 2) NULL,
    ADD COLUMN `returnFlat` DECIMAL(10, 2) NULL,
    ADD COLUMN `returnPerKm` DECIMAL(10, 2) NULL,
    ADD COLUMN `returnType` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `buyerReference` VARCHAR(191) NULL,
    ADD COLUMN `correctsNumber` VARCHAR(191) NULL,
    ADD COLUMN `discountDays` INTEGER NULL,
    ADD COLUMN `discountPercent` DECIMAL(5, 2) NULL;

-- AlterTable
ALTER TABLE `Order` ADD COLUMN `returnFlat` DECIMAL(10, 2) NULL,
    ADD COLUMN `returnPerKm` DECIMAL(10, 2) NULL,
    ADD COLUMN `returnType` VARCHAR(191) NOT NULL DEFAULT 'NONE',
    ADD COLUMN `trackingToken` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Organization` ADD COLUMN `defaultReturnFlat` DECIMAL(10, 2) NULL,
    ADD COLUMN `defaultReturnPerKm` DECIMAL(10, 2) NULL,
    ADD COLUMN `defaultReturnType` VARCHAR(191) NOT NULL DEFAULT 'NONE',
    ADD COLUMN `dunningDays` INTEGER NOT NULL DEFAULT 7,
    ADD COLUMN `dunningFee1` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `dunningFee2` DECIMAL(10, 2) NOT NULL DEFAULT 5,
    ADD COLUMN `dunningFee3` DECIMAL(10, 2) NOT NULL DEFAULT 10,
    ADD COLUMN `nextQuoteNumber` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `notifyCustomerOnStatus` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `perDiemEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `perDiemFull` DECIMAL(10, 2) NOT NULL DEFAULT 28,
    ADD COLUMN `perDiemPartial` DECIMAL(10, 2) NOT NULL DEFAULT 14,
    ADD COLUMN `quotePrefix` VARCHAR(191) NOT NULL DEFAULT 'AN-',
    ADD COLUMN `quoteValidDays` INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN `requestEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `requestToken` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `calendarToken` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Dunning` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `fee` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `dueDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Dunning_invoiceId_idx`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Quote` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED') NOT NULL DEFAULT 'DRAFT',
    `validUntil` DATETIME(3) NULL,
    `recipient` TEXT NOT NULL,
    `smallBusiness` BOOLEAN NOT NULL DEFAULT false,
    `introText` TEXT NULL,
    `footerText` TEXT NULL,
    `netTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `vatTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `grossTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `transportMode` ENUM('DRIVEN', 'TRAILER', 'TRUCK') NOT NULL DEFAULT 'DRIVEN',
    `pickupStreet` VARCHAR(191) NULL,
    `pickupZip` VARCHAR(191) NULL,
    `pickupCity` VARCHAR(191) NULL,
    `pickupDate` DATETIME(3) NULL,
    `deliveryStreet` VARCHAR(191) NULL,
    `deliveryZip` VARCHAR(191) NULL,
    `deliveryCity` VARCHAR(191) NULL,
    `licensePlate` VARCHAR(191) NULL,
    `make` VARCHAR(191) NULL,
    `model` VARCHAR(191) NULL,
    `distanceKm` DECIMAL(10, 1) NULL,
    `durationMinutes` INTEGER NULL,
    `returnType` VARCHAR(191) NOT NULL DEFAULT 'NONE',
    `orderId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Quote_orderId_key`(`orderId`),
    INDEX `Quote_organizationId_status_idx`(`organizationId`, `status`),
    UNIQUE INDEX `Quote_organizationId_number_key`(`organizationId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuoteItem` (
    `id` VARCHAR(191) NOT NULL,
    `quoteId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `description` TEXT NOT NULL,
    `quantity` DECIMAL(10, 2) NOT NULL DEFAULT 1,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'Stk.',
    `unitPrice` DECIMAL(12, 2) NOT NULL,
    `vatRate` DECIMAL(5, 2) NOT NULL DEFAULT 19,

    INDEX `QuoteItem_quoteId_idx`(`quoteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Inquiry` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `status` ENUM('NEW', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'NEW',
    `companyName` VARCHAR(191) NULL,
    `contactName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `transportMode` ENUM('DRIVEN', 'TRAILER', 'TRUCK') NOT NULL DEFAULT 'DRIVEN',
    `pickupStreet` VARCHAR(191) NULL,
    `pickupZip` VARCHAR(191) NULL,
    `pickupCity` VARCHAR(191) NULL,
    `pickupDate` VARCHAR(191) NULL,
    `deliveryStreet` VARCHAR(191) NULL,
    `deliveryZip` VARCHAR(191) NULL,
    `deliveryCity` VARCHAR(191) NULL,
    `deliveryDate` VARCHAR(191) NULL,
    `licensePlate` VARCHAR(191) NULL,
    `make` VARCHAR(191) NULL,
    `model` VARCHAR(191) NULL,
    `vin` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `orderId` VARCHAR(191) NULL,
    `quoteId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Inquiry_orderId_key`(`orderId`),
    UNIQUE INDEX `Inquiry_quoteId_key`(`quoteId`),
    INDEX `Inquiry_organizationId_status_idx`(`organizationId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Order_trackingToken_key` ON `Order`(`trackingToken`);

-- CreateIndex
CREATE UNIQUE INDEX `Organization_requestToken_key` ON `Organization`(`requestToken`);

-- CreateIndex
CREATE UNIQUE INDEX `User_calendarToken_key` ON `User`(`calendarToken`);

-- AddForeignKey
ALTER TABLE `Dunning` ADD CONSTRAINT `Dunning_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quote` ADD CONSTRAINT `Quote_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quote` ADD CONSTRAINT `Quote_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quote` ADD CONSTRAINT `Quote_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteItem` ADD CONSTRAINT `QuoteItem_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `Quote`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inquiry` ADD CONSTRAINT `Inquiry_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inquiry` ADD CONSTRAINT `Inquiry_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inquiry` ADD CONSTRAINT `Inquiry_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `Quote`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

