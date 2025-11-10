export function createDrawingState() {
  const ops = [];
  const redoStack = [];

  function push(op) {
    ops.push(op);
    redoStack.length = 0; // clear redo after a new op
  }
  function undo() {
    if (!ops.length) return false;
    redoStack.push(ops.pop());
    return true;
  }
  function redo() {
    if (!redoStack.length) return false;
    ops.push(redoStack.pop());
    return true;
  }
  function snapshot() {
    return { ops };
  }
  return { ops, push, undo, redo, snapshot };
}
