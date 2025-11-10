import { initCanvas } from "./canvas.js";
import { createSocket } from "./websocket.js";

let tool = "pencil";
const canvasEl = document.getElementById("board");
const { api: canvasAPI, setCompositeMode } = initCanvas(canvasEl, {
  color: document.getElementById("color").value,
  size: +document.getElementById("size").value
});

// ensure fresh blank canvas on every load
canvasAPI.clear();

// ==== Tool UI ====
function setTool(next) {
  tool = next;
  document.querySelectorAll(".tool").forEach(b => b.classList.remove("active"));
  document.getElementById(next === "pencil" ? "tool-pencil" : "tool-eraser").classList.add("active");
  setCompositeMode(next === "eraser" ? "destination-out" : "source-over");
}
document.getElementById("tool-pencil").onclick = () => setTool("pencil");
document.getElementById("tool-eraser").onclick = () => setTool("eraser");
document.getElementById("color").oninput = e => canvasAPI.setStyle({ color: e.target.value });
document.getElementById("size").oninput  = e => canvasAPI.setStyle({ size: +e.target.value });

// ==== Socket ====
const socket = createSocket();

// 🚫 No auto-join, no localStorage. User must click Join every time.
document.getElementById("join").onclick = () => {
  const roomId = document.getElementById("roomId").value.trim() || "public";
  const color = document.getElementById("color").value;
  canvasAPI.clear(); // fresh canvas when joining a room
  socket.emit("room:join", { roomId, user: { name: `User-${Math.floor(Math.random()*1000)}`, color } });
};

// ==== Remote handlers ====
socket.on("room:init", ({ users, ops }) => {
  renderUsers(users);
  // Do NOT replay old ops on join to keep it blank on fresh joins:
  // canvasAPI.clear(); // already blank; simply ignore ops
});

socket.on("history:apply", (snapshot) => {
  // Ignore history replays on this client to keep it blank after refresh
  // (If you want undo/redo to affect you after you join, remove this ignore.)
});

socket.on("stroke:chunk", ({ by, points, style }) => { if (points?.length) canvasAPI.remoteStroke(points, style, by); });
socket.on("erase:chunk",  ({ by, points, style }) => { if (points?.length) canvasAPI.remoteErase(points, style, by); });
socket.on("stroke:end",   () => canvasAPI.commit());

socket.on("user:joined", ({ users }) => renderUsers(users));
socket.on("user:left",   ({ users }) => renderUsers(users));

// ==== Latency display ====
setInterval(() => {
  const t0 = performance.now();
  socket.emit("ping:latency");
  socket.once("pong:latency", () => {
    document.getElementById("latency").textContent = `${Math.round(performance.now()-t0)} ms`;
  });
}, 1500);

// ==== Users list ====
const usersEl = document.getElementById("users");
function renderUsers(list) {
  if (!list) return;
  usersEl.innerHTML = list.map(u => `<li><span style="color:${u.color}">●</span> ${u.name} (${u.id.slice(0,4)})</li>`).join("");
}

// ==== Drawing + steady sending ====
let drawing = false;
let buffer = [];
let lastFrame = 0;

function flushBuffer() {
  if (!buffer.length) return;
  socket.emit(tool === "pencil" ? "stroke:chunk" : "erase:chunk", { points: buffer, style: canvasAPI.getStyle() });
  buffer = [];
}
function rafLoop(ts) {
  if (drawing && ts - lastFrame > 16) { // ~60 fps
    flushBuffer();
    lastFrame = ts;
  }
  requestAnimationFrame(rafLoop);
}
requestAnimationFrame(rafLoop);

canvasEl.addEventListener("pointerdown", (e) => {
  drawing = true;
  buffer = [];
  const p0 = canvasAPI.beginStroke(e);
  buffer.push(p0); // send first point immediately
});
canvasEl.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const p = canvasAPI.drawTo(e);
  buffer.push(p);
});
window.addEventListener("pointerup", () => {
  if (!drawing) return;
  drawing = false;
  flushBuffer(); // send tail
  socket.emit("stroke:end", { ts: Date.now() });
});

// ==== Undo/Redo (optional). If you want blank-only behavior, you can disable these.
// document.getElementById("undo").onclick = () => socket.emit("history:undo");
// document.getElementById("redo").onclick = () => socket.emit("history:redo");
