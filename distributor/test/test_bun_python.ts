import { python } from "bun_python";

const np = python.import("numpy");
const sys = python.import("sys");

console.log('Python executable:', sys.executable);
const xpoints = np.array([1, 8]);
const ypoints = np.array([3, 10]);
console.log('xpoints', xpoints.toString(), xpoints.__dir__());
console.log('ypoints', ypoints.toString());