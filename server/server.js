import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createRoomsManager } from "./rooms.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static("client"));
const rooms = createRoomsManager();

io.on("connection", (socket) => {
  let joinedRoomId = null;

  socket.on("room:join", ({ roomId, user }) => {
    if (joinedRoomId) socket.leave(joinedRoomId);
    joinedRoomId = rooms.join(roomId, socket.id, user);
    socket.join(joinedRoomId);

    socket.emit("room:init", {
      users: rooms.getUsers(joinedRoomId),
      ops: rooms.getOps(joinedRoomId)
    });

    socket.to(joinedRoomId).emit("user:joined", { id: socket.id, user });
  });

  socket.on("cursor", (payload) => {
    if (!joinedRoomId) return;
    socket.to(joinedRoomId).emit("cursor", { id: socket.id, ...payload });
  });

  socket.on("stroke:chunk", (chunk) => {
    if (!joinedRoomId) return;
    rooms.pushOp(joinedRoomId, { type: "stroke", data: chunk, by: socket.id });
    socket.to(joinedRoomId).emit("stroke:chunk", { by: socket.id, ...chunk });
  });

  socket.on("erase:chunk", (chunk) => {
    if (!joinedRoomId) return;
    rooms.pushOp(joinedRoomId, { type: "erase", data: chunk, by: socket.id });
    socket.to(joinedRoomId).emit("erase:chunk", { by: socket.id, ...chunk });
  });

  socket.on("stroke:end", (meta) => {
    if (!joinedRoomId) return;
    rooms.pushOp(joinedRoomId, { type: "stroke:end", data: meta, by: socket.id });
    socket.to(joinedRoomId).emit("stroke:end", { by: socket.id, ...meta });
  });

  socket.on("history:undo", () => {
    if (!joinedRoomId) return;
    const changed = rooms.undo(joinedRoomId);
    if (changed) io.to(joinedRoomId).emit("history:apply", rooms.snapshot(joinedRoomId));
  });

  socket.on("history:redo", () => {
    if (!joinedRoomId) return;
    const changed = rooms.redo(joinedRoomId);
    if (changed) io.to(joinedRoomId).emit("history:apply", rooms.snapshot(joinedRoomId));
  });

  socket.on("ping:latency", () => socket.emit("pong:latency"));

  socket.on("disconnect", () => {
    if (!joinedRoomId) return;
    rooms.leave(joinedRoomId, socket.id);
    socket.to(joinedRoomId).emit("user:left", { id: socket.id });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
