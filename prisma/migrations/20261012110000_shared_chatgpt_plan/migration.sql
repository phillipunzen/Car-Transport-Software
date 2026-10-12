CREATE TABLE `ChatgptAppProfile` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `credentials` MEDIUMTEXT NULL,
    `model` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `ChatgptAppProfile_clientId_key`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `ChatgptHost` ADD COLUMN `activeProfileId` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `ChatgptHost_activeProfileId_key` ON `ChatgptHost`(`activeProfileId`);
ALTER TABLE `ChatgptHost` ADD CONSTRAINT `ChatgptHost_activeProfileId_fkey` FOREIGN KEY (`activeProfileId`) REFERENCES `ChatgptAppProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
