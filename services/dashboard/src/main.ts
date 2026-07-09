type StoredEvent = {
  id: string;
  type: string;
  timestamp: string;
  run_id: string;
  agent_id: string;
  data: Record<string, unknown>;
  received_at?: string;
};

type AuthResponse = {
  token: string;
  user: {
    id: string;
    username: string;
    is_admin: boolean;
  };
};

const TOKEN_KEY = "aventer_token";
const USER_KEY = "aventer_user";

const apiBase =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.PROD ? "https://api.aventer.dev" : "");

// Elements
const loginScreen = document.getElementById("loginScreen") as HTMLElement;
const dashboardScreen = document.getElementById("dashboardScreen") as HTMLElement;
const usernameInput = document.getElementById("username") as HTMLInputElement;
const passwordInput = document.getElementById("password") as HTMLInputElement;
const loginBtn = document.getElementById("loginBtn") as HTMLButtonElement;
const loginError = document.getElementById("loginError") as HTMLSpanElement;
const connectBtn = document.getElementById("connect") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;
const eventsEl = document.getElementById("events") as HTMLElement;
const userDisplay = document.getElementById("userDisplay") as HTMLSpanElement;
const logoutBtn = document.getElementById("logoutBtn") as HTMLButtonElement;
const adminLink = document.getElementById("adminLink") as HTMLAnchorElement;

let source: EventSource | null = null;

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function getUser(): AuthResponse["user"] | null {
  const userData = localStorage.getItem(USER_KEY);
  return userData ? JSON.parse(userData) : null;
}

function setUser(user: AuthResponse["user"]): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function showDashboard(): void {
  loginScreen.style.display = "none";
  dashboardScreen.style.display = "block";
  
  const user = getUser();
  if (user) {
    userDisplay.textContent = `Logged in as ${user.username}`;
    if (user.is_admin) {
      adminLink.style.display = "inline";
    }
  }
}

function showLogin(): void {
  loginScreen.style.display = "block";
  dashboardScreen.style.display = "none";
  usernameInput.value = "";
  passwordInput.value = "";
  loginError.textContent = "";
}

async function login(username: string, password: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiBase}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      loginError.textContent = error.error === "invalid_credentials" 
        ? "Invalid username or password"
        : "Login failed";
      return false;
    }

    const data: AuthResponse = await response.json();
    setToken(data.token);
    setUser(data.user);
    return true;
  } catch (err) {
    loginError.textContent = "Connection error";
    return false;
  }
}

function logout(): void {
  source?.close();
  clearToken();
  showLogin();
  statusEl.textContent = "disconnected";
  eventsEl.innerHTML = "";
}

function renderEvent(event: StoredEvent): void {
  const card = document.createElement("article");
  card.className = "event-card";
  card.innerHTML = `
    <div class="event-type">${event.type}</div>
    <div class="event-meta">${event.id} · run ${event.run_id} · agent ${event.agent_id}</div>
    <pre>${JSON.stringify(event.data, null, 2)}</pre>
  `;
  eventsEl.prepend(card);
}

function connectToStream(): void {
  source?.close();

  const token = getToken();
  if (!token) {
    statusEl.textContent = "not authenticated";
    return;
  }

  // Use Authorization header via query param workaround for EventSource
  // Note: EventSource doesn't support custom headers, so we include token in URL
  source = new EventSource(
    `${apiBase}/v1/events/stream`,
    {
      // This is a workaround - we'll need to modify how we send the token
    }
  );

  // Actually, let's use a different approach - store token and use it in a custom header
  // But EventSource doesn't support headers! Let me create a workaround.
  
  source.close();
  
  // For now, we'll need to send token as query param or find another solution
  // Let me use fetch with ReadableStream instead
  statusEl.textContent = "connecting…";
  
  connectViaFetch(token);
}

async function connectViaFetch(token: string): Promise<void> {
  try {
    const response = await fetch(`${apiBase}/v1/events/stream`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "text/event-stream",
      },
    });

    if (!response.ok) {
      statusEl.textContent = "connection failed";
      return;
    }

    statusEl.textContent = "connected";
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    if (!reader) {
      statusEl.textContent = "stream error";
      return;
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        
        const eventMatch = line.match(/event: (.+)/);
        const dataMatch = line.match(/data: (.+)/);
        
        if (eventMatch && dataMatch) {
          const eventType = eventMatch[1];
          const data = dataMatch[1];
          
          if (eventType === "agent-event") {
            const event = JSON.parse(data) as StoredEvent;
            renderEvent(event);
          }
        }
      }
    }
  } catch (err) {
    statusEl.textContent = "connection error";
  }
}

// Event listeners
loginBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  
  if (!username || !password) {
    loginError.textContent = "Please enter username and password";
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Logging in...";
  
  const success = await login(username, password);
  
  loginBtn.disabled = false;
  loginBtn.textContent = "Login";
  
  if (success) {
    showDashboard();
  }
});

passwordInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    loginBtn.click();
  }
});

connectBtn.addEventListener("click", () => {
  connectToStream();
});

logoutBtn.addEventListener("click", () => {
  logout();
});

// Check if already logged in
const token = getToken();
if (token) {
  // Verify token is still valid
  fetch(`${apiBase}/v1/auth/me`, {
    headers: { "Authorization": `Bearer ${token}` },
  })
    .then(response => {
      if (response.ok) {
        showDashboard();
      } else {
        clearToken();
        showLogin();
      }
    })
    .catch(() => {
      clearToken();
      showLogin();
    });
} else {
  showLogin();
}
