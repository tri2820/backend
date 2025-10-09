# The `bun_python` Cookbook: Patterns, Examples, and Best Practices

This guide provides practical examples and explains the core philosophy for working effectively with the `bun_python` library. Understanding these patterns will help you write clean, correct, and robust code that seamlessly bridges JavaScript and Python.

## The Golden Rule of `bun_python`

> **The Proxy is for convenience; Dunder Methods are for correctness.**

The library's proxy object is a powerful convenience layer that makes simple operations look like native JavaScript. However, it has limitations. For any operation that is complex, ambiguous, or relies on a non-string key, you must bypass the proxy and call Python's special "dunder" (double underscore) methods directly for guaranteed correctness.

---

## 1. Setup and Basic Operations

### 1.1. Importing Python Modules
The easiest way to import is using `python.import()`, which returns a user-friendly proxy.

```typescript
import { python } from "bun_python";

// Import standard libraries
const sys = python.import("sys");
const np = python.import("numpy");

// Import a specific class or function from a module
const { AffinityPropagation } = python.import("sklearn.cluster");
```

### 1.2. Checking the Python Environment
You can interact with modules like `sys` to understand the Python environment Bun is using.

```typescript
// Common Code: Get Python version and executable path
console.log("Python Version:", sys.version.toString());
console.log("Python Executable:", sys.executable.toString());```

## 2. Calling Python Functions and Methods

### 2.1. Positional Arguments
Pass arguments directly. The library handles the conversion of JS primitives to Python types.

```typescript
const math = python.import("math");

// Python: math.pow(2, 8)
const result = math.pow(2, 8);
console.log(result.valueOf()); // 256
```

### 2.2. Keyword (Named) Arguments (The `kw` Trick)
This is a critical pattern to master. You **must** use the `python.kw` tagged template literal for each named argument.

```typescript
const { AffinityPropagation } = python.import("sklearn.cluster");

// Python: AffinityPropagation(damping=0.9, random_state=0)
const clustering = AffinityPropagation(
  python.kw`damping=${0.9}`,
  python.kw`random_state=${0}`
);
```
**Why?** This syntax is required for the library to correctly parse the argument's name and value. An object like `{ damping: 0.9 }` will not work.

## 3. Data Handling: The JavaScript <-> Python Bridge

### 3.1. Getting JavaScript Values from Python (`.valueOf()`)
Python objects returned to JS are wrapped in a proxy. To get the raw JavaScript equivalent (if one exists), use `.valueOf()`.

```typescript
const py_list = python.list([10, 20, 30]);
const js_array = py_list.valueOf(); // Converts to JS Array: [10, 20, 30]

const n_clusters = python.int(5);
const js_number = n_clusters.valueOf(); // Converts to JS Number: 5

console.log(Array.isArray(py_list));   // false
console.log(Array.isArray(js_array)); // true
```**Note:** `.valueOf()` is a shallow conversion. If a list contains complex Python objects, those objects will remain as proxies inside the new JS array.

### 3.2. Simulating a Python List Comprehension
There is no direct list comprehension syntax. The common pattern is to get a JS array using `.valueOf()` and then use standard JS array methods like `.map()`.

```typescript
const numbers = python.list([1, 2, 3, 4]);

// Python: [x * x for x in numbers]
const squares = numbers.valueOf().map((x: number) => x * x);
console.log(squares); // [1, 4, 9, 16]
```

## 4. Item Access: The Dunder Method Rule in Action

This is where the Golden Rule is most important.

### 4.1. Dictionary Access
- **String Keys**: Direct assignment is convenient for plain dicts, but `__setitem__` is safer.
- **Non-String Keys**: You **MUST** use `__setitem__` and `__getitem__`.

```typescript
const grouped_embeddings = python.dict();
const label_int = python.int(0); // An integer key
const label_str = "group_0";     // A string key

// --- Setting Items ---
// CORRECT (for non-string keys):
grouped_embeddings.__setitem__(label_int, some_group_data);

// CONVENIENT (for string keys):
grouped_embeddings[label_str] = some_other_data;

// --- Getting Items ---
// CORRECT (for non-string keys):
const group = grouped_embeddings.__getitem__(label_int);

// CONVENIENT (for string keys):
const other_group = grouped_embeddings[label_str];
```

### 4.2. Advanced NumPy Indexing (Boolean Masking)
The proxy cannot understand NumPy's array masking. You **MUST** use `np.equal` (or other comparison functions) to create a mask and then use `__getitem__` to apply it.

```typescript
const np = python.import("numpy");

const embeddings = np.random.rand(10, 5);
const labels = np.array([0, 1, 0, 1, 1, 0, 0, 1, 0, 1]);

// Python: group_1_embeddings = embeddings[labels == 1]

// 1. Create the boolean mask using a direct numpy function call
const mask = np.equal(labels, 1);

// 2. Apply the mask using the __getitem__ dunder method
const group_1_embeddings = embeddings.__getitem__(mask);

console.log(group_1_embeddings.shape.toString()); // e.g., "(5, 5)"
```

## 5. Common Python Patterns in `bun_python`

### 5.1. Iterating over Python Objects
The proxy correctly implements the JavaScript iterator protocol, making `for...of` loops work naturally.

```typescript
// --- Iterating over a list ---
const py_list = python.list(['a', 'b', 'c']);
for (const item of py_list) {
  console.log(item.toString());
}

// --- Iterating over dictionary items ---
const py_dict = python.dict({ name: "Gemini", version: 1.5 });
// Python: for key, value in my_dict.items():
for (const [key, value] of py_dict.items()) {
  console.log(`${key.toString()}: ${value.toString()}`);
}
```

### 5.2. Handling Python Exceptions
Use a standard JavaScript `try...catch` block. Errors from Python will be thrown as a `PythonError` object, which you can inspect.

```typescript
try {
  const fs = python.import("os");
  // This will fail because the file does not exist
  fs.remove("a_file_that_does_not_exist.tmp");
} catch (e: any) {
  // The error is an instance of PythonError
  console.error("Caught a Python error!");
  
  // The `e.type` and `e.value` are PyObjects
  console.error("Type:", e.type.toString());   // e.g., "<class 'FileNotFoundError'>"
  console.error("Value:", e.value.toString()); // e.g., "[Errno 2] No such file or directory: ..."
}
```

### 5.3. Using Context Managers (`with` statement)
Python's `with` statement guarantees that cleanup code is run. You can simulate this by manually calling the `__enter__` and `__exit__` dunder methods, typically within a `try...finally` block.

```typescript
const builtins = python.import("builtins");

// Python:
// with open("my_file.txt", "w") as f:
//   f.write("hello")

const file_handler = builtins.open("my_file.txt", "w");
let file_object;
try {
  // Manually call __enter__ to get the file object
  file_object = file_handler.__enter__();
  file_object.write("hello from bun_python");
} finally {
  // The finally block ensures __exit__ is always called, just like `with`
  if (file_object) {
    // Call __exit__ to close the file and clean up resources
    file_handler.__exit__(null, null, null);
  }
}
console.log("File written and closed successfully.");
```