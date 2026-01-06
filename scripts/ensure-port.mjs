import net from "node:net";

const [portArg, serviceName = "Service"] = process.argv.slice(2);
const port = Number(portArg);

if (!portArg || Number.isNaN(port)) {
  console.error("Usage: node scripts/ensure-port.mjs <port> <service-name>");
  process.exit(1);
}

const server = net.createServer();
server.unref();

server.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "EADDRINUSE") {
      console.error(
        `${serviceName} cannot start because port ${port} is already in use.`,
      );
      console.error(`Stop the process using port ${port} and try again.`);
      process.exit(1);
    }
    if (error.code === "EACCES") {
      console.error(
        `${serviceName} cannot start because port ${port} is not accessible.`,
      );
      process.exit(1);
    }
  }

  console.error(`${serviceName} failed to check port ${port}.`, error);
  process.exit(1);
});

server.listen({ port, host: "127.0.0.1" }, () => {
  server.close(() => process.exit(0));
});
