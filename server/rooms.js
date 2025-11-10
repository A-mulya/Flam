import { createDrawingState } from "./drawing-state.js";

export function createRoomsManager() {
  const rooms = new Map();

  function ensure(roomId) {
    if (!roomId) roomId = "public";
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Map(),
        state: createDrawingState()
      });
    }
    return roomId;
  }

  return {
    join(roomId, socketId, user) {
      roomId = ensure(roomId);
      rooms.get(roomId).users.set(socketId, user);
      return roomId;
    },
    leave(roomId, socketId) {
      const r = rooms.get(roomId);
      if (!r) return;
      r.users.delete(socketId);

      // ✅ Keep room alive for 5 minutes after last user leaves
      if (r.users.size === 0) {
        setTimeout(() => {
          const stillEmpty = rooms.get(roomId)?.users.size === 0;
          if (stillEmpty) rooms.delete(roomId);
        }, 5 * 60 * 1000);
      }
    },
    getUsers(roomId) {
      const r = rooms.get(roomId);
      return r ? Array.from(r.users, ([id, user]) => ({ id, ...user })) : [];
    },
    pushOp(roomId, op) {
      rooms.get(roomId)?.state.push(op);
    },
    getOps(roomId) {
      return rooms.get(roomId)?.state.ops ?? [];
    },
    undo(roomId) {
      return rooms.get(roomId)?.state.undo();
    },
    redo(roomId) {
      return rooms.get(roomId)?.state.redo();
    },
    snapshot(roomId) {
      return rooms.get(roomId)?.state.snapshot();
    }
  };
}
