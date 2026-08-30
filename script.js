// Paste the deployed Google Apps Script Web App URL here. It must end in /exec.
const RSVP_API_URL = "https://script.google.com/macros/s/AKfycbxCeLl7-h9KwBjvZk9Z5kjnRJ84ZrBOI6gASAUMMDsMSLgXxjNeeKnFAxHrxHpFU_jQ/exec";

document.querySelectorAll('a[href^="http"]').forEach((link) => {
  link.addEventListener("click", () => {
    link.setAttribute("aria-label", `${link.textContent.trim()} (se abre en una pestaña nueva)`);
  });
});

const dialog = document.querySelector("#rsvp-dialog");
const openButton = document.querySelector("#open-rsvp");
const closeButton = document.querySelector("#close-rsvp");
const finishButton = document.querySelector("#rsvp-finish");
const backButton = document.querySelector("#rsvp-back");
const searchStep = document.querySelector("#rsvp-search-step");
const peopleStep = document.querySelector("#rsvp-people-step");
const successStep = document.querySelector("#rsvp-success-step");
const searchForm = document.querySelector("#rsvp-search-form");
const searchInput = document.querySelector("#rsvp-search");
const searchStatus = document.querySelector("#rsvp-search-status");
const searchResults = document.querySelector("#rsvp-search-results");
const peopleForm = document.querySelector("#rsvp-people-form");
const invitationName = document.querySelector("#rsvp-invitation-name");
const existingResponse = document.querySelector("#rsvp-existing-response");
const peopleList = document.querySelector("#rsvp-people-list");
const submitStatus = document.querySelector("#rsvp-submit-status");
const confirmedNames = document.querySelector("#rsvp-confirmed-names");

const rsvpState = { selectionKey: "", invitationName: "", people: [] };

function apiIsConfigured() {
  return RSVP_API_URL.startsWith("https://script.google.com/") && RSVP_API_URL.endsWith("/exec");
}

function setStep(activeStep) {
  [searchStep, peopleStep, successStep].forEach((step) => {
    step.hidden = step !== activeStep;
  });
  dialog.querySelector(".rsvp-dialog-body").scrollTop = 0;
}

function resetRsvp() {
  searchForm.reset();
  searchStatus.textContent = "";
  searchResults.replaceChildren();
  peopleList.replaceChildren();
  submitStatus.textContent = "";
  confirmedNames.replaceChildren();
  rsvpState.selectionKey = "";
  rsvpState.invitationName = "";
  rsvpState.people = [];
  setStep(searchStep);
}

function setBusy(button, busy, busyText, normalText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : normalText;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", redirect: "follow", ...options });
  if (!response.ok) throw new Error("No pudimos conectar con el servicio de confirmación.");
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || "No pudimos completar la solicitud.");
  return payload;
}

function buildApiUrl(parameters) {
  const url = new URL(RSVP_API_URL);
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

function showConnectionError(element, error) {
  console.error(error);
  element.textContent = "No pudimos conectar en este momento. Revisa tu conexión e intenta nuevamente.";
}

openButton.addEventListener("click", () => {
  resetRsvp();
  dialog.showModal();
  window.setTimeout(() => searchInput.focus(), 120);
});

closeButton.addEventListener("click", () => dialog.close());
finishButton.addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

backButton.addEventListener("click", () => {
  setStep(searchStep);
  searchInput.focus();
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  const submitButton = searchForm.querySelector('button[type="submit"]');
  searchStatus.textContent = "";
  searchResults.replaceChildren();

  if (!apiIsConfigured()) {
    searchStatus.textContent = "La confirmación estará disponible cuando se conecte el servicio RSVP.";
    return;
  }
  if (query.length < 3) {
    searchStatus.textContent = "Escribe al menos 3 letras para buscar.";
    searchInput.focus();
    return;
  }

  setBusy(submitButton, true, "Buscando…", "Buscar");
  try {
    const payload = await requestJson(buildApiUrl({ action: "search", q: query }));
    if (payload.results.length === 0) {
      searchStatus.textContent = "No encontramos una invitación con ese nombre. Revisa la escritura o intenta con otro apellido.";
      return;
    }

    const fragment = document.createDocumentFragment();
    payload.results.forEach((result) => {
      const button = document.createElement("button");
      const name = document.createElement("span");
      const arrow = document.createElement("span");
      button.type = "button";
      button.className = "result-button";
      name.textContent = result.invitationName;
      arrow.textContent = "→";
      arrow.setAttribute("aria-hidden", "true");
      button.append(name, arrow);
      button.addEventListener("click", () => loadInvitation(result.selectionKey));
      fragment.append(button);
    });
    searchResults.append(fragment);
  } catch (error) {
    showConnectionError(searchStatus, error);
  } finally {
    setBusy(submitButton, false, "Buscando…", "Buscar");
  }
});

async function loadInvitation(selectionKey) {
  searchStatus.textContent = "Abriendo tu invitación…";
  searchResults.replaceChildren();
  try {
    const payload = await requestJson(buildApiUrl({ action: "invitation", key: selectionKey }));
    rsvpState.selectionKey = selectionKey;
    rsvpState.invitationName = payload.invitationName;
    rsvpState.people = payload.people;
    renderPeople(payload);
    setStep(peopleStep);
  } catch (error) {
    showConnectionError(searchStatus, error);
  }
}

function renderPeople(payload) {
  invitationName.textContent = payload.invitationName;
  existingResponse.hidden = !payload.hasResponded;
  submitStatus.textContent = "";
  peopleList.replaceChildren();

  const fragment = document.createDocumentFragment();
  payload.people.forEach((person) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    const name = document.createElement("span");
    label.className = "person-option";
    checkbox.type = "checkbox";
    checkbox.name = "attending";
    checkbox.value = person.personKey;
    checkbox.checked = person.attending;
    name.textContent = person.personName;
    label.append(checkbox, name);
    fragment.append(label);
  });
  peopleList.append(fragment);
}

peopleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = peopleForm.querySelector('button[type="submit"]');
  const selectedPeople = [...peopleForm.querySelectorAll('input[name="attending"]:checked')].map((input) => input.value);
  submitStatus.textContent = "";
  setBusy(submitButton, true, "Guardando…", "Guardar confirmación →");

  try {
    const payload = await requestJson(RSVP_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "submit", selectionKey: rsvpState.selectionKey, selectedPeople }),
    });
    renderSuccess(payload.confirmedNames);
    setStep(successStep);
  } catch (error) {
    showConnectionError(submitStatus, error);
  } finally {
    setBusy(submitButton, false, "Guardando…", "Guardar confirmación →");
  }
});

function renderSuccess(names) {
  confirmedNames.replaceChildren();
  const container = document.createElement("div");
  container.className = "confirmed-list";

  if (names.length === 0) {
    const message = document.createElement("p");
    message.className = "none-attending";
    message.textContent = "No se confirmó ningún asistente para esta invitación.";
    container.append(message);
  } else {
    const heading = document.createElement("p");
    const list = document.createElement("ul");
    heading.textContent = "Personas confirmadas";
    names.forEach((name) => {
      const item = document.createElement("li");
      item.textContent = name;
      list.append(item);
    });
    container.append(heading, list);
  }
  confirmedNames.append(container);
}
