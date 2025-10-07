import * as lancedb from "@lancedb/lancedb";

import { initializeDatabase } from "./database";
import path from "path";

export const APP_DIR = process.env.Z_APP_DIR ?? '/home/tri/zapdos_data';
export const FILES_DIR = path.join(APP_DIR, 'files');
export const DATABASE_PATH = path.join(APP_DIR, 'database');
export const DATABASE_EMBEDDING_DIMENSION = 2048;

// Make sure these directories exist
import fs from 'fs/promises';
import { maskedMediaUnit } from "./handlers/rest/utils";
await fs.mkdir(APP_DIR, { recursive: true });
await fs.mkdir(FILES_DIR, { recursive: true });
await fs.mkdir(DATABASE_PATH, { recursive: true });

export type MediaUnit = {
    id: string;
    tenant_id: string;
    description?: string | null;
    embedding?: number[] | null;
    at_time: Date;
    media_id: string;
    path: string;
}


export const connection = await initializeDatabase({
    databasePath: DATABASE_PATH,
    overwrite: false,
    embeddingDimension: DATABASE_EMBEDDING_DIMENSION
});
export const table_media_units = await connection.openTable('media_units');



let media_unit_rows: MediaUnit[] = []
let add_media_unit_timeout: NodeJS.Timeout | null = null;
export function addMediaUnit(mediaUnit: MediaUnit) {
    try {
        media_unit_rows.push({
            ...mediaUnit,
            at_time: new Date(mediaUnit.at_time),
            description: mediaUnit.description ?? null,
            embedding: mediaUnit.embedding ? mediaUnit.embedding : null,
        });

        if (add_media_unit_timeout) clearTimeout(add_media_unit_timeout);

        // If we have more than 100 rows, add immediately
        if (media_unit_rows.length > 100) {
            const toAdd = media_unit_rows;
            media_unit_rows = [];
            table_media_units.add(toAdd);
            return;
        }

        add_media_unit_timeout = setTimeout(async () => {
            try {
                const toAdd = media_unit_rows;
                media_unit_rows = [];
                await table_media_units.add(toAdd);
            } catch (e) {
                console.error('Error adding media unit batch in timeout', e);
            }
        }, 3000);
    } catch (e) {
        console.error('Error adding media unit outer', e);
    }
}


export function partialMediaUnitToUpdate(mediaUnit: Partial<MediaUnit> & { id: string }, coalesce?: Record<string, any>) {

    const update: Record<string, any> = {};
    for (const key in mediaUnit) {
        if (mediaUnit[key as keyof Partial<MediaUnit>] !== undefined) {
            update[key] = mediaUnit[key as keyof Partial<MediaUnit>];
        }
    }

    for (const key in coalesce) {
        if (update[key] === undefined || update[key] === null) {
            update[key] = coalesce[key];
        }
    }

    return update;
}

/**
 * Updates a media unit record in the database using the native update method.
 */
export async function updateMediaUnit(mediaUnit: Partial<MediaUnit> & { id: string }): Promise<void> {
    try {
        const update = partialMediaUnitToUpdate(mediaUnit);
        await table_media_units.update({
            where: `id = '${mediaUnit.id}'`,
            values: update
        });
    } catch (error) {
        console.error("Error updating media unit:", error);
    }
}

export async function updateMediaUnitBatch(mediaUnits: (Partial<MediaUnit> & { id: string })[]): Promise<void> {
    try {
        // Temporary fix before NPM package is updated
        const updates = mediaUnits.map(mu => partialMediaUnitToUpdate(mu, { embedding: null }));
        await table_media_units.mergeInsert("id")
            .whenMatchedUpdateAll()
            // ignore unmatched (not inserted)
            .execute(updates);
    } catch (error) {
        console.error("Error updating media unit batch:", error);
    }
}


/**
 * Searches for media units by embedding similarity.
 */
export async function searchMediaUnitsByEmbedding(queryEmbedding: number[]): Promise<(MediaUnit & { _distance: number })[] | null> {
    try {
        const results = table_media_units.search(queryEmbedding).where('description IS NOT NULL').limit(20);
        const resultArray = await results.toArray();
        return resultArray;
    } catch (error) {
        console.error("Error searching media units by embedding:", error);
        return null;
    }
}

// Note: this function does not guarantee order of results (sort after query)
// to guarantee order, need sort before query (lanceDB currently does not support order by in search)
// There is a ticket to add this feature on GitHub
/**
 * Retrieves media units with pagination and filtering by tenant_id.
 */
export async function getMediaUnitsPaginated(
    tenant_id: string,
    page: number = 1,
    limit: number = 10
): Promise<{ items: Partial<MediaUnit>[], total: number } | null> {
    try {
        const where = `tenant_id = '${tenant_id}'`;

        // Get total count for the given tenant_id
        const total = await table_media_units.countRows(where);

        // Calculate offset based on page and limit
        const offset = (page - 1) * limit;

        // Query with where clause, limit, and offset for pagination
        const query = table_media_units.query()
            .where(where)
            .limit(limit)
            .offset(offset);

        const results = await query.toArray()

        // Sort the results by at_time in descending order
        const sortedResults = results.sort((a, b) =>
            new Date(b.at_time).getTime() - new Date(a.at_time).getTime()
        );

        const items = sortedResults.map(item => ({ description: item.description, id: item.id, media_id: item.media_id, at_time: item.at_time }));

        return {
            items,
            total
        };
    } catch (error) {
        console.error("Error retrieving paginated media units:", error);
        return null;
    }
}

export async function getMediaUnitById(id: string, tenant_id: string): Promise<MediaUnit | null> {
    try {
        const results = await table_media_units.query().where(`id = '${id}' AND tenant_id = '${tenant_id}'`).limit(1).toArray();
        if (results.length === 0) return null;
        return results[0];
    } catch (error) {
        console.error("Error retrieving media unit by id:", error);
        return null;
    }
}



// For testing
// If run this file directly, try dumping the table
if (require.main === module) {
    const mediaUnits = await table_media_units.query().where('description IS NOT NULL').limit(10).toArray() as (MediaUnit)[];
    console.log(JSON.stringify(mediaUnits.map(mu => ({ id: mu.id, description: mu.description, tenant_id: mu.tenant_id })), null, 2));
}