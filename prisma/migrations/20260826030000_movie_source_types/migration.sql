-- Movie-database ingestion source types (M32):
--   htmllist — configurable HTML listing adapter (Filmaffinity, SensaCine, ...)
--   imdb     — official IMDb public dataset adapter (datasets.imdbws.com)
ALTER TYPE "ContentSourceType" ADD VALUE 'htmllist';
ALTER TYPE "ContentSourceType" ADD VALUE 'imdb';
