-- AlterTable
ALTER TABLE "student_details" ADD COLUMN IF NOT EXISTS "class_id" INTEGER;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_details_class_id_fkey'
  ) THEN
    ALTER TABLE "student_details" ADD CONSTRAINT "student_details_class_id_fkey"
      FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
