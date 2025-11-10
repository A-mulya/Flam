export function initCanvas(canvas, initialStyle) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const first = canvas.width === 0;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!first) redrawAll();
  }
  window.addEventListener("resize", fit);

  let style = { color: initialStyle.color, size: initialStyle.size, composite: "source-over" };
  const ops = [];

  // per-remote-user renderer state
  const remotes = new Map(); // id -> {carry:{x,y}|null, style, queue:[]}

  function setCompositeMode(mode) { style.composite = mode; }
  function setStyle(part) { style = { ...style, ...part }; }
  function getStyle() { return { color: style.color, size: style.size, composite: style.composite }; }
  function clear() { ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight); ops.length = 0; }

  // util
  const dist = (a,b)=>Math.hypot(a.x-b.x, a.y-b.y);
  function densify(from, pts, step=2) {
    // ensure there are intermediate points if big gaps
    const out = [];
    let prev = from;
    for (const p of pts) {
      if (prev) {
        const d = dist(prev, p);
        if (d > step) {
          const n = Math.floor(d/step);
          for (let i=1;i<n;i++){
            const t = i/n;
            out.push({ x: prev.x + (p.x-prev.x)*t, y: prev.y + (p.y-prev.y)*t });
          }
        }
      }
      out.push(p);
      prev = p;
    }
    return out;
  }

  // primitive draw (fast)
  function drawLine(a, b, s) {
    ctx.save();
    ctx.globalCompositeOperation = s.composite || "source-over";
    ctx.strokeStyle = s.color || "#000";
    ctx.lineWidth = s.size || 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }
  function drawDot(p, s) {
    ctx.save();
    ctx.globalCompositeOperation = s.composite || "source-over";
    ctx.fillStyle = s.color || "#000";
    ctx.beginPath();
    ctx.arc(p.x, p.y, (s.size || 4)/2, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // local draw
  function beginStroke(e) {
    const p = toLocal(e);
    ops.push({ type:"stroke", points:[p], style:getStyle() });
    return p;
  }
  function drawTo(e) {
    const p = toLocal(e);
    const last = ops[ops.length-1];
    if (last && last.type === "stroke") {
      const prev = last.points[last.points.length-1];
      last.points.push(p);
      if (prev) drawLine(prev, p, last.style);
      else drawDot(p, last.style);
    }
    return p;
  }

  // remote draw with continuity + densify + single-point support
  function remoteStroke(points, s, by) {
    const entry = remotes.get(by) || { carry:null, style:s, queue:[] };
    entry.style = s;
    const pts = entry.carry ? densify(entry.carry, points) : points.slice();
    if (entry.carry && pts.length === 0) pts.push(entry.carry);
    if (!entry.carry && pts.length === 1) drawDot(pts[0], s);
    for (let i=1;i<pts.length;i++) drawLine(pts[i-1], pts[i], s);
    entry.carry = pts.at(-1) || entry.carry;
    remotes.set(by, entry);
  }
  function remoteErase(points, s, by) {
    const ss = { ...s, composite:"destination-out" };
    remoteStroke(points, ss, by);
  }
  function commit() {
    // end of stroke -> reset carries
    remotes.forEach(e => { e.carry = null; e.queue = []; });
  }

  // replay (for undo/redo)
  function replay(snapshotOps) {
    ops.length = 0;
    ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);
    for (const op of snapshotOps) {
      const t = op.type; const d = op.data ?? op;
      if (t === "stroke") {
        const ps = d.points ?? [];
        if (ps.length === 1) drawDot(ps[0], d.style);
        for (let i=1;i<ps.length;i++) drawLine(ps[i-1], ps[i], d.style);
      }
      if (t === "erase") {
        const s = { ...(d.style ?? {}), composite:"destination-out" };
        const ps = d.points ?? [];
        if (ps.length === 1) drawDot(ps[0], s);
        for (let i=1;i<ps.length;i++) drawLine(ps[i-1], ps[i], s);
      }
    }
  }

  function redrawAll(){ replay(ops); }
  function toLocal(e){ const r=canvas.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }

  fit();

  return {
    api: { setStyle, getStyle, clear, replay, beginStroke, drawTo, remoteStroke, remoteErase, commit },
    setCompositeMode
  };
}
