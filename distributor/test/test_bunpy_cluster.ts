// cluster.ts
import { python } from "bun_python";

// 1. Import modules. The .import() method returns a friendly proxy.
const np = python.import("numpy");
const { AffinityPropagation } = python.import("sklearn.cluster");
const builtins = python.builtins;

// 2. Create data. np.random.rand() is a simple method call the proxy handles perfectly.
const embeddings = np.random.rand(100, 128);

// 3. Instantiate a class with named arguments.
// This requires the special `python.kw` tagged template for each argument.
const clustering = AffinityPropagation(
    python.kw`damping=${0.9}`,
    python.kw`random_state=${0}`
);

// 4. Fit the model. A standard method call.
clustering.fit(embeddings);

// 5. Get an attribute. The proxy handles this.
const labels = clustering.labels_;

console.log('labels', labels.tolist().valueOf());

// // 6. Use Python's built-in functions.
// const unique_labels = builtins.set(labels);
// const n_clusters = builtins.len(unique_labels);

// // Use .valueOf() to convert the Python int to a JS number for printing.
// console.log(`\nNumber of clusters found: ${n_clusters.valueOf()}`);

// // 7. Group the embeddings.
// const grouped_embeddings = python.dict();

// // The `for...of` loop works because the proxy implements the iterator symbol.
// for (const label of unique_labels) {
//     // Perform a boolean comparison.
//     // Operator overloading (==) is not supported, so we call the explicit numpy function.
//     const mask = np.equal(labels, label);

//     // Perform boolean array indexing. This is a complex operation the proxy
//     // doesn't handle. We must use the reliable __getitem__ dunder method.
//     const group = embeddings.__getitem__(mask);

//     // Set a key in the Python dictionary. To avoid ambiguity with attribute
//     // setting, we use the reliable __setitem__ dunder method.
//     grouped_embeddings.__setitem__(label, group);
//     // This works too but the key is convert to string internally:
//     // grouped_embeddings[label] = group;
// }

// // 8. Print the results.
// for (const [cluster_id, group] of grouped_embeddings.items()) {
//     const group_size = builtins.len(group);
//     // .valueOf() is needed to get JS primitives for console.log.
//     console.log(`Cluster ${cluster_id.valueOf()}: ${group_size.valueOf()} embeddings`);
// }