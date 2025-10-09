import * as lancedb from "@lancedb/lancedb";
import * as arrow from "apache-arrow";
import fs from 'fs/promises';

/**
 * Initializes the database and creates the table schema.
 */
export async function initializeDatabase(opts: {
    databasePath: string; overwrite: boolean; embeddingDimension: number

}): Promise<lancedb.Connection> {
    console.log(`Initializing database at ${opts.databasePath}...`);
    const db = await lancedb.connect(opts.databasePath);
    console.log("Connected to database.");
    const tableNames = await db.tableNames();
    const tableExists = tableNames.includes('media_units');
    console.log("Existing tables:", tableNames);

    if (opts.overwrite || !tableExists) {
        const schema = new arrow.Schema([
            new arrow.Field('id', new arrow.Utf8()),
            new arrow.Field('tenant_id', new arrow.Utf8()),
            new arrow.Field('media_id', new arrow.Utf8()),
            new arrow.Field('at_time', new arrow.Timestamp(arrow.TimeUnit.MILLISECOND)),
            new arrow.Field('path', new arrow.Utf8()),
            new arrow.Field('description', new arrow.Utf8(), true),
            new arrow.Field('embedding', new arrow.FixedSizeList(opts.embeddingDimension, new arrow.Field('item', new arrow.Float32(), true)), true),
        ]);
        await db.createTable({ name: 'media_units', data: [], schema, mode: 'overwrite' });
        console.log("Table 'media_units' created.");

        // TODO: tenant table
    }

    try {
        if (process.env.REBUILD_INDEX === '1') {
            // No harm in trying to create the index again
            console.log("Creating index on embedding...");
            const table = await db.openTable('media_units');
            await table.createIndex("embedding");
            console.log("Index on embedding created.");
        } else {
            console.log("Skipping index creation. Set REBUILD_INDEX=1 to force index creation.");
        }
    } catch (e) {
        // Ignore if cannot create index
        // Might be due to empty table https://github.com/lancedb/lance/issues/3940
    }

    console.log("Database initialization complete.");

    return db;
}

