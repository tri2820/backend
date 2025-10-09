from sklearn.cluster import AffinityPropagation
import numpy as np

# Assuming your embeddings are in a NumPy array called 'embeddings'
embeddings = np.random.rand(1000, 2048)  # Example random data

# Create an AffinityPropagation object
# - damping: Damping factor between 0.5 and 1.
# - preference: Controls how many exemplars are used.
clustering = AffinityPropagation(damping=0.9)

# Fit the model
clustering.fit(embeddings)

# The cluster labels are in clustering.labels_
labels = clustering.labels_

# The number of clusters is the number of unique labels
n_clusters = len(set(labels))

print(f"Number of clusters found: {n_clusters}")

# Create a dictionary to hold the embeddings for each cluster
grouped_embeddings = {}
for label in set(labels):
    # Use boolean indexing to get the embeddings for the current label
    grouped_embeddings[label] = embeddings[labels == label]

# Now you can access the embeddings for each group
# For example, to get the embeddings for cluster 0:
# print("\nEmbeddings in cluster 0:")
# print(grouped_embeddings[0])

# To print the number of embeddings in each cluster:
print("\nNumber of embeddings in each cluster:")
for cluster_id, group in grouped_embeddings.items():
    print(f"Cluster {cluster_id}: {len(group)} embeddings")