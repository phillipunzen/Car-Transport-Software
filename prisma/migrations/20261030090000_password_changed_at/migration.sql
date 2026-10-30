-- Zeitpunkt der letzten Passwortänderung: ältere Sitzungen werden ungültig
ALTER TABLE `User` ADD COLUMN `passwordChangedAt` DATETIME(3) NULL;
