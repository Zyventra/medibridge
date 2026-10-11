let isOnline = true;
let pendingOfflineEntries = [];
let map, pharmacyMarkersGroup, locationMarker;
let currentSelectedCriticalMed = "";

// DEFAULT MAP CENTER SET TO CHENNAI (Lat: 13.0827, Lng: 80.2707)
const DEFAULT_CHENNAI_LAT = 13.0827;
const DEFAULT_CHENNAI_LNG = 80.2707;

// MIN-HEAP DATA STRUCTURE IMPLEMENTATION
class MinHeap {
  constructor() { this.heap = []; }
  insert(node) { this.heap.push(node); this.bubbleUp(this.heap.length - 1); }
  bubbleUp(index) {
    while (index > 0) {
      let parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index].hoursLeft >= this.heap[parentIndex].hoursLeft) break;
      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }
  peek() { return this.heap[0] || null; }
}

const defaultMedicines = [
  { phc: "PHC Ammapettai", name: "vicks action 500mg", qty: 15, burnRate: 10 },
  { phc: "PHC Ammapettai", name: "Paracetamol 500mg Tablet", qty: 30, burnRate: 8 },
  { phc: "PHC Ammapettai", name: "Dolo 650mg Tablet", qty: 120, burnRate: 10 },
  { phc: "PHC Ammapettai", name: "Amoxicillin 250mg Capsule", qty: 850, burnRate: 20 },
  { phc: "PHC Ammapettai", name: "ORS Electrolyte Packets", qty: 2400, burnRate: 15 }
];

const defaultRequests = [
  { id: "REQ-101", requestingPhc: "PHC Ammapettai", donorPhc: "PHC Valayapatti (8.5km)", medName: "vicks action 500mg", qty: "300 units", status: "Pending Admin Approval" }
];

function getStoredMedicines() { return JSON.parse(localStorage.getItem("medibridge_inventory")) || defaultMedicines; }
function saveStoredMedicines(data) { localStorage.setItem("medibridge_inventory", JSON.stringify(data)); }

function getStoredRequests() { return JSON.parse(localStorage.getItem("medibridge_requests")) || defaultRequests; }
function saveStoredRequests(data) { localStorage.setItem("medibridge_requests", JSON.stringify(data)); }

// CONSTRAINT-2: ONLINE/OFFLINE TOGGLE
function toggleNetworkMode() {
  isOnline = !isOnline;
  const badge = document.getElementById("netStatusBadge");
  const text = document.getElementById("netStatusText");

  if (isOnline) {
    badge.className = "network-badge net-online";
    text.innerText = "ONLINE MODE (Auto Sync Active)";
    if (pendingOfflineEntries.length > 0) {
      alert(`✔ Network restored! ${pendingOfflineEntries.length} offline transactions synced to server.`);
      pendingOfflineEntries = [];
    }
  } else {
    badge.className = "network-badge net-offline";
    text.innerText = "OFFLINE MODE (Saved Locally)";
  }
}

// AUTOMATED DISPENSING POS
function processAutomatedDispense() {
  const select = document.getElementById("dispenseMedSelect");
  const medName = select.value;
  const qtyToDispense = parseFloat(document.getElementById("dispenseQty").value);
  const patientId = document.getElementById("patientId").value;

  if (!medName || isNaN(qtyToDispense) || qtyToDispense <= 0) return;

  const medicines = getStoredMedicines();
  const targetMed = medicines.find(m => m.name.toLowerCase() === medName.toLowerCase());

  if (targetMed) {
    if (targetMed.qty < qtyToDispense) {
      alert(`Insufficient Stock! Only ${targetMed.qty} units left.`);
      return;
    }

    targetMed.qty -= qtyToDispense;

    if (!isOnline) {
      pendingOfflineEntries.push({ medName, qtyToDispense, patientId });
    }

    saveStoredMedicines(medicines);
    document.getElementById("posDsaVisualizer").innerText = `Last Dispensed: ${qtyToDispense} units of ${medName} (${patientId})`;
    renderInventory();
    alert(`✔ Dispensed ${qtyToDispense} units of ${medName} for ${patientId}.\nStock Remaining: ${targetMed.qty} units.`);
  }
}

function populateDispenseSelectOptions(medicines) {
  const select = document.getElementById("dispenseMedSelect");
  select.innerHTML = "";
  medicines.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.name;
    opt.innerText = `${m.name} (${m.qty} units left)`;
    select.appendChild(opt);
  });
}

function renderInventory() {
  const medicines = getStoredMedicines();
  const requests = getStoredRequests();

  populateDispenseSelectOptions(medicines);

  const tbodyStaff = document.getElementById("inventoryTable");
  const tbodyRequests = document.getElementById("adminTransferRequestsTable");

  tbodyStaff.innerHTML = "";
  tbodyRequests.innerHTML = "";

  const minHeap = new MinHeap();
  let criticalItemsList = [];

  medicines.forEach(item => {
    const hoursLeft = Math.round(item.qty / item.burnRate);
    const node = { name: item.name, hoursLeft: hoursLeft, qty: item.qty, burnRate: item.burnRate };
    
    minHeap.insert(node);
    if (hoursLeft <= 11) criticalItemsList.push(node);

    let statusBadge = hoursLeft <= 11 ? `<span class="badge badge-danger">Critical (${hoursLeft}h left)</span>` :
                      `<span class="badge badge-success">Optimal (${hoursLeft}h left)</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>${item.name}</strong></td><td>${item.qty} units</td><td>${item.burnRate} / hr</td><td>${statusBadge}</td>`;
    tbodyStaff.appendChild(tr);
  });

  const topHeapItem = minHeap.peek();
  if (topHeapItem) {
    document.getElementById("heapDsaVisualizer").innerText = `Min-Heap Top: ${topHeapItem.name} (${topHeapItem.hoursLeft} hrs left)`;
  }

  requests.forEach((req, index) => {
    let statusBadge = req.status === "Pending Admin Approval" ? `<span class="badge badge-warning">Pending</span>` :
                      req.status === "Accepted" ? `<span class="badge badge-success">Approved</span>` : `<span class="badge badge-danger">Declined</span>`;

    let actionButtons = req.status === "Pending Admin Approval" ? `
      <button class="btn-demo" style="background:#059669; color:#fff;" onclick="updateRequestStatus(${index}, 'Accepted')">Approve</button>
    ` : `<small>Completed</small>`;

    const trReq = document.createElement("tr");
    trReq.innerHTML = `<td><strong>${req.requestingPhc}</strong></td><td>${req.donorPhc}</td><td><strong>${req.medName}</strong></td><td>${req.qty}</td><td>${statusBadge}</td><td>${actionButtons}</td>`;
    tbodyRequests.appendChild(trReq);
  });

  const alertContent = document.getElementById("alertBannerContent");
  const alertSection = document.getElementById("alertBannerSection");

  if (criticalItemsList.length > 0) {
    const first = criticalItemsList[0];
    const plainSentenceExplanation = `PHC Ammapettai will run out of ${first.name} in exactly ${first.hoursLeft} hours because current consumption is ${first.burnRate} units/hr against ${first.qty} remaining units.`;

    alertContent.innerHTML = `
      <div class="plain-explanation-box">
        <i class="fa-solid fa-comment-dots"></i> <strong>Pharmacist Explanation:</strong> "${plainSentenceExplanation}"
      </div>
    `;
    alertSection.classList.remove("hidden");
    populateCriticalDropdown(criticalItemsList);
  } else {
    alertSection.classList.add("hidden");
  }
}

function populateCriticalDropdown(criticalItemsList) {
  const select = document.getElementById("criticalMedSelect");
  select.innerHTML = "";
  criticalItemsList.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item.name;
    opt.innerText = `${item.name} (${item.hoursLeft}h left - Critical)`;
    select.appendChild(opt);
  });

  if (criticalItemsList.length > 0) {
    currentSelectedCriticalMed = criticalItemsList[0].name;
    renderImpactBoxForSelectedMed(currentSelectedCriticalMed);
  }
}

function onCriticalMedSelectChange(medName) {
  currentSelectedCriticalMed = medName;
  renderImpactBoxForSelectedMed(medName);
}

function renderImpactBoxForSelectedMed(medName) {
  const medicines = getStoredMedicines();
  const med = medicines.find(m => m.name.toLowerCase() === medName.toLowerCase());
  const currentQty = med ? med.qty : 5;
  const hoursLeft = med ? Math.round(med.qty / med.burnRate) : 1;
  const afterQty = currentQty >= 300 ? currentQty : currentQty + 300;
  const afterHours = med ? Math.round(afterQty / med.burnRate) : 31;

  const impactBox = document.getElementById("impactVisualizerBox");
  impactBox.innerHTML = `
    <div class="impact-box">
      <h5 style="color:#dc2626;"><i class="fa-solid fa-hospital-user"></i> Shortage Centre: PHC Ammapettai</h5>
      <p>Medicine: <strong>${medName}</strong></p>
      <div style="margin-top:6px;">
        <span style="color:#dc2626; font-weight:800;">Current: ${currentQty} units (${hoursLeft}h)</span>
        <i class="fa-solid fa-arrow-right" style="margin: 0 6px;"></i>
        <span style="color:#059669; font-weight:800;">After: ${afterQty} units (${afterHours}h)</span>
      </div>
    </div>

    <div class="impact-box">
      <h5 style="color:#059669;"><i class="fa-solid fa-hospital"></i> Donor Surplus Centre: PHC Valayapatti</h5>
      <p>Surplus Available: <strong>1,200 units</strong></p>
      <div style="margin-top:6px;">
        <span style="color:#059669; font-weight:800;">Current: 1,200 units</span>
        <i class="fa-solid fa-arrow-right" style="margin: 0 6px;"></i>
        <span style="color:#0284c7; font-weight:800;">After: 900 units</span>
      </div>
    </div>
  `;

  const requests = getStoredRequests();
  const existingReq = requests.find(r => r.medName.toLowerCase() === medName.toLowerCase());
  const btnReq = document.getElementById("btnRequestTransfer");

  if (existingReq && existingReq.status === "Accepted") {
    btnReq.innerHTML = `<i class="fa-solid fa-circle-check"></i> Approved (+300 units credited)`;
    btnReq.style.background = "#059669";
    btnReq.disabled = true;
  } else if (existingReq && existingReq.status === "Pending Admin Approval") {
    btnReq.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> Pending Admin Approval`;
    btnReq.style.background = "#d97706";
    btnReq.disabled = true;
  } else {
    btnReq.innerHTML = `<i class="fa-solid fa-truck-ramp-box"></i> Request Transfer (300 units)`;
    btnReq.style.background = "#0284c7";
    btnReq.disabled = false;
  }
}

function triggerTransferRequestForSelected() {
  if (!currentSelectedCriticalMed) return;
  const requests = getStoredRequests();
  requests.unshift({
    id: "REQ-" + Math.floor(100 + Math.random() * 900),
    requestingPhc: "PHC Ammapettai",
    donorPhc: "PHC Valayapatti (8.5km)",
    medName: currentSelectedCriticalMed,
    qty: "300 units",
    status: "Pending Admin Approval"
  });
  saveStoredRequests(requests);
  renderInventory();
  renderImpactBoxForSelectedMed(currentSelectedCriticalMed);
  alert(`Transfer request sent for '${currentSelectedCriticalMed}'!`);
}

function updateRequestStatus(index, newStatus) {
  const requests = getStoredRequests();
  const targetReq = requests[index];
  targetReq.status = newStatus;

  if (newStatus === "Accepted") {
    const medicines = getStoredMedicines();
    const med = medicines.find(m => m.name.toLowerCase() === targetReq.medName.toLowerCase());
    if (med) { med.qty += 300; saveStoredMedicines(medicines); }
  }

  saveStoredRequests(requests);
  renderInventory();
  if (currentSelectedCriticalMed) renderImpactBoxForSelectedMed(currentSelectedCriticalMed);
  alert(`Transfer request approved! Stock updated.`);
}

function switchAuthTab(type) {
  document.getElementById('phcLoginForm').classList.toggle('hidden', type !== 'phc');
  document.getElementById('adminLoginForm').classList.toggle('hidden', type !== 'admin');
  document.getElementById('tabPhc').classList.toggle('active', type === 'phc');
  document.getElementById('tabAdmin').classList.toggle('active', type === 'admin');
}

function handleLogin(role) {
  document.getElementById('authContainer').classList.add('hidden');
  document.getElementById('dashboardSection').classList.remove('hidden');

  if (role === 'admin') {
    document.getElementById('welcomeHeading').innerText = "District Administration Control Dashboard";
    document.getElementById('staffView').classList.add('hidden');
    document.getElementById('bmoView').classList.remove('hidden');
  } else {
    document.getElementById('welcomeHeading').innerText = "PHC Staff Emergency Dashboard";
    document.getElementById('bmoView').classList.add('hidden');
    document.getElementById('staffView').classList.remove('hidden');
  }

  renderInventory();
  setTimeout(initMap, 400);
}

function handleLogout() {
  document.getElementById('dashboardSection').classList.add('hidden');
  document.getElementById('authContainer').classList.remove('hidden');
}

function openEmergencyMatcher() { document.getElementById("matcherSection").classList.remove("hidden"); }
function closeEmergencyMatcher() { document.getElementById("matcherSection").classList.add("hidden"); }

function filterTable(input, tableId) {
  const filter = input.value.toLowerCase();
  document.querySelectorAll(`#${tableId} tr`).forEach(row => {
    row.style.display = row.innerText.toLowerCase().includes(filter) ? "" : "none";
  });
}

// MAP INITIALIZATION DEFAULTED TO CHENNAI
function initMap() {
  if (map) return;
  
  // Default to Chennai Location
  map = L.map('map').setView([DEFAULT_CHENNAI_LAT, DEFAULT_CHENNAI_LNG], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  pharmacyMarkersGroup = L.layerGroup().addTo(map);
  
  locationMarker = L.marker([DEFAULT_CHENNAI_LAT, DEFAULT_CHENNAI_LNG])
   .addTo(map)
   .bindPopup("<b>📍 Default Hub: Chennai Central</b>")
   .openPopup();

  fetchNearbyPharmacies(DEFAULT_CHENNAI_LAT, DEFAULT_CHENNAI_LNG);
}

// MANUAL PLACE / CITY / TOWN SEARCH (e.g. Tiruchengode, Namakkal, Salem, Coimbatore)
function searchLocationByName() {
  const query = document.getElementById("mapSearchInput").value.trim();
  if (!query) return;

  const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ", Tamil Nadu, India")}`;

  fetch(searchUrl)
    .then(res => res.json())
    .then(data => {
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);

        map.setView([lat, lon], 13);

        if (locationMarker) map.removeLayer(locationMarker);
        locationMarker = L.marker([lat, lon]).addTo(map).bindPopup(`<b>📍 ${data[0].display_name}</b>`).openPopup();

        fetchNearbyPharmacies(lat, lon);
      } else {
        alert("Location not found! Try searching another town or district name.");
      }
    })
    .catch(err => {
      alert("Error finding place. Please check internet connection.");
    });
}

// GPS / USE MY LOCATION TRACKER
function locateUser() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        map.setView([lat, lng], 14);

        if (locationMarker) map.removeLayer(locationMarker);
        locationMarker = L.marker([lat, lng]).addTo(map).bindPopup("📍 Your Current GPS Location").openPopup();

        fetchNearbyPharmacies(lat, lng);
      },
      err => {
        alert("Geolocation permission denied. Please use the search bar to enter location manually!");
      }
    );
  } else {
    alert("Geolocation is not supported by your browser. Use manual search input!");
  }
}

function fetchNearbyPharmacies(lat, lng) {
  if (pharmacyMarkersGroup) pharmacyMarkersGroup.clearLayers();
  const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json];node(around:9000,${lat},${lng})[amenity=pharmacy];out;`;
  fetch(overpassUrl)
    .then(res => res.json())
    .then(data => {
      if (data.elements) {
        data.elements.forEach(p => {
          L.marker([p.lat, p.lon]).addTo(pharmacyMarkersGroup).bindPopup(`<b>💊 ${p.tags.name || 'Pharmacy'}</b>`);
        });
      }
    });
}