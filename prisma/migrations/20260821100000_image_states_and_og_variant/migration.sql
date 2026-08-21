-- Extend content status lifecycle with an explicit retryable state
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'retryable';
-- Add og (open graph) asset kind
ALTER TYPE "AssetKind" ADD VALUE IF NOT EXISTS 'og';
