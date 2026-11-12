-- Additive: plans whose deterministic slots could not all be filled are reported as partial, never ready.
ALTER TYPE "EditorialPlanStatus" ADD VALUE IF NOT EXISTS 'partial';
