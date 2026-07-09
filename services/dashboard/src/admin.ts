type BetaUser = {
  id: string;
  username: string;
  is_admin: boolean;
  created_at: string;
  last_login_at: string | null;
};

const TOKEN_KEY = "aventer_token";
const USER_KEY = "aventer_user";

const apiBase =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.PROD ? "https://api.aventer.dev" : "");

// Elements
const logoutBtn = document.getElementById("logoutBtn") as HTMLButtonElement;
const newUsernameInput = document.getElementById("newUsername") as HTMLInputElement;
const newPasswordInput = document.getElementById("newPassword") as HTMLInputElement;
const newIsAdminCheckbox = document.getElementById("newIsAdmin") as HTMLInputElement;
const addUserBtn = document.getElementById("addUserBtn") as HTMLButtonElement;
const addUserError = document.getElementById("addUserError") as HTMLSpanElement;
const addUserSuccess = document.getElementById("addUserSuccess") as HTMLSpanElement;
const usersList = document.getElementById("usersList") as HTMLElement;

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function getCurrentUser(): { username: string; is_admin: boolean } | null {
  const userData = localStorage.getItem(USER_KEY);
  return userData ? JSON.parse(userData) : null;
}

async function checkAuth(): Promise<boolean> {
  const token = getToken();
  if (!token) {
    window.location.href = "/";
    return false;
  }

  try {
    const response = await fetch(`${apiBase}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      clearToken();
      window.location.href = "/";
      return false;
    }

    const data = await response.json();
    if (!data.user.is_admin) {
      alert("Admin access required");
      window.location.href = "/";
      return false;
    }

    return true;
  } catch {
    clearToken();
    window.location.href = "/";
    return false;
  }
}

async function loadUsers(): Promise<void> {
  const token = getToken();
  if (!token) return;

  try {
    const response = await fetch(`${apiBase}/v1/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      usersList.innerHTML = '<div class="loading">Failed to load users</div>';
      return;
    }

    const data: { users: BetaUser[] } = await response.json();
    renderUsers(data.users);
  } catch {
    usersList.innerHTML = '<div class="loading">Connection error</div>';
  }
}

function renderUsers(users: BetaUser[]): void {
  if (users.length === 0) {
    usersList.innerHTML = '<div class="loading">No users yet</div>';
    return;
  }

  const currentUser = getCurrentUser();

  usersList.innerHTML = users
    .map(
      (user) => `
    <div class="user-card">
      <div class="user-info-group">
        <div>
          <span class="user-username">${user.username}</span>
          ${user.is_admin ? '<span class="admin-badge">Admin</span>' : ""}
        </div>
        <div class="user-meta">
          ${user.id} · Created ${new Date(user.created_at).toLocaleDateString()}
          ${user.last_login_at ? ` · Last login ${new Date(user.last_login_at).toLocaleDateString()}` : ""}
        </div>
      </div>
      <div class="user-actions">
        ${
          currentUser?.username !== user.username
            ? `<button class="delete-btn" onclick="deleteUser('${user.id}', '${user.username}')">Delete</button>`
            : ""
        }
      </div>
    </div>
  `
    )
    .join("");
}

async function addUser(): Promise<void> {
  const username = newUsernameInput.value.trim();
  const password = newPasswordInput.value.trim();
  const isAdmin = newIsAdminCheckbox.checked;

  addUserError.textContent = "";
  addUserSuccess.textContent = "";

  if (!username || !password) {
    addUserError.textContent = "Username and password are required";
    return;
  }

  if (password.length < 8) {
    addUserError.textContent = "Password must be at least 8 characters";
    return;
  }

  const token = getToken();
  if (!token) return;

  addUserBtn.disabled = true;
  addUserBtn.textContent = "Adding...";

  try {
    const response = await fetch(`${apiBase}/v1/admin/users`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password, is_admin: isAdmin }),
    });

    addUserBtn.disabled = false;
    addUserBtn.textContent = "Add User";

    if (!response.ok) {
      const error = await response.json();
      addUserError.textContent =
        error.error === "username_already_exists"
          ? "Username already exists"
          : "Failed to add user";
      return;
    }

    addUserSuccess.textContent = `User "${username}" added successfully`;
    newUsernameInput.value = "";
    newPasswordInput.value = "";
    newIsAdminCheckbox.checked = false;

    await loadUsers();
  } catch {
    addUserBtn.disabled = false;
    addUserBtn.textContent = "Add User";
    addUserError.textContent = "Connection error";
  }
}

(window as any).deleteUser = async (userId: string, username: string): Promise<void> => {
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) {
    return;
  }

  const token = getToken();
  if (!token) return;

  try {
    const response = await fetch(`${apiBase}/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      await loadUsers();
    } else {
      alert("Failed to delete user");
    }
  } catch {
    alert("Connection error");
  }
};

logoutBtn.addEventListener("click", () => {
  clearToken();
  window.location.href = "/";
});

addUserBtn.addEventListener("click", () => {
  void addUser();
});

newPasswordInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    void addUser();
  }
});

// Initialize
checkAuth().then((isAuthed) => {
  if (isAuthed) {
    void loadUsers();
  }
});
