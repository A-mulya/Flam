export function createSocket() {
  const socket = io();
  socket.on("ping:latency", () => socket.emit("pong:latency"));
  return socket;
}
