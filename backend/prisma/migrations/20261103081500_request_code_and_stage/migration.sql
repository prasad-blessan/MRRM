-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "stage" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "requests_code_key" ON "requests"("code");

