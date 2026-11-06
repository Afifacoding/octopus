CREATE TYPE "OctoConversationType" AS ENUM ('GENERAL', 'PROJECT');

CREATE TYPE "OctoConversationMessageRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TABLE "OctoConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "conversationType" "OctoConversationType" NOT NULL,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OctoConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OctoConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "OctoConversationMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OctoConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OctoConversation_userId_updatedAt_idx"
    ON "OctoConversation"("userId", "updatedAt" DESC);
CREATE INDEX "OctoConversation_userId_conversationType_updatedAt_idx"
    ON "OctoConversation"("userId", "conversationType", "updatedAt" DESC);
CREATE INDEX "OctoConversation_projectId_idx"
    ON "OctoConversation"("projectId");
CREATE INDEX "OctoConversationMessage_conversationId_createdAt_id_idx"
    ON "OctoConversationMessage"("conversationId", "createdAt", "id");

ALTER TABLE "OctoConversation"
    ADD CONSTRAINT "OctoConversation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OctoConversation"
    ADD CONSTRAINT "OctoConversation_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OctoConversationMessage"
    ADD CONSTRAINT "OctoConversationMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "OctoConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
