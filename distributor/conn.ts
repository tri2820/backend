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
    at_time: string | Date;
    media_id: string;
    path: string;
}


export const connection = await initializeDatabase({
    databasePath: DATABASE_PATH,
    overwrite: false,
    embeddingDimension: DATABASE_EMBEDDING_DIMENSION
});
export const table_media_units = await connection.openTable('media_units');



let write_queue: {
    type: 'add' | 'update',
    data: MediaUnit | (Partial<MediaUnit> & { id: string })
}[] = []
let write_timeout: NodeJS.Timeout | null = null;

export async function processWriteQueue() {
    const queue = write_queue;
    write_queue = [];
    try {
        const updates = queue.filter(w => w.type === 'update').map(w => w.data as (Partial<MediaUnit> & { id: string }));
        const adds = queue.filter(w => w.type === 'add').map(w => w.data as MediaUnit);
        if (adds.length > 0) {
            console.log(`Processing write queue immediately with ${adds.length} adds and ${updates.length} updates`);
            await table_media_units.add(adds);
        }
        if (updates.length > 0) {
            console.log(`Processing write queue immediately with ${adds.length} adds and ${updates.length} updates`);
            await updateMediaUnitBatch(updates);
        }
    } catch (e) {
        console.error('Error processing write queue inner', e, queue.at(0), queue.at(1));
    }
}

export function processWriteQueue_lazy() {
    if (write_queue.length === 0) return;
    if (write_timeout) clearTimeout(write_timeout);
    if (write_queue.length > 1000) {
        // If more than 100 items, process immediately
        processWriteQueue();
    } else {
        write_timeout = setTimeout(() => {
            processWriteQueue();
        }, 5000);
    }
}

export function addMediaUnit(mediaUnit: MediaUnit) {
    try {
        const addable = {
            ...mediaUnit,
            at_time: new Date(mediaUnit.at_time),
            description: mediaUnit.description ?? null,
            embedding: mediaUnit.embedding ? mediaUnit.embedding : null,
        }

        write_queue.push({
            type: 'add',
            data: addable
        });
        processWriteQueue_lazy();
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


export async function updateMediaUnit(mediaUnit: Partial<MediaUnit> & { id: string }): Promise<void> {
    try {
        write_queue.push({
            type: 'update',
            data: mediaUnit
        });
        processWriteQueue_lazy();
    }
    catch (e) {
        console.error('Error updating media unit outer', e);
    }
}

export async function updateMediaUnitBatch(mediaUnits: (Partial<MediaUnit> & { id: string })[]): Promise<void> {
    try {
        // Temporary fix before NPM package is updated
        const updates = mediaUnits.map(mu => partialMediaUnitToUpdate(mu, { embedding: null }));
        // Merge updates by id
        const mergedUpdates: Record<string, Partial<MediaUnit>> = {};
        for (const update of updates) {
            const id = update.id;
            if (!mergedUpdates[id]) mergedUpdates[id] = {};
            Object.assign(mergedUpdates[id], update);
        }

        const rowUpdates = Object.values(mergedUpdates);

        const result = await table_media_units.mergeInsert("id")
            .whenMatchedUpdateAll()
            // ignore unmatched (not inserted)
            .execute(rowUpdates);

        console.log('updated media units:', result)
    } catch (error) {
        console.error("Error updating media unit batch:", error);
    }
}


/**
 * Searches for media units by embedding similarity.
 */
export async function searchMediaUnitsByEmbedding(queryEmbedding: number[], tenant_id: string): Promise<(MediaUnit & { _distance: number })[] | null> {
    try {
        const results = table_media_units.search(queryEmbedding).where(`description IS NOT NULL AND tenant_id = '${tenant_id}'`).limit(200);
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