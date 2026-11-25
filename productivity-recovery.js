// The checkpoint is written synchronously BEFORE a network request starts.
// Recover only local changes against their acknowledged base, never an entire
// stale device snapshot. Rewards/completion remain owned by server RPCs.
(() => {
  const collections = ["groups", "tasks", "habits", "habitRecords"];
  const protectedFields = new Set(["created_at", "user_id", "status", "completed_on",
    "completion_reward", "completed_with_free_pass", "completion_cycle_id", "archived_at",
    "completed_at", "completion_level", "recurrence_id"]);
  const key = (name, row) => name === "habitRecords" ? `${row.habit_id}:${row.record_date}` : row.id;
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function recover(server, checkpoint) {
    if (!checkpoint?.base || !checkpoint?.snapshot) return server;
    const result = {};
    for (const name of collections) {
      const base = new Map((checkpoint.base[name] || []).map(row => [key(name, row), row]));
      const rows = new Map((server[name] || []).map(row => [key(name, row), { ...row }]));
      for (const row of checkpoint.snapshot[name] || []) {
        const id = key(name, row), before = base.get(id), remote = rows.get(id);
        // A deletion made on another device wins over an old local edit.
        if (before && !remote) continue;
        const changes = Object.fromEntries(Object.entries(row).filter(([field, value]) =>
          !protectedFields.has(field) && !(field === "scheduled_on" && row.recurrence_id) && (!before || !equal(before[field], value))));
        if (remote) rows.set(id, { ...remote, ...changes });
        else if (name === "tasks") rows.set(id, { ...changes, status: "waiting", focus_seconds: row.focus_seconds || 0 });
        else rows.set(id, changes);
      }
      for (const id of checkpoint.deletes?.[name] || []) rows.delete(id);
      result[name] = [...rows.values()].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }
    const groups = new Set(result.groups.map(row => row.id));
    const habits = new Set(result.habits.map(row => row.id));
    result.tasks.forEach(row => { if (row.group_id && !groups.has(row.group_id)) row.group_id = null; });
    result.habitRecords = result.habitRecords.filter(row => habits.has(row.habit_id));
    return result;
  }
  window.ProductivityRecovery = { recover };
})();
