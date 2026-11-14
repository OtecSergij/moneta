-- A transfer with both of its accounts deleted has no account page left to
-- appear on. The FK's SET NULL is an UPDATE of the place column, so the
-- trigger fires on every path that empties the second place.
CREATE FUNCTION "transfers_delete_orphan"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "public"."transfers" WHERE "id" = NEW."id";
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "transfers_delete_orphan_trg"
AFTER INSERT OR UPDATE OF "from_account_id", "to_account_id" ON "transfers"
FOR EACH ROW
WHEN (NEW."from_account_id" IS NULL AND NEW."to_account_id" IS NULL)
EXECUTE FUNCTION "transfers_delete_orphan"();
