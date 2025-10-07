// Global variables
let map
let markersLayer
let allFruits = []
let filteredFruits = []
const activeFilters = new Set()

// Global variables for auto-loading
let autoLoadEnabled = true
let lastLoadBounds = null
let loadTimeout = null
const LOAD_DELAY = 1000 // Delay in milliseconds before loading data
const MIN_MOVE_DISTANCE = 0.01 // Minimum distance to trigger reload (in degrees)

// Fruit type mapping with emojis and Czech names
const fruitTypes = {
  apple: { emoji: "🍎", name: "Jablka", count: 0 },
  pear: { emoji: "🍐", name: "Hrušky", count: 0 },
  cherry: { emoji: "🍒", name: "Třešně", count: 0 },
  plum: { emoji: "🟣", name: "Švestky", count: 0 },
  walnut: { emoji: "🥜", name: "Ořechy", count: 0 },
  hazelnut: { emoji: "🌰", name: "Lískové ořechy", count: 0 },
  blackberry: { emoji: "🫐", name: "Ostružiny", count: 0 },
  raspberry: { emoji: "🍓", name: "Maliny", count: 0 },
  bilberry: { emoji: "🫐", name: "Lesní borůvky", count: 0 },
  wild_strawberry: { emoji: "🍓", name: "Lesní jahody", count: 0 },
  elderberry: { emoji: "🟣", name: "Bezinky", count: 0 },
  rosehip: { emoji: "🌹", name: "Šípky", count: 0 },
  chestnut: { emoji: "🌰", name: "Kaštany", count: 0 },
  mushroom: { emoji: "🍄", name: "Houby", count: 0 },
  other: { emoji: "🌿", name: "Ostatní", count: 0 },
}

// Leaflet library
const L = window.L

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  initializeMap()
  initializeEventListeners()
  createFruitFilters()

  // Load initial data for Prague area
  map.setView([50.0755, 14.4378], 11)
  setTimeout(() => {
    loadFruitData()
  }, 1000)
})

// Initialize Leaflet map
function initializeMap() {
  map = L.map("map").setView([50.0755, 14.4378], 11)

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map)

  markersLayer = L.layerGroup().addTo(map)

  // Add map move handler for auto-loading data
  map.on("moveend", () => {
    if (autoLoadEnabled) {
      handleMapMove()
    }
  })

  // Add zoom handler
  map.on("zoomend", () => {
    if (autoLoadEnabled) {
      handleMapMove()
    }
  })
}

// Initialize event listeners
function initializeEventListeners() {
  // Load data button
  document.getElementById("load-data-btn").addEventListener("click", loadFruitData)

  // Clear data button
  document.getElementById("clear-data-btn").addEventListener("click", clearData)

  // My location button
  document.getElementById("my-location-btn").addEventListener("click", goToMyLocation)

  // Search button
  document.getElementById("search-btn").addEventListener("click", searchLocation)

  // Search input enter key
  document.getElementById("location-search").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      searchLocation()
    }
  })

  // Toggle sidebar button
  document.getElementById("toggle-sidebar").addEventListener("click", toggleSidebar)

  // Close sidebar when clicking on map (mobile)
  document.getElementById("map").addEventListener("click", () => {
    if (window.innerWidth <= 768) {
      document.querySelector(".sidebar").classList.remove("open")
    }
  })

  // Auto-load toggle button
  document.getElementById("auto-load-toggle").addEventListener("click", toggleAutoLoad)
}

// Create fruit filter checkboxes
function createFruitFilters() {
  const container = document.getElementById("fruit-filters")

  Object.entries(fruitTypes).forEach(([key, fruit]) => {
    const filterDiv = document.createElement("div")
    filterDiv.className = "filter-checkbox"
    filterDiv.innerHTML = `
            <input type="checkbox" id="filter-${key}" value="${key}">
            <span class="fruit-emoji">${fruit.emoji}</span>
            <span class="fruit-name">${fruit.name}</span>
            <span class="fruit-count" id="count-${key}">0</span>
        `

    const checkbox = filterDiv.querySelector("input")
    checkbox.addEventListener("change", function () {
      if (this.checked) {
        activeFilters.add(key)
        filterDiv.classList.add("active")
      } else {
        activeFilters.delete(key)
        filterDiv.classList.remove("active")
      }
      applyFilters()
    })

    container.appendChild(filterDiv)
  })
}

// Handle map movement for auto-loading
function handleMapMove() {
  // Clear existing timeout
  if (loadTimeout) {
    clearTimeout(loadTimeout)
  }

  // Check if we should load data based on movement distance
  const currentBounds = map.getBounds()

  if (shouldLoadData(currentBounds)) {
    // Add delay to avoid too frequent requests
    loadTimeout = setTimeout(() => {
      loadFruitData()
    }, LOAD_DELAY)
  }
}

// Check if data should be loaded based on map movement
function shouldLoadData(currentBounds) {
  if (!lastLoadBounds) {
    return true
  }

  const currentCenter = currentBounds.getCenter()
  const lastCenter = lastLoadBounds.getCenter()

  const distance = Math.sqrt(
    Math.pow(currentCenter.lat - lastCenter.lat, 2) + Math.pow(currentCenter.lng - lastCenter.lng, 2),
  )

  return distance > MIN_MOVE_DISTANCE
}

// Load fruit data from Overpass API
async function loadFruitData() {
  const bounds = map.getBounds()
  const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`

  const overpassQuery = `
        [out:json][timeout:25][bbox:${bbox}];
        (
          node["fruit"];
          node["produce"];
          node["understorey:plant"];
          way["fruit"];
          way["produce"];  
          way["understorey:plant"];
        );
        out geom;
    `

  showLoading(true)

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: overpassQuery,
      headers: {
        "Content-Type": "text/plain",
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    processFruitData(data.elements)
  } catch (error) {
    console.error("Error loading data:", error)
    alert("Chyba při načítání dat. Zkuste to prosím znovu.")
  } finally {
    // Store current bounds for comparison
    lastLoadBounds = map.getBounds()
    showLoading(false)
  }
}

// Process fruit data from Overpass API
function processFruitData(elements) {
  allFruits = []

  // Reset fruit counts
  Object.keys(fruitTypes).forEach((key) => {
    fruitTypes[key].count = 0
  })

  elements.forEach((element) => {
    let lat, lon

    // Get coordinates based on element type
    if (element.type === "node") {
      lat = element.lat
      lon = element.lon
    } else if (element.type === "way" && element.geometry) {
      // Use center of way
      const coords = element.geometry
      lat = coords.reduce((sum, coord) => sum + coord.lat, 0) / coords.length
      lon = coords.reduce((sum, coord) => sum + coord.lon, 0) / coords.length
    } else {
      return // Skip if no coordinates
    }

    const fruit = {
      id: element.id,
      lat: lat,
      lon: lon,
      tags: element.tags || {},
      type: element.type,
    }

    // Determine fruit type
    const fruitType = determineFruitType(fruit.tags)
    fruit.fruitType = fruitType
    fruitTypes[fruitType].count++

    allFruits.push(fruit)
  })

  updateFruitCounts()
  applyFilters()
}

// Determine fruit type from OSM tags
function determineFruitType(tags) {
  const fruit = tags.fruit || tags.produce || tags["understorey:plant"] || ""
  const species = tags.species || ""
  const name = tags.name || ""

  const allText = (fruit + " " + species + " " + name).toLowerCase()

  if (allText.includes("apple") || allText.includes("jablko") || allText.includes("malus")) return "apple"
  if (allText.includes("pear") || allText.includes("hruška") || allText.includes("pyrus")) return "pear"
  if (allText.includes("cherry") || allText.includes("třešeň") || allText.includes("prunus")) return "cherry"
  if (allText.includes("plum") || allText.includes("švestka") || allText.includes("slíva")) return "plum"
  if (allText.includes("walnut") || allText.includes("ořech") || allText.includes("juglans")) return "walnut"
  if (allText.includes("hazelnut") || allText.includes("lískový") || allText.includes("corylus")) return "hazelnut"
  if (allText.includes("blackberry") || allText.includes("ostružina") || allText.includes("rubus")) return "blackberry"
  if (allText.includes("raspberry") || allText.includes("malina")) return "raspberry"
  if (
    allText.includes("bilberry") ||
    allText.includes("blueberry") ||
    allText.includes("borůvka") ||
    allText.includes("vaccinium") ||
    allText.includes("myrtillus")
  )
    return "bilberry"
  if (
    allText.includes("wild strawberry") ||
    allText.includes("strawberry") ||
    allText.includes("lesní jahoda") ||
    allText.includes("jahoda") ||
    allText.includes("fragaria")
  )
    return "wild_strawberry"
  if (allText.includes("elderberry") || allText.includes("bezinka") || allText.includes("sambucus")) return "elderberry"
  if (allText.includes("rosehip") || allText.includes("šípek") || allText.includes("rosa")) return "rosehip"
  if (allText.includes("chestnut") || allText.includes("kaštan") || allText.includes("castanea")) return "chestnut"
  if (allText.includes("mushroom") || allText.includes("houba") || allText.includes("fungi")) return "mushroom"

  return "other"
}

// Apply active filters
function applyFilters() {
  if (activeFilters.size === 0) {
    filteredFruits = [...allFruits]
  } else {
    filteredFruits = allFruits.filter((fruit) => activeFilters.has(fruit.fruitType))
  }

  displayFruitsOnMap()
  updateStats()
}

// Display fruits on map
function displayFruitsOnMap() {
  markersLayer.clearLayers()

  filteredFruits.forEach((fruit) => {
    const fruitInfo = fruitTypes[fruit.fruitType]

    // Create custom marker
    const marker = L.marker([fruit.lat, fruit.lon], {
      icon: L.divIcon({
        className: "fruit-marker",
        html: fruitInfo.emoji,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    })

    // Create popup content
    const popupContent = createPopupContent(fruit, fruitInfo)
    marker.bindPopup(popupContent)

    markersLayer.addLayer(marker)
  })
}

// Create popup content for markers
function createPopupContent(fruit, fruitInfo) {
  const template = document.getElementById("popup-template")
  const popup = template.content.cloneNode(true)

  popup.querySelector(".popup-icon").textContent = fruitInfo.emoji
  popup.querySelector(".popup-title").textContent = fruitInfo.name

  const infoDiv = popup.querySelector(".popup-info")

  // Add basic info
  if (fruit.tags.name) {
    const p = document.createElement("p")
    p.innerHTML = `<strong>Název:</strong> ${fruit.tags.name}`
    infoDiv.appendChild(p)
  }

  if (fruit.tags.description) {
    const p = document.createElement("p")
    p.innerHTML = `<strong>Popis:</strong> ${fruit.tags.description}`
    infoDiv.appendChild(p)
  }

  // Add coordinates
  const coordsP = document.createElement("p")
  coordsP.innerHTML = `<strong>Souřadnice:</strong> ${fruit.lat.toFixed(5)}, ${fruit.lon.toFixed(5)}`
  infoDiv.appendChild(coordsP)

  // Add tags
  const tagsDiv = popup.querySelector(".popup-tags")
  Object.entries(fruit.tags).forEach(([key, value]) => {
    if (key !== "name" && key !== "description") {
      const tag = document.createElement("span")
      tag.className = "popup-tag"
      tag.textContent = `${key}: ${value}`
      tagsDiv.appendChild(tag)
    }
  })

  return popup
}

// Update fruit counts in filters
function updateFruitCounts() {
  Object.entries(fruitTypes).forEach(([key, fruit]) => {
    const countElement = document.getElementById(`count-${key}`)
    if (countElement) {
      countElement.textContent = fruit.count
    }
  })
}

// Update statistics
function updateStats() {
  document.getElementById("total-count").textContent = allFruits.length
  document.getElementById("visible-count").textContent = filteredFruits.length
}

// Search for location
async function searchLocation() {
  const query = document.getElementById("location-search").value.trim()
  if (!query) return

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
    )
    const data = await response.json()

    if (data.length > 0) {
      const result = data[0]
      map.setView([Number.parseFloat(result.lat), Number.parseFloat(result.lon)], 13)
    } else {
      alert("Místo nebylo nalezeno.")
    }
  } catch (error) {
    console.error("Error searching location:", error)
    alert("Chyba při vyhledávání místa.")
  }
}

// Go to user's current location
function goToMyLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lon = position.coords.longitude
        map.setView([lat, lon], 15)

        // Add temporary marker for user location
        const userMarker = L.marker([lat, lon], {
          icon: L.divIcon({
            className: "fruit-marker",
            html: "📍",
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
        }).addTo(map)

        setTimeout(() => {
          map.removeLayer(userMarker)
        }, 3000)
      },
      (error) => {
        alert("Nepodařilo se získat vaši polohu.")
      },
    )
  } else {
    alert("Geolokace není podporována vaším prohlížečem.")
  }
}

// Clear all data
function clearData() {
  allFruits = []
  filteredFruits = []
  markersLayer.clearLayers()

  // Reset counts
  Object.keys(fruitTypes).forEach((key) => {
    fruitTypes[key].count = 0
  })

  updateFruitCounts()
  updateStats()

  // Clear filters
  activeFilters.clear()
  document.querySelectorAll(".filter-checkbox").forEach((checkbox) => {
    checkbox.classList.remove("active")
    checkbox.querySelector("input").checked = false
  })
}

// Toggle sidebar (mobile)
function toggleSidebar() {
  document.querySelector(".sidebar").classList.toggle("open")
}

// Toggle auto-loading
function toggleAutoLoad() {
  autoLoadEnabled = !autoLoadEnabled
  const button = document.getElementById("auto-load-toggle")

  if (autoLoadEnabled) {
    button.textContent = "🔄 Auto-načítání: ZAP"
    button.classList.remove("disabled")
  } else {
    button.textContent = "⏸️ Auto-načítání: VYP"
    button.classList.add("disabled")
  }
}

// Show/hide loading overlay
function showLoading(show) {
  const overlay = document.getElementById("loading-overlay")
  if (show) {
    overlay.classList.remove("hidden")
  } else {
    overlay.classList.add("hidden")
  }
}

// Handle window resize
window.addEventListener("resize", () => {
  if (window.innerWidth > 768) {
    document.querySelector(".sidebar").classList.remove("open")
  }
})
