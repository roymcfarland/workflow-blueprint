import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

type RunningServer = {
  origin: string;
  stop: () => Promise<void>;
  url: (path: string) => string;
};

function findOpenPort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to reserve a smoke-test port.")));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(origin: string, logs: () => string) {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin, { redirect: "manual" });

      if (response.status < 500) {
        return;
      }

      lastError = new Error(`Server returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Next dev server did not become ready. Last error: ${String(lastError)}\n${logs()}`,
  );
}

function stopProcess(child: ChildProcess) {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    const killChild = (signal: NodeJS.Signals) => {
      if (process.platform === "win32" || child.pid === undefined) {
        child.kill(signal);
        return;
      }

      process.kill(-child.pid, signal);
    };

    const timeout = setTimeout(() => {
      try {
        killChild("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, 5_000);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    try {
      killChild("SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  });
}

export async function startNextServer(): Promise<RunningServer> {
  const port = await findOpenPort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: origin,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const appendOutput = (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-8_000);
  };

  child.stdout?.on("data", appendOutput);
  child.stderr?.on("data", appendOutput);
  child.once("error", (error) => {
    output = `${output}\n${error.stack ?? error.message}`;
  });

  await waitForServer(origin, () => output);

  return {
    origin,
    stop: () => stopProcess(child),
    url: (path) => new URL(path, origin).toString(),
  };
}
