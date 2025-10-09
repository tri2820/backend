
import { python } from "bun_python";
import type { Vector } from "apache-arrow";
import type { MediaUnit } from "../conn";

// 1. Import Python libraries using the bun_python bridge
const np = python.import("numpy");
const { AffinityPropagation } = python.import("sklearn.cluster");

export async function buildClusters(search_result: (MediaUnit & { embedding: Vector })[]): Promise<number[] | undefined> {
    try {
        // 2. Prepare the data for Python
        // Extract just the embeddings from your search results
        console.log('call here')
        const embeddings_list = search_result.map(item => item.embedding.toJSON());

        // Convert the JavaScript array of arrays into a NumPy array
        console.log('embeddings_list', embeddings_list.length, embeddings_list[0]);
        const embeddings_np = np.array(embeddings_list);
        console.log("Created NumPy array with shape:", embeddings_np.shape.toString());

        // 3. Initialize and run the AffinityPropagation model
        // We use python.kw for named arguments.
        // `preference` can be adjusted. A smaller value (more negative) leads to fewer clusters.
        // `damping` helps with convergence.
        const clustering_model = AffinityPropagation(
            python.kw`damping=${0.9}`,
            python.kw`random_state=${0}`
        );

        console.log("Fitting the clustering model...");
        clustering_model.fit(embeddings_np);

        // 4. Retrieve cluster labels from the model
        // .labels_ is a NumPy array of cluster assignments for each embedding.
        const labels_py = clustering_model.labels_.tolist();

        // ---- CRITICAL STEP: Move data from Python back to JavaScript ----
        // Use .valueOf() to get a native JavaScript array of numbers
        const labels_js = labels_py.valueOf() as number[];
        console.log(`Clustering complete. Found ${new Set(labels_js).size} clusters.`);
        return labels_js
    } catch (error) {
        console.error("Clustering failed:", error);
        // You could send an error chunk to the client if this is a critical failure
        // sendJsonChunk({ error: "Failed to process clusters." });
    }
}
