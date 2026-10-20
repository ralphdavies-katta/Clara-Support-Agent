import { spawn } from "node:child_process";
import path from "node:path";

// One sync at a time: a second click (or another tab) would classify the same emails twice.
let running = false;

// Runs the existing Python pipeline (fetch_gmail -> classify) and returns its log.
export async function POST() {
  if (running) {
    return Response.json({ ok: false, log: "A sync is already running. Wait for it to finish." }, { status: 409 });
  }
  running = true;

  const root = path.join(/*turbopackIgnore: true*/ process.cwd(), "..");
  const python =
    process.env.PYTHON_BIN ??
    path.join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

  return new Promise<Response>((resolve) => {
    const done = (res: Response) => {
      running = false;
      resolve(res);
    };
    let log = "";
    const proc = spawn(/*turbopackIgnore: true*/ python, ["sync.py"], {
      cwd: root,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
    });
    proc.stdout.on("data", (d) => (log += d));
    proc.stderr.on("data", (d) => (log += d));
    proc.on("error", (err) =>
      done(Response.json({ ok: false, log: `Could not start ${python}: ${err.message}` }, { status: 500 })),
    );
    proc.on("close", (code) =>
      done(Response.json({ ok: code === 0, log: log.slice(-4000) }, { status: code === 0 ? 200 : 500 })),
    );
  });
}
