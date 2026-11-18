-- M6: images re-encoded without EXIF/XMP/C2PA metadata.
ALTER TABLE "content_image" ADD COLUMN "metadata_stripped" BOOLEAN NOT NULL DEFAULT false;
