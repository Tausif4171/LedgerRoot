# Historical filename recovery

Older uploads could store a narrow no-break space (U+202F), commonly used before AM/PM in screenshot names, as `â` followed by U+0080 and `¯`. The browser sent UTF-8 bytes, but the multipart file-header parser interpreted them as Latin-1.

Current browser uploads send a separate UTF-8 filename field. The legacy file-header fallback now decodes valid UTF-8 bytes and preserves genuine Latin-1 when decoding fails. Explicit filename metadata is not decoded again.

Changing the upload handler does not repair names already stored in the database. From the repository root, preview the narrowly scoped repair against the database configured in `.env`:

```sh
npx tsx scripts/repair-filename-spacing.ts
```

Confirm the database and affected counts before applying:

```sh
npx tsx scripts/repair-filename-spacing.ts --apply
```

The script repairs only that exact corrupted space in Document and SourceRevision filenames. It saves the original IDs and names to a private temporary JSON file before an atomic, concurrency-checked update. Keep that backup somewhere private if long-term retention is needed; do not commit it. Running the repair again should report zero affected names.

This does not reprocess images, change storage keys or checksums, alter extracted/reviewed values, change approval state, or rewrite review history. It is not a general-purpose filename renamer or an automatic database migration.
