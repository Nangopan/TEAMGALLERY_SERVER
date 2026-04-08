-- Allow org + default admin to be inserted in one transaction (circular FKs).
ALTER TABLE "Organisation" DROP CONSTRAINT "Organisation_admin_id_fkey";
ALTER TABLE "Organisation"
  ADD CONSTRAINT "Organisation_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE
  DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "User" DROP CONSTRAINT "User_organization_id_fkey";
ALTER TABLE "User"
  ADD CONSTRAINT "User_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "Organisation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE
  DEFERRABLE INITIALLY IMMEDIATE;
