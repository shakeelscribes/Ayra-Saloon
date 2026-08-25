# 🚨 RETREAT GUIDE — how to get back to a working build

The working build this project ships from is tagged **`safe-base`**.
Any time anything breaks, you are never more than one command away from it.

---

## ⚡ Emergency retreats

### "The site is broken / I hate the new code"
```powershell
git checkout safe-base
```
That's it — your working tree now matches the last sealed, tested build.
Restart the dev servers and you're back. (`git checkout main` to return to the present.)

### "A feature branch went wrong mid-development"
```powershell
git checkout main
git branch -D feature/broken-branch      # deletes it; main untouched
```

### "I made local commits I regret (not pushed)"
```powershell
git reset --soft HEAD~1     # undo last commit, keep the files
git restore .               # (optional) also discard the file changes
```

### "Everything is on fire, nuke uncommitted changes"
```powershell
git restore .
git clean -fd               # ⚠️ also deletes untracked files — double-check first
```

---

## 🗄️ Database retreats

### Backup now (do this before any backend migration)
```powershell
cd backend
.venv\Scripts\python.exe _backup\export_db.py
```
Dumps land in `backend/_backup/dump/` (gitignored — they stay on this machine).

### Restore from the latest dump
```powershell
cd backend
.venv\Scripts\python.exe _backup\restore_db.py
# type RESTORE to confirm — it replaces collection contents
```

Note: the service catalog also lives in code (`backend/main.py → SERVICE_CATALOG`),
so even a total DB wipe self-heals on backend restart (except the admin user —
keep a backup or re-register).

---

## 📌 Daily rules

1. **Push only on explicit approval** — local commits are free and encouraged.
2. **Never end a session with uncommitted work** — commit locally even if untested.
3. `.env` is never committed. Keep a copy of the Atlas connection string in a
   password manager — git cannot restore it.
4. After merging a PR to `main`, click **Update branch** on the feature branch
   (or `git pull`) so the next round starts clean.
