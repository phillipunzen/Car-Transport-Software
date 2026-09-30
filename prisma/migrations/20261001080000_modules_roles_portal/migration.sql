-- AlterTable
ALTER TABLE `Customer` ADD COLUMN `portalToken` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Expense` ADD COLUMN `reimburse` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `settlementId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Inquiry` ADD COLUMN `customerId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Invitation` MODIFY `role` ENUM('OWNER', 'ADMIN', 'MEMBER', 'DRIVER') NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE `Membership` ADD COLUMN `licenseCheckedAt` DATETIME(3) NULL,
    ADD COLUMN `licenseClasses` VARCHAR(191) NULL,
    ADD COLUMN `licenseExpiry` DATETIME(3) NULL,
    ADD COLUMN `payRate` DECIMAL(10, 2) NULL,
    ADD COLUMN `payType` VARCHAR(191) NOT NULL DEFAULT 'NONE',
    ADD COLUMN `payVat` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `role` ENUM('OWNER', 'ADMIN', 'MEMBER', 'DRIVER') NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE `Order` ADD COLUMN `collectiveInvoiceId` VARCHAR(191) NULL,
    ADD COLUMN `driverPay` DECIMAL(10, 2) NULL,
    ADD COLUMN `feedbackAt` DATETIME(3) NULL,
    ADD COLUMN `feedbackComment` TEXT NULL,
    ADD COLUMN `feedbackRating` INTEGER NULL,
    ADD COLUMN `feedbackToken` VARCHAR(191) NULL,
    ADD COLUMN `settlementId` VARCHAR(191) NULL,
    ADD COLUMN `tradePlateId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Organization` ADD COLUMN `datevChart` VARCHAR(191) NOT NULL DEFAULT 'SKR03',
    ADD COLUMN `datevClient` VARCHAR(191) NULL,
    ADD COLUMN `datevConsultant` VARCHAR(191) NULL,
    ADD COLUMN `datevRevenue` VARCHAR(191) NULL,
    ADD COLUMN `moduleBankImport` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `moduleDriverPay` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `moduleFleet` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `moduleReviews` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `nextSettlementNumber` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `require2fa` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `reviewUrl` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Quote` ADD COLUMN `publicToken` VARCHAR(191) NULL,
    ADD COLUMN `respondedAt` DATETIME(3) NULL,
    ADD COLUMN `responseNote` TEXT NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `recoveryCodes` JSON NULL,
    ADD COLUMN `totpEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `totpSecret` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `DriverSettlement` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `periodFrom` DATETIME(3) NOT NULL,
    `periodTo` DATETIME(3) NOT NULL,
    `driverName` VARCHAR(191) NOT NULL,
    `vatRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `payTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `expenseTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `grossTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DriverSettlement_organizationId_userId_idx`(`organizationId`, `userId`),
    UNIQUE INDEX `DriverSettlement_organizationId_number_key`(`organizationId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RouteTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `transportMode` ENUM('DRIVEN', 'TRAILER', 'TRUCK') NOT NULL DEFAULT 'DRIVEN',
    `pickupName` VARCHAR(191) NULL,
    `pickupStreet` VARCHAR(191) NULL,
    `pickupZip` VARCHAR(191) NULL,
    `pickupCity` VARCHAR(191) NULL,
    `pickupContact` VARCHAR(191) NULL,
    `pickupPhone` VARCHAR(191) NULL,
    `deliveryName` VARCHAR(191) NULL,
    `deliveryStreet` VARCHAR(191) NULL,
    `deliveryZip` VARCHAR(191) NULL,
    `deliveryCity` VARCHAR(191) NULL,
    `deliveryContact` VARCHAR(191) NULL,
    `deliveryPhone` VARCHAR(191) NULL,
    `distanceKm` DECIMAL(10, 1) NULL,
    `durationMinutes` INTEGER NULL,
    `pricingType` ENUM('FLAT', 'PER_KM') NOT NULL DEFAULT 'FLAT',
    `price` DECIMAL(10, 2) NULL,
    `pricePerKm` DECIMAL(10, 2) NULL,
    `returnType` VARCHAR(191) NOT NULL DEFAULT 'NONE',
    `returnFlat` DECIMAL(10, 2) NULL,
    `returnPerKm` DECIMAL(10, 2) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RouteTemplate_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `hash` VARCHAR(191) NOT NULL,
    `bookingDate` DATETIME(3) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `counterparty` VARCHAR(191) NULL,
    `purpose` TEXT NULL,
    `invoiceId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BankTransaction_organizationId_hash_key`(`organizationId`, `hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TradePlate` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `plate` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'RED',
    `validUntil` DATETIME(3) NULL,
    `notes` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TradePlate_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RouteCache` (
    `key` VARCHAR(191) NOT NULL,
    `km` DECIMAL(10, 1) NOT NULL,
    `minutes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Customer_portalToken_key` ON `Customer`(`portalToken`);

-- CreateIndex
CREATE UNIQUE INDEX `Order_feedbackToken_key` ON `Order`(`feedbackToken`);

-- CreateIndex
CREATE INDEX `Order_settlementId_idx` ON `Order`(`settlementId`);

-- CreateIndex
CREATE INDEX `Order_collectiveInvoiceId_idx` ON `Order`(`collectiveInvoiceId`);

-- CreateIndex
CREATE UNIQUE INDEX `Quote_publicToken_key` ON `Quote`(`publicToken`);

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_settlementId_fkey` FOREIGN KEY (`settlementId`) REFERENCES `DriverSettlement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_collectiveInvoiceId_fkey` FOREIGN KEY (`collectiveInvoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_tradePlateId_fkey` FOREIGN KEY (`tradePlateId`) REFERENCES `TradePlate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_settlementId_fkey` FOREIGN KEY (`settlementId`) REFERENCES `DriverSettlement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inquiry` ADD CONSTRAINT `Inquiry_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DriverSettlement` ADD CONSTRAINT `DriverSettlement_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RouteTemplate` ADD CONSTRAINT `RouteTemplate_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RouteTemplate` ADD CONSTRAINT `RouteTemplate_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankTransaction` ADD CONSTRAINT `BankTransaction_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankTransaction` ADD CONSTRAINT `BankTransaction_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TradePlate` ADD CONSTRAINT `TradePlate_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

