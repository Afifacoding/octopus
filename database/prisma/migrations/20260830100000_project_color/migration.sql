-- CreateEnum
CREATE TYPE "ProjectColor" AS ENUM ('BLUE', 'PURPLE', 'PINK', 'RED', 'ORANGE', 'YELLOW', 'GREEN', 'TEAL', 'CYAN', 'GRAY');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "color" "ProjectColor";
