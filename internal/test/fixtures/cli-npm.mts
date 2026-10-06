/** Bounded registry fixture; never communicates with the npm service. */
const mode = process.argv[2];
if (mode === "versions") process.stdout.write(JSON.stringify(["999.0.0"]));
else if (mode === "status") process.stdout.write(JSON.stringify(process.argv[3]));
else if (mode === "auth-failure") {
  process.stdout.write(JSON.stringify({ error: { code: "E401", summary: "sensitive diagnostic omitted" } }));
  process.exitCode = 1;
} else throw new Error("Unsupported npm fixture mode.");
