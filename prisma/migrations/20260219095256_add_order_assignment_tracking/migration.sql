-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('UNASSIGNED', 'PENDING_ACCEPTANCE', 'ACCEPTED', 'REJECTED', 'REASSIGNED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignmentNotes" TEXT,
ADD COLUMN     "assignmentRespondedAt" TIMESTAMP(3),
ADD COLUMN     "assignmentResponseReason" TEXT,
ADD COLUMN     "assignmentStatus" "AssignmentStatus" DEFAULT 'UNASSIGNED';
