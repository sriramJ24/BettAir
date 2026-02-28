const map = L.map("map", { zoomControl: false }).setView([39.9526, -75.1652], 11);
L.control.zoom({ position: "bottomleft" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const categoryLabels = {
  1: "Good",
  2: "Moderate",
  3: "Unhealthy for Sensitive Groups",
  4: "Unhealthy",
  5: "Very Unhealthy",
  6: "Hazardous",
  7: "Unavailable",
};

const categoryColors = {
  1: "#2f8650",
  2: "#d8b234",
  3: "#df8a2d",
  4: "#ce4a42",
  5: "#8441a3",
  6: "#4a1f60",
  7: "#7a7a7a",
};

const el = (id) => document.getElementById(id);
const ui = {
  status: el("status"),
  aqi: el("aqi"),
  cat: el("cat"),
  pollutant: el("pollutant"),
  area: el("area"),
  time: el("time"),
  address: el("address"),
  lat: el("lat"),
  lon: el("lon"),
  needle: el("needle"),
  error: el("error"),
  errorText: el("error-text"),
  errorClose: el("error-close"),
  addressForm: el("address-form"),
  addressInput: el("address-input"),
  coordsForm: el("coords-form"),
  latInput: el("lat-input"),
  lngInput: el("lng-input"),
  gpsBtn: el("gps-btn"),
};

el("legend").innerHTML = Object.entries(categoryLabels)
  .map(([k, v]) => `${k}. ${v}`)
  .join("<br />");

let marker = null;
let radiusLayer = null;

function setStatus(ok) {
  ui.status.textContent = ok ? "API: Active" : "API: Error";
  ui.status.classList.toggle("ok", ok);
  ui.status.classList.toggle("bad", !ok);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeCategory(aqi, providedNumber) {
  const direct = Number(providedNumber);
  if (!Number.isNaN(direct) && direct >= 1 && direct <= 6) {
    return direct;
  }

  const aqiNum = Number(aqi);
  if (Number.isNaN(aqiNum)) {
    return 7;
  }
  if (aqiNum <= 50) return 1;
  if (aqiNum <= 100) return 2;
  if (aqiNum <= 150) return 3;
  if (aqiNum <= 200) return 4;
  if (aqiNum <= 300) return 5;
  return 6;
}

function pickBestObservation(observations) {
  if (!Array.isArray(observations) || observations.length === 0) {
    return null;
  }

  const withAqi = observations.filter((obs) => Number.isFinite(Number(obs?.AQI)));
  if (withAqi.length === 0) {
    return observations[0];
  }

  return withAqi.reduce((best, current) => {
    const bestAqi = Number(best.AQI);
    const currentAqi = Number(current.AQI);
    return currentAqi > bestAqi ? current : best;
  });
}

function formatObserved(observation) {
  if (!observation) return "Unavailable";
  const day = observation.DateObserved || "";
  const hour = observation.HourObserved;
  const tz = observation.LocalTimeZone || "";

  if (!day || hour === undefined || hour === null) {
    return "Unavailable";
  }
  return `${day} ${String(hour).padStart(2, "0")}:00 ${tz}`.trim();
}

function resetError() {
  ui.errorText.textContent = "";
  ui.error.classList.remove("error-visible");
  ui.error.classList.add("error-hidden");
}

function setError(message) {
  ui.errorText.textContent = message || "Request failed.";
  ui.error.classList.remove("error-hidden");
  ui.error.classList.add("error-visible");
}

function renderMap(lat, lng, categoryNumber) {
  if (marker) {
    map.removeLayer(marker);
  }
  marker = L.marker([lat, lng]).addTo(map);

  if (radiusLayer) {
    map.removeLayer(radiusLayer);
  }
  const color = categoryColors[categoryNumber] || categoryColors[7];
  radiusLayer = L.circle([lat, lng], {
    radius: 2400,
    color,
    fillColor: color,
    fillOpacity: 0.2,
    weight: 2,
  }).addTo(map);
}

function renderPayload(payload) {
  const observations = payload.airnow_observations || [];
  const mainObs = pickBestObservation(observations);

  const outLat = Number(payload.latitude);
  const outLng = Number(payload.longitude);
  const safeLat = Number.isFinite(outLat) ? outLat : 0;
  const safeLng = Number.isFinite(outLng) ? outLng : 0;
  const aqi = mainObs?.AQI ?? "Unavailable";
  const categoryNumber = normalizeCategory(aqi, mainObs?.Category?.Number);
  const categoryName = mainObs?.Category?.Name || categoryLabels[categoryNumber];
  const aqiNumber = Number(aqi);
  const needlePct = Number.isFinite(aqiNumber) ? clamp((aqiNumber / 300) * 100, 0, 100) : 0;

  ui.aqi.textContent = String(aqi);
  ui.cat.textContent = `${categoryNumber}. ${categoryName}`;
  ui.pollutant.textContent = mainObs?.ParameterName || "Unavailable";
  ui.area.textContent = mainObs?.ReportingArea
    ? `${mainObs.ReportingArea}${mainObs.StateCode ? `, ${mainObs.StateCode}` : ""}`
    : "Unavailable";
  ui.time.textContent = formatObserved(mainObs);
  ui.address.textContent = payload.formatted_address || payload.input_address || "Coordinates lookup";
  ui.lat.textContent = safeLat.toFixed(5);
  ui.lon.textContent = safeLng.toFixed(5);
  ui.needle.style.left = `${needlePct}%`;

  ui.latInput.value = safeLat.toFixed(5);
  ui.lngInput.value = safeLng.toFixed(5);

  renderMap(safeLat, safeLng, categoryNumber);
  map.setView([safeLat, safeLng], 11);
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data.error || "Request failed.";
    throw new Error(msg);
  }
  return data;
}

async function loadByCoords(lat, lng) {
  resetError();
  try {
    const url = `/api/air-quality/coordinates-only?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
    const payload = await fetchJson(url);
    setStatus(true);
    renderPayload(payload);
  } catch (err) {
    setStatus(false);
    setError(err.message);
  }
}

async function loadByAddress(address) {
  resetError();
  try {
    const url = `/api/air-quality?address=${encodeURIComponent(address)}`;
    const payload = await fetchJson(url);
    setStatus(true);
    renderPayload(payload);
  } catch (err) {
    setStatus(false);
    setError(err.message);
  }
}

ui.addressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const address = ui.addressInput.value.trim();
  if (!address) {
    setError("Enter an address before searching.");
    return;
  }
  loadByAddress(address);
});

ui.coordsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const lat = ui.latInput.value.trim();
  const lng = ui.lngInput.value.trim();
  if (!lat || !lng) {
    setError("Enter both latitude and longitude.");
    return;
  }
  loadByCoords(lat, lng);
});

ui.gpsBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setError("Geolocation is not supported in this browser.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      loadByCoords(latitude, longitude);
    },
    () => {
      setError("Unable to get your location.");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
});

map.on("click", (event) => {
  const lat = event.latlng.lat.toFixed(6);
  const lng = event.latlng.lng.toFixed(6);
  loadByCoords(lat, lng);
});

ui.errorClose.addEventListener("click", resetError);
setStatus(false);
loadByCoords(39.9526, -75.1652);
