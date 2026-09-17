# GitHub SSH — Two Accounts on One Windows PC

Complete guide for this machine. Do the **PowerShell** steps on your PC. Do the **GitHub website** steps in the browser while logged into the correct account.

This project folder:

`D:\TechSuit\Techsuit-InternalApps\TMS-ProjectPlan\TMS-WEB-APP`

GitHub repo this project should use (change if yours is different):

`techsuitegit/techsuite-tms`

---

## What you will set up

| Piece | Purpose |
|---|---|
| Two SSH keys | One key per GitHub account. GitHub does not allow the same key on two accounts. |
| SSH config aliases | `github.com-work` and `github.com-personal` so each project uses the right account. |
| Per-repo Git user | Commit name/email matches that repo’s GitHub user. |
| Per-repo remote URL | Uses the SSH alias, not plain `github.com`. |

Replace placeholders:

- `work@email.com` — email of the GitHub account that owns/has access to **techsuite** repos
- `personal@email.com` — email of the other GitHub account
- `WORK_GITHUB_USER` — GitHub username or org for work (example: `techsuitegit`)
- `PERSONAL_GITHUB_USER` — GitHub username for the other account
- `WORK_NAME` / `PERSONAL_NAME` — name that should appear on commits

---

## Part A — On your system (PowerShell)

Open **PowerShell**. You do **not** need to be inside the project folder until Part D.

### A1. Check whether SSH keys already exist

```powershell
mkdir $env:USERPROFILE\.ssh -Force
Get-ChildItem $env:USERPROFILE\.ssh
```

Folder on this PC:

`C:\Users\SRIPRASAD\.ssh`

If you already see `id_ed25519_work` and `id_ed25519_personal` (and matching `.pub` files), skip A2.

### A2. Create two keys (one per GitHub account)

```powershell
ssh-keygen -t ed25519 -C "work@email.com" -f $env:USERPROFILE\.ssh\id_ed25519_work
ssh-keygen -t ed25519 -C "personal@email.com" -f $env:USERPROFILE\.ssh\id_ed25519_personal
```

Press Enter to accept the path. Set a passphrase if you want one (you will type it when the key is used).

Created files:

- `C:\Users\SRIPRASAD\.ssh\id_ed25519_work`
- `C:\Users\SRIPRASAD\.ssh\id_ed25519_work.pub`
- `C:\Users\SRIPRASAD\.ssh\id_ed25519_personal`
- `C:\Users\SRIPRASAD\.ssh\id_ed25519_personal.pub`

Never share or commit the files **without** `.pub`. Those are private keys.

### A3. Start ssh-agent and load both keys

If `Set-Service` is denied, open PowerShell **as Administrator** for these three lines only.

```powershell
Get-Service ssh-agent | Set-Service -StartupType Manual
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519_work
ssh-add $env:USERPROFILE\.ssh\id_ed25519_personal
```

Confirm:

```powershell
ssh-add -l
```

You should see two keys.

### A4. Create the SSH config file

Path:

`C:\Users\SRIPRASAD\.ssh\config`

Create it:

```powershell
notepad $env:USERPROFILE\.ssh\config
```

Paste this, save, and close:

```
Host github.com-work
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_work
  IdentitiesOnly yes

Host github.com-personal
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_personal
  IdentitiesOnly yes
```

Do not use a plain `Host github.com` block if both accounts are on this PC. SSH may pick the wrong key.

---

## Part B — On GitHub (browser)

Do this **twice**, once per account. Log out of GitHub (or use a private window) so you do not add a key to the wrong user.

### B1. Copy the work public key (PowerShell)

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519_work.pub | Set-Clipboard
```

### B2. Add it to the work GitHub account

1. Log in as the **work** GitHub user.
2. Open: https://github.com/settings/keys
3. Click **New SSH key**.
4. Title: `SRIPRASAD-PC-work`
5. Key type: **Authentication Key**
6. Paste (Ctrl+V).
7. Click **Add SSH key**.

### B3. Copy the personal public key (PowerShell)

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519_personal.pub | Set-Clipboard
```

### B4. Add it to the personal GitHub account

1. Log out, then log in as the **other** GitHub user.
2. Open: https://github.com/settings/keys
3. **New SSH key**
4. Title: `SRIPRASAD-PC-personal`
5. Paste and **Add SSH key**.

### B5. Confirm repo access (work account)

1. Log in as the work user.
2. Open the repo, for example: https://github.com/techsuitegit/techsuite-tms
3. Confirm you can see it (not 404).
4. Confirm you have **write** access (you are an owner/collaborator, or a member of the org with push rights).
5. If you need a `DEV` branch: **branches** → create `DEV` from the default branch, or create it later from PowerShell (Part D).

If the page is 404 while logged in, the repo name/org is wrong or this user has no access. Fix that on GitHub before pushing.

---

## Part C — Test SSH (PowerShell)

Any folder is fine.

```powershell
ssh -T git@github.com-work
ssh -T git@github.com-personal
```

The first time, type `yes` when asked to trust GitHub.

Success looks like:

```
Hi WORK_GITHUB_USER! You've successfully authenticated, but GitHub does not provide shell access.
Hi PERSONAL_GITHUB_USER! You've successfully authenticated, but GitHub does not provide shell access.
```

The two greetings **must** be different usernames. If both say the same user, the keys are mixed up on GitHub — remove the wrong key and add the correct `.pub` to the correct account.

---

## Part D — This TMS project (PowerShell)

All commands below must run in:

```powershell
cd D:\TechSuit\Techsuit-InternalApps\TMS-ProjectPlan\TMS-WEB-APP
```

### D1. Confirm Git is initialized

```powershell
git status
git remote -v
```

You should be on `main` with a commit already made.

### D2. Point origin at the work account over SSH

Use the **alias** `github.com-work`, not `github.com`.

```powershell
git remote set-url origin git@github.com-work:techsuitegit/techsuite-tms.git
git remote -v
```

Both fetch and push should show:

`git@github.com-work:techsuitegit/techsuite-tms.git`

Do **not** run `git remote add origin ...` — origin already exists. Use `set-url` only.

If the GitHub path is different, replace `techsuitegit/techsuite-tms`.

### D3. Set commit identity for this repo only

```powershell
git config user.name "WORK_NAME"
git config user.email "work@email.com"
git config --local --list
```

Do **not** use `--global` if the two GitHub users are different people/accounts.

### D4. Push `main`

```powershell
git push -u origin main
```

Then open https://github.com/techsuitegit/techsuite-tms and confirm the files are there.

### D5. Create local `DEV` and push it

GitHub having a `DEV` branch is not enough. You also need a **local** `DEV` branch.

**If GitHub `DEV` is empty or you just want DEV from your current code:**

```powershell
git checkout -b DEV
git push -u origin DEV
```

**If GitHub `DEV` already has commits you must keep:**

```powershell
git fetch origin
git checkout -b DEV origin/DEV
git merge main --allow-unrelated-histories
git push -u origin DEV
```

Do not run `git push -u origin DEV` while you are only on `main`. That error is:

`src refspec DEV does not match any`

---

## Part E — Any other project (personal GitHub account)

```powershell
cd D:\path\to\other-project
git remote set-url origin git@github.com-personal:PERSONAL_GITHUB_USER/REPO.git
git config user.name "PERSONAL_NAME"
git config user.email "personal@email.com"
git push -u origin main
```

---

## Everyday commands (after setup)

Always `cd` into the project first.

```powershell
cd D:\TechSuit\Techsuit-InternalApps\TMS-ProjectPlan\TMS-WEB-APP
git status
git add .
git commit -m "Describe the change."
git push
```

Check which account this repo uses:

```powershell
git remote -v
git config user.email
```

- Work TMS repo must show `github.com-work`
- Personal repos must show `github.com-personal`

---

## Troubleshooting

| Error | Meaning | What to do |
|---|---|---|
| `src refspec DEV does not match any` | No local branch named `DEV` | `git checkout -b DEV` then `git push -u origin DEV` |
| `Repository not found` | Wrong URL, private repo, or this SSH user has no access | Fix the remote URL; confirm `ssh -T git@github.com-work` shows the user that can open the repo in the browser |
| `remote origin already exists` | Origin is already set | Use `git remote set-url origin ...` |
| `Permission denied (publickey)` | Key not loaded, or not added to GitHub | `ssh-add` the key; add the `.pub` on GitHub; use the Host alias in the remote URL |
| `invalid reference: DEV` | Local `DEV` does not exist | `git checkout -b DEV` or `git fetch origin` then `git switch DEV` |
| Both `ssh -T` greet the same user | Same key added to both accounts, or config points both Hosts at one key | One key per account; check `.ssh\config` `IdentityFile` lines |

After a PC restart, if push fails with publickey:

```powershell
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519_work
ssh-add $env:USERPROFILE\.ssh\id_ed25519_personal
```

---

## Quick checklist

**On the PC (PowerShell)**

1. Create two keys in `C:\Users\SRIPRASAD\.ssh\`
2. Write `C:\Users\SRIPRASAD\.ssh\config` with `github.com-work` and `github.com-personal`
3. `ssh-add` both keys
4. In the TMS folder, `git remote set-url origin git@github.com-work:techsuitegit/techsuite-tms.git`
5. Set this repo’s `user.name` and `user.email`
6. `git push -u origin main` (then `DEV` if needed)

**On GitHub (browser)**

1. Work account → Settings → SSH keys → paste `id_ed25519_work.pub`
2. Personal account → Settings → SSH keys → paste `id_ed25519_personal.pub`
3. Confirm the work user can open `techsuitegit/techsuite-tms` and has write access
