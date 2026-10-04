# Bumpix importer

Implement the server importer requested after the three-part migration discussion.
The exporter and the final CRM presentation are separate stages. This stage must
provide a usable server command, schema migration, and authenticated read APIs.

Input is a verified client ZIP, a packages directory with all-clients.index.json,
or a portable ZIP containing that index and the referenced client ZIPs. Resolve
Windows paths from the old index by basename inside the supplied input only.
Validate every manifest, snapshot digest, photo, ID, category, and ownership link
before database writes. Never read session files or contact Bumpix.

The command previews by default. Applying requires an explicit studio ID, active
owner email, and source account key from preview. Do not guess the target studio.
Ambiguous contacts/names block the batch unless resolved by an explicit mapping.
Mappings may link existing clients or explicitly allow creating a distinct one.
Existing client fields are not overwritten when linked. Changed imported source
snapshots may update fields only through a three-way comparison with the previous
source values; conflicting CRM edits block the batch.

Create native Client and profile ClientNote records, and dedicated Bumpix client,
event, and media records. Preserve all raw/profile/lookups fields and every source
event status/category/comment/date/service/master/amount. Do not insert native
Lesson, Reservation, Payment, or notification records: source completion does not
prove attendance/payment, and the current attendance worker must not settle old
imports. A later CRM stage can activate future bookings after mapping resources.
Expose the preserved statuses and media through scoped read APIs for that stage.

Use unique source account/ID constraints within a studio. Source IDs stay strings.
Use the existing studio row lock and per-client transactions. Media lives in
uploads/bumpix, addressed by SHA-256, outside public static files. Validate copied
bytes before commit; retain successfully imported cards on interruption; repeat
skips unchanged verified cards and repairs missing media without duplicate rows.
Reports distinguish created, linked, updated, skipped, conflicts and incomplete.

No production DB access, migrations, notifications, commits, pushes or deployment
by the assistant. Tests use fictional archives and isolated SQLite databases.
Install only reviewed files, preserving all pre-existing working tree changes.
