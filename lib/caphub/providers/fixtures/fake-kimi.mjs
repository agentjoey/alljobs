import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import net from "node:net";

const scenario = process.env.FAKE_KIMI_SCENARIO ?? "success";

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function connectResult(host, port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

if (scenario === "malformed") {
  process.stdout.write("not-json\n");
} else if (scenario === "tool") {
  emit({ type: "tool_call", name: "shell" });
} else if (scenario === "flood") {
  process.stdout.write("x".repeat(2 * 1024 * 1024));
} else if (scenario === "hang") {
  setInterval(() => undefined, 1000);
} else if (scenario === "probe") {
  const specification = JSON.parse(readFileSync(process.env.CAPHUB_PROBE_FILE, "utf8"));
  const deniedReads = [];
  for (const item of specification.reads) {
    try {
      readFileSync(item.path);
    } catch {
      deniedReads.push(item.label);
    }
  }
  let outsideWriteDenied = false;
  try {
    writeFileSync(specification.outsideWritePath, "blocked");
  } catch {
    outsideWriteDenied = true;
  }
  const nestedProcessDenied = spawnSync("/bin/echo", ["blocked"]).error !== undefined;
  const directNetworkDenied = !(await connectResult("1.1.1.1", 443));
  const loopbackReachable = await connectResult("127.0.0.1", specification.loopbackPort);
  emit({
    type: "result",
    subtype: "success",
    result: JSON.stringify({
      deniedReads,
      outsideWriteDenied,
      nestedProcessDenied,
      directNetworkDenied,
      loopbackReachable
    }),
    usage: { input_tokens: 7, output_tokens: 3 }
  });
} else {
  emit({ type: "system", message: "ready" });
  emit({ type: "assistant", message: { content: [{ type: "text", text: '{"answer":"same"}' }] } });
  emit({
    type: "result",
    subtype: "success",
    result: '{"answer":"same"}',
    usage: { input_tokens: 7, output_tokens: 3 }
  });
}
