type StoredEvent = {
  id: string;
  type: string;
  timestamp: string;
  run_id: string;
  agent_id: string;
  data: Record<string, unknown>;
  received_at?: string;
};

const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
const connectBtn = document.getElementById("connect") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;
const eventsEl = document.getElementById("events") as HTMLElement;

let source: EventSource | null = null;

function renderEvent(event: StoredEvent) {
  const card = document.createElement("article");
  card.className = "event-card";
  card.innerHTML = `
    <div class="event-type">${event.type}</div>
    <div class="event-meta">${event.id} · run ${event.run_id} · agent ${event.agent_id}</div>
    <pre>${JSON.stringify(event.data, null, 2)}</pre>
  `;
  eventsEl.prepend(card);
}

connectBtn.addEventListener("click", () => {
  source?.close();

  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    statusEl.textContent = "enter api key";
    return;
  }

  // EventSource cannot set Authorization header; beta uses query param.
  const apiBase = import.meta.env.VITE_API_URL ?? "";
  source = new EventSource(
    `${apiBase}/v1/events/stream?api_key=${encodeURIComponent(apiKey)}`
  );
  statusEl.textContent = "connecting…";

  source.addEventListener("connected", () => {
    statusEl.textContent = "connected";
  });

  source.addEventListener("agent-event", (message) => {
    const event = JSON.parse(message.data) as StoredEvent;
    renderEvent(event);
  });

  source.onerror = () => {
    statusEl.textContent = "connection error";
  };
});
