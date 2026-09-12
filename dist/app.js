const DB_NAME = "my-cookbook-v1";
const DB_VERSION = 1;
const RECIPE_STORE = "recipes";
const SAMPLE_ID = "welcome-lemon-herb-chicken";

const SAMPLE_RECIPE = {
  id: SAMPLE_ID,
  title: "Lemon & Herb Roast Chicken",
  description: "A bright, golden Sunday roast with crisp potatoes and plenty of rosemary.",
  category: "Dinner",
  tags: ["Roast", "Family", "Gluten-free"],
  prepTime: "20 min",
  cookTime: "1 hr 25 min",
  servings: 6,
  ingredients: [
    "1 whole chicken (about 1.8 kg)",
    "750 g baby potatoes, halved",
    "3 carrots, cut into chunks",
    "2 red onions, quartered",
    "2 lemons, halved",
    "4 sprigs fresh rosemary",
    "3 sprigs fresh thyme",
    "3 tbsp olive oil",
    "4 garlic cloves, lightly crushed",
    "Salt and black pepper"
  ],
  instructions: [
    "Heat the oven to 200°C / 180°C fan.",
    "Pat the chicken dry. Rub with one tablespoon of olive oil, then season generously inside and out.",
    "Put the potatoes, carrots, onions, garlic and herbs in a roasting pan. Toss with the remaining oil and a pinch of salt.",
    "Nestle the chicken among the vegetables. Squeeze over one lemon half and place the remaining halves around the pan.",
    "Roast for 1 hour 25 minutes, or until the juices run clear and the thickest part reaches 75°C.",
    "Rest the chicken for 15 minutes before carving. Toss the vegetables in the pan juices and serve."
  ],
  image: "./assets/sample-roast-chicken.jpg",
  sourceUrl: "",
  favorite: true,
  createdAt: "2026-09-12T12:00:00.000Z",
  updatedAt: "2026-09-12T12:00:00.000Z",
  isSample: true
};

const state = {
  db: null,
  recipes: [],
  activeCategory: "All",
  activeView: "all",
  search: "",
  currentPhoto: "",
  editingImage: "",
  detailId: null,
  detailServings: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value = "") {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function safeImageSrc(value = "") {
  if (value.startsWith("data:image/")) return value;
  if (value.startsWith("./assets/")) return value;
  return "";
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `recipe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECIPE_STORE)) {
        const store = db.createObjectStore(RECIPE_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("category", "category");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbRequest(mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(RECIPE_STORE, mode);
    const store = transaction.objectStore(RECIPE_STORE);
    let request;
    try {
      request = operation(store);
    } catch (error) {
      reject(error);
      return;
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const getAllRecipes = () => dbRequest("readonly", (store) => store.getAll());
const putRecipe = (recipe) => dbRequest("readwrite", (store) => store.put(recipe));
const removeRecipe = (id) => dbRequest("readwrite", (store) => store.delete(id));

async function initialise() {
  setTodayLabel();
  bindEvents();

  try {
    state.db = await openDatabase();
    state.recipes = await getAllRecipes();
    if (!state.recipes.length && !localStorage.getItem("cookbook-welcomed-v1")) {
      await putRecipe(SAMPLE_RECIPE);
      localStorage.setItem("cookbook-welcomed-v1", "true");
      state.recipes = [SAMPLE_RECIPE];
    }
    sortRecipes();
    render();
    registerWebMcpTools();
  } catch (error) {
    console.error("Cookbook storage failed", error);
    showToast("This browser could not open your cookbook storage.", "error");
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Offline setup failed", error));
  }
}

function setTodayLabel() {
  const date = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  $("#todayLabel").textContent = date;
}

function sortRecipes() {
  state.recipes.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

function getVisibleRecipes() {
  const needle = state.search.trim().toLowerCase();
  return state.recipes.filter((recipe) => {
    if (state.activeView === "favorites" && !recipe.favorite) return false;
    if (state.activeCategory !== "All" && recipe.category !== state.activeCategory) return false;
    if (!needle) return true;
    const haystack = [
      recipe.title,
      recipe.description,
      recipe.category,
      ...(recipe.tags || []),
      ...(recipe.ingredients || [])
    ].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}

function render() {
  renderCategories();
  renderRecipes();
  updateNavigation();
}

function renderCategories() {
  const counts = new Map();
  state.recipes.forEach((recipe) => {
    const category = recipe.category || "Uncategorised";
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  const categories = ["All", ...[...counts.keys()].sort((a, b) => a.localeCompare(b))];
  $("#categoryChips").innerHTML = categories.map((category) => {
    const count = category === "All" ? state.recipes.length : counts.get(category);
    const active = category === state.activeCategory;
    return `<button class="category-chip${active ? " active" : ""}" type="button" data-category="${escapeHtml(category)}" aria-pressed="${active}">${escapeHtml(category)} <span>${count}</span></button>`;
  }).join("");
}

function renderRecipes() {
  const recipes = getVisibleRecipes();
  const grid = $("#recipeGrid");
  const empty = $("#emptyState");
  const totalLabel = `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}`;
  $("#recipeCount").textContent = totalLabel;

  if (!recipes.length) {
    grid.innerHTML = "";
    grid.hidden = true;
    empty.hidden = false;
    if (state.search) {
      $("#emptyTitle").textContent = "No matching recipes";
      $("#emptyCopy").textContent = "Try another search or clear a category filter.";
      $("#emptyAddRecipe").textContent = "Add a new recipe";
    } else if (state.activeView === "favorites") {
      $("#emptyTitle").textContent = "No favourites yet";
      $("#emptyCopy").textContent = "Tap the heart on any recipe to keep it close.";
      $("#emptyAddRecipe").textContent = "Browse all recipes";
    } else {
      $("#emptyTitle").textContent = "Your next favourite recipe starts here";
      $("#emptyCopy").textContent = "Add a photo, paste recipe text, or start from scratch.";
      $("#emptyAddRecipe").textContent = "Add your first recipe";
    }
    return;
  }

  grid.hidden = false;
  empty.hidden = true;
  grid.innerHTML = recipes.map(recipeCardMarkup).join("");
}

function recipeCardMarkup(recipe) {
  const image = safeImageSrc(recipe.image);
  const time = totalTime(recipe);
  return `
    <article class="recipe-card" data-recipe-id="${escapeHtml(recipe.id)}">
      <button class="favorite-button" type="button" data-favorite-id="${escapeHtml(recipe.id)}" aria-label="${recipe.favorite ? "Remove from" : "Add to"} favourites" aria-pressed="${Boolean(recipe.favorite)}">${recipe.favorite ? "♥" : "♡"}</button>
      <button class="recipe-card-button" type="button" data-open-id="${escapeHtml(recipe.id)}" aria-label="Open ${escapeHtml(recipe.title)}">
        <div class="recipe-card-image">
          ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" />` : `<div class="recipe-card-placeholder" aria-hidden="true">${escapeHtml((recipe.title || "R").charAt(0).toUpperCase())}</div>`}
          <span class="category-pill">${escapeHtml(recipe.category || "Uncategorised")}</span>
        </div>
        <div class="recipe-card-body">
          <h3 class="recipe-card-title">${escapeHtml(recipe.title)}</h3>
          <p class="recipe-card-description">${escapeHtml(recipe.description || firstIngredientNote(recipe))}</p>
          <div class="recipe-meta">
            ${time ? `<span aria-label="Total time">◷ ${escapeHtml(time)}</span>` : ""}
            ${recipe.servings ? `<span aria-label="Servings">♙ ${escapeHtml(recipe.servings)} serves</span>` : ""}
            <span>${(recipe.ingredients || []).length} ingredients</span>
          </div>
        </div>
      </button>
    </article>`;
}

function totalTime(recipe) {
  if (recipe.prepTime && recipe.cookTime) return `${recipe.prepTime} + ${recipe.cookTime}`;
  return recipe.cookTime || recipe.prepTime || "";
}

function firstIngredientNote(recipe) {
  const ingredients = recipe.ingredients || [];
  return ingredients.length ? `Made with ${ingredients.slice(0, 2).join(", ")}` : "Open to see the full recipe.";
}

function updateNavigation() {
  $$('[data-view]').forEach((button) => {
    const active = button.dataset.view === state.activeView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#pageTitle").textContent = state.activeView === "favorites" ? "Favourites" : "All recipes";
}

function bindEvents() {
  $("#openAddRecipe").addEventListener("click", () => openAddDialog());
  $("#bottomAddRecipe").addEventListener("click", () => openAddDialog());
  $("#emptyAddRecipe").addEventListener("click", () => {
    if (state.activeView === "favorites" && !state.search) setView("all");
    else openAddDialog();
  });
  $("#openSettings").addEventListener("click", () => $("#settingsDialog").showModal());
  $("#mobileSettings")?.addEventListener("click", () => $("#settingsDialog").showModal());

  $$(".close-dialog").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });
  $$('dialog').forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  $$('[data-view]').forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $("#searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderRecipes();
  });
  $("#categoryChips").addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.activeCategory = button.dataset.category;
    render();
  });
  $("#recipeGrid").addEventListener("click", handleGridClick);

  $("#recipePhoto").addEventListener("change", handlePhotoSelection);
  $("#removePhoto").addEventListener("click", clearSelectedPhoto);
  $("#readPhoto").addEventListener("click", readPhotoText);
  $("#continueToReview").addEventListener("click", () => prepareReview(false));
  $("#startBlank").addEventListener("click", () => prepareReview(true));
  $("#backToImport").addEventListener("click", showImportStep);
  $("#recipeForm").addEventListener("submit", saveRecipeFromForm);
  $("#ingredients").addEventListener("input", updateLineCounts);
  $("#instructions").addEventListener("input", updateLineCounts);

  $("#recipeDetail").addEventListener("click", handleDetailAction);
  $("#exportBackup").addEventListener("click", exportBackup);
  $("#importBackup").addEventListener("change", importBackup);
}

function setView(view) {
  state.activeView = view;
  state.activeCategory = "All";
  state.search = "";
  $("#searchInput").value = "";
  render();
}

async function handleGridClick(event) {
  const favoriteButton = event.target.closest("[data-favorite-id]");
  if (favoriteButton) {
    event.stopPropagation();
    await toggleFavorite(favoriteButton.dataset.favoriteId);
    return;
  }
  const openButton = event.target.closest("[data-open-id]");
  if (openButton) openRecipe(openButton.dataset.openId);
}

async function toggleFavorite(id) {
  const recipe = state.recipes.find((item) => item.id === id);
  if (!recipe) return;
  recipe.favorite = !recipe.favorite;
  recipe.updatedAt = new Date().toISOString();
  await putRecipe(recipe);
  sortRecipes();
  render();
  if (state.detailId === id && $("#recipeDialog").open) renderRecipeDetail(recipe);
  showToast(recipe.favorite ? "Added to favourites" : "Removed from favourites");
}

function openAddDialog(recipe = null) {
  resetImportFlow();
  if (recipe) {
    state.editingImage = recipe.image || "";
    fillReview(recipe);
    showReviewStep();
  }
  $("#addRecipeDialog").showModal();
}

function resetImportFlow() {
  $("#rawRecipeText").value = "";
  $("#sourceUrl").value = "";
  $("#recipePhoto").value = "";
  $("#recipeForm").reset();
  $("#recipeId").value = "";
  state.currentPhoto = "";
  state.editingImage = "";
  clearSelectedPhoto();
  showImportStep();
}

function showImportStep() {
  $("#importStep").hidden = false;
  $("#reviewStep").hidden = true;
  $('[data-step-marker="import"]').classList.add("active");
  $('[data-step-marker="review"]').classList.remove("active");
}

function showReviewStep() {
  $("#importStep").hidden = true;
  $("#reviewStep").hidden = false;
  $('[data-step-marker="import"]').classList.add("active");
  $('[data-step-marker="review"]').classList.add("active");
  setTimeout(() => $("#recipeTitle").focus(), 80);
}

async function handlePhotoSelection(event) {
  const [file] = event.target.files;
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Please choose an image file.", "error");
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    showToast("That photo is too large. Please choose one under 25 MB.", "error");
    return;
  }
  try {
    state.currentPhoto = await compressImage(file);
    $("#photoPreview").src = state.currentPhoto;
    $("#photoPreviewWrap").hidden = false;
    $("#readPhoto").disabled = false;
  } catch (error) {
    console.error(error);
    showToast("I could not open that photo.", "error");
  }
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Image decode failed"));
      image.onload = () => {
        const maxEdge = 1600;
        const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.84));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function clearSelectedPhoto() {
  state.currentPhoto = "";
  $("#recipePhoto").value = "";
  $("#photoPreview").removeAttribute("src");
  $("#photoPreviewWrap").hidden = true;
  $("#readPhoto").disabled = true;
  $("#ocrProgress").hidden = true;
}

async function readPhotoText() {
  if (!state.currentPhoto) return;
  if (!globalThis.Tesseract) {
    showToast("The free text reader did not load. Check your connection and try again.", "error");
    return;
  }
  const button = $("#readPhoto");
  button.disabled = true;
  $("#ocrProgress").hidden = false;
  $("#ocrStatus").textContent = "Preparing the free text reader…";
  $("#ocrProgressBar").style.width = "5%";

  let worker;
  try {
    worker = await globalThis.Tesseract.createWorker("eng", 1, {
      logger(message) {
        if (typeof message.progress === "number") {
          $("#ocrProgressBar").style.width = `${Math.max(5, Math.round(message.progress * 100))}%`;
        }
        if (message.status) $("#ocrStatus").textContent = friendlyOcrStatus(message.status);
      }
    });
    const result = await worker.recognize(state.currentPhoto);
    const text = result.data.text.trim();
    if (!text) throw new Error("No text found");
    $("#rawRecipeText").value = text;
    $("#ocrProgressBar").style.width = "100%";
    $("#ocrStatus").textContent = "Text found — please check it below.";
    showToast("Recipe text extracted");
  } catch (error) {
    console.error("OCR failed", error);
    $("#ocrStatus").textContent = "No clear printed text was found. Try a brighter, straighter photo.";
    showToast("I could not read that photo clearly.", "error");
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    button.disabled = false;
  }
}

function friendlyOcrStatus(status) {
  const messages = {
    "loading tesseract core": "Loading the text reader…",
    "initializing tesseract": "Preparing the text reader…",
    "loading language traineddata": "Loading English recognition…",
    "initializing api": "Getting ready…",
    "recognizing text": "Reading the recipe…"
  };
  return messages[status] || "Reading the recipe…";
}

function prepareReview(blank) {
  const raw = $("#rawRecipeText").value.trim();
  const url = $("#sourceUrl").value.trim();
  if (!blank && !raw) {
    showToast("Add a photo or paste the recipe text first.", "error");
    $("#rawRecipeText").focus();
    return;
  }
  const parsed = blank ? emptyRecipe(url) : parseRecipeText(raw, url);
  fillReview(parsed);
  showReviewStep();
}

function emptyRecipe(sourceUrl = "") {
  return {
    id: "",
    title: "",
    description: "",
    category: "",
    tags: [],
    prepTime: "",
    cookTime: "",
    servings: "",
    ingredients: [],
    instructions: [],
    sourceUrl
  };
}

function parseRecipeText(rawText, sourceUrl = "") {
  const rawLines = rawText.replaceAll("\r", "").split("\n");
  const lines = rawLines.map((line) => line.trim()).filter(Boolean);
  const ingredientsHeader = lines.findIndex((line) => /^ingredients?\s*:?$/i.test(line));
  const instructionsHeader = lines.findIndex((line) => /^(instructions?|directions?|method|preparation)\s*:?$/i.test(line));
  const firstHeader = [ingredientsHeader, instructionsHeader].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? lines.length;
  const preamble = lines.slice(0, firstHeader);
  const title = findTitle(preamble, lines);

  let ingredientLines = [];
  let instructionLines = [];
  if (ingredientsHeader >= 0) {
    const end = instructionsHeader > ingredientsHeader ? instructionsHeader : lines.length;
    ingredientLines = lines.slice(ingredientsHeader + 1, end);
  }
  if (instructionsHeader >= 0) instructionLines = lines.slice(instructionsHeader + 1);

  if (!ingredientLines.length || !instructionLines.length) {
    const bodyStart = Math.min(firstHeader + 1, lines.length);
    const body = lines.slice(bodyStart).filter((line) => !looksLikeMetadata(line));
    const inferredIngredients = body.filter(looksLikeIngredient);
    const inferredInstructions = body.filter((line) => !looksLikeIngredient(line));
    if (!ingredientLines.length) ingredientLines = inferredIngredients;
    if (!instructionLines.length) instructionLines = inferredInstructions;
  }

  ingredientLines = ingredientLines.map(cleanListLine).filter(validRecipeLine);
  instructionLines = instructionLines.map(cleanListLine).filter(validRecipeLine);
  const fullText = lines.join(" ");
  const classification = classifyRecipe(`${title} ${fullText}`);

  return {
    id: "",
    title,
    description: "",
    category: classification.category,
    tags: classification.tags,
    prepTime: extractTime(fullText, "prep"),
    cookTime: extractTime(fullText, "cook"),
    servings: extractServings(fullText),
    ingredients: ingredientLines,
    instructions: instructionLines,
    sourceUrl
  };
}

function findTitle(preamble, allLines) {
  const excluded = /^(recipe|ingredients?|instructions?|directions?|method|prep(?:aration)?\s*time|cook\s*time|total\s*time|serves?|servings?|yield)\b/i;
  const candidates = preamble.filter((line) => !excluded.test(line) && !/^https?:\/\//i.test(line));
  return cleanListLine(candidates[0] || allLines.find((line) => !excluded.test(line)) || "Untitled recipe").slice(0, 100);
}

function looksLikeMetadata(line) {
  return /^(prep(?:aration)?\s*time|cook\s*time|total\s*time|serves?|servings?|yield|notes?)\s*:/i.test(line);
}

function looksLikeIngredient(line) {
  const quantityStart = /^(?:[-•*]\s*)?(?:\d+[\d\s./¼½¾⅓⅔⅛⅜⅝⅞-]*|[¼½¾⅓⅔⅛⅜⅝⅞]|a\s|an\s|one\s|two\s|three\s|four\s|five\s)/i;
  const unit = /\b(?:tsp|tbsp|teaspoons?|tablespoons?|cups?|g|kg|grams?|ml|litres?|liters?|lb|lbs|oz|ounces?|pinch|cloves?|cans?|packages?|slices?|sprigs?)\b/i;
  return quantityStart.test(line) || unit.test(line);
}

function cleanListLine(line) {
  return line.replace(/^\s*(?:[-•*▪◦]+|\d+[.)])\s*/, "").trim();
}

function validRecipeLine(line) {
  return line.length > 1 && !/^(ingredients?|instructions?|directions?|method|preparation)\s*:?$/i.test(line);
}

function extractTime(text, kind) {
  const pattern = new RegExp(`${kind}(?:aration)?(?:\\s+time)?\\s*:?\\s*(\\d+(?:\\s*(?:hours?|hrs?|hr|minutes?|mins?|min))?(?:\\s+\\d+\\s*(?:minutes?|mins?|min))?)`, "i");
  return pattern.exec(text)?.[1]?.trim() || "";
}

function extractServings(text) {
  const match = /(?:serves?|servings?|yield)\s*:?\s*(\d+)/i.exec(text);
  return match ? Number(match[1]) : "";
}

function classifyRecipe(text) {
  const value = text.toLowerCase();
  const categoryRules = [
    ["Breakfast", /\b(?:breakfast|pancakes?|waffles?|omelettes?|omelets?|porridge|granola|smoothie bowls?|french toast)\b/],
    ["Dessert", /\b(?:desserts?|cakes?|cookies?|brownies?|puddings?|ice cream|tarts?|cheesecakes?|mousse|fudge)\b/],
    ["Baking", /\b(?:baking|breads?|loaves?|muffins?|scones?|biscuits?|pastry|dough)\b/],
    ["Soup", /\b(?:soup|chowder|bisque|broth|stew)\b/],
    ["Salad", /\b(?:salad|slaw)\b/],
    ["Drink", /\b(?:drink|cocktail|mocktail|lemonade|smoothie|latte|tea)\b/],
    ["Snack", /\b(?:snack|dip|popcorn|energy balls?|trail mix)\b/],
    ["Side", /\b(?:side dish|roast potatoes|mashed potatoes|vegetable side)\b/],
    ["Lunch", /\b(?:lunch|sandwich|wrap|panini)\b/]
  ];
  const category = categoryRules.find(([, rule]) => rule.test(value))?.[0] || "Dinner";
  const tagRules = [
    ["Italian", /\b(?:pasta|risotto|parmesan|mozzarella|basil|gnocchi|italian)\b/],
    ["Mexican", /\b(?:taco|tortilla|enchilada|quesadilla|salsa|mexican)\b/],
    ["Indian", /\b(?:curry|garam masala|tikka|dal|naan|indian)\b/],
    ["Asian", /\b(?:soy sauce|sesame oil|stir-fry|noodle|miso|ginger|asian)\b/],
    ["Mediterranean", /\b(?:mediterranean|feta|olives|hummus|tahini)\b/],
    ["Vegetarian", /\bvegetarian\b/],
    ["Vegan", /\bvegan\b/],
    ["Gluten-free", /\bgluten[- ]free\b/],
    ["Dairy-free", /\bdairy[- ]free\b/],
    ["Air fryer", /\bair\s*fryer\b/],
    ["Slow cooker", /\b(?:slow cooker|crockpot)\b/],
    ["One pot", /\bone[- ]pot\b/],
    ["Quick", /\b(?:quick|15 minute|20 minute|30 minute)\b/],
    ["Chicken", /\bchicken\b/],
    ["Beef", /\b(?:beef|steak)\b/],
    ["Seafood", /\b(?:fish|salmon|tuna|prawn|shrimp|cod)\b/],
    ["Pasta", /\b(?:pasta|spaghetti|linguine|penne|rigatoni)\b/]
  ];
  const tags = tagRules.filter(([, rule]) => rule.test(value)).map(([name]) => name).slice(0, 6);
  return { category, tags };
}

function fillReview(recipe) {
  $("#recipeId").value = recipe.id || "";
  $("#recipeTitle").value = recipe.title || "";
  $("#recipeDescription").value = recipe.description || "";
  $("#prepTime").value = recipe.prepTime || "";
  $("#cookTime").value = recipe.cookTime || "";
  $("#servings").value = recipe.servings || "";
  $("#category").value = recipe.category || "";
  $("#recipeTags").value = (recipe.tags || []).join(", ");
  $("#ingredients").value = (recipe.ingredients || []).join("\n");
  $("#instructions").value = (recipe.instructions || []).join("\n");
  $("#reviewSourceUrl").value = recipe.sourceUrl || $("#sourceUrl").value || "";

  const image = state.currentPhoto || state.editingImage || safeImageSrc(recipe.image || "");
  if (image) {
    $("#reviewPhoto").src = image;
    $("#reviewPhoto").hidden = false;
    $("#reviewPhotoPlaceholder").hidden = true;
  } else {
    $("#reviewPhoto").hidden = true;
    $("#reviewPhotoPlaceholder").hidden = false;
  }
  updateLineCounts();
}

function linesFromTextarea(selector) {
  return $(selector).value.split("\n").map(cleanListLine).filter(Boolean);
}

function updateLineCounts() {
  const ingredients = linesFromTextarea("#ingredients").length;
  const instructions = linesFromTextarea("#instructions").length;
  $("#ingredientCount").textContent = `${ingredients} ${ingredients === 1 ? "item" : "items"}`;
  $("#instructionCount").textContent = `${instructions} ${instructions === 1 ? "step" : "steps"}`;
}

async function saveRecipeFromForm(event) {
  event.preventDefault();
  const ingredients = linesFromTextarea("#ingredients");
  const instructions = linesFromTextarea("#instructions");
  if (!ingredients.length || !instructions.length) {
    showToast("Add at least one ingredient and one method step.", "error");
    return;
  }
  const existing = state.recipes.find((item) => item.id === $("#recipeId").value);
  const now = new Date().toISOString();
  const recipe = {
    id: existing?.id || makeId(),
    title: $("#recipeTitle").value.trim(),
    description: $("#recipeDescription").value.trim(),
    prepTime: $("#prepTime").value.trim(),
    cookTime: $("#cookTime").value.trim(),
    servings: Number($("#servings").value) || "",
    category: $("#category").value.trim() || "Uncategorised",
    tags: $("#recipeTags").value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
    ingredients,
    instructions,
    sourceUrl: safeUrl($("#reviewSourceUrl").value.trim()),
    image: state.currentPhoto || state.editingImage || existing?.image || "",
    favorite: existing?.favorite || false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    isSample: false
  };

  try {
    await saveRecipeObject(recipe);
    $("#addRecipeDialog").close();
    showToast(existing ? "Recipe updated" : "Recipe saved to your cookbook");
  } catch (error) {
    console.error(error);
    showToast("The recipe could not be saved. Try downloading a backup and freeing some browser storage.", "error");
  }
}

async function saveRecipeObject(recipe) {
  await putRecipe(recipe);
  const index = state.recipes.findIndex((item) => item.id === recipe.id);
  if (index >= 0) state.recipes[index] = recipe;
  else state.recipes.push(recipe);
  sortRecipes();
  render();
  return recipe;
}

function openRecipe(id) {
  const recipe = state.recipes.find((item) => item.id === id);
  if (!recipe) return;
  state.detailId = id;
  state.detailServings = Number(recipe.servings) || null;
  renderRecipeDetail(recipe);
  $("#recipeDialog").showModal();
}

function renderRecipeDetail(recipe) {
  const image = safeImageSrc(recipe.image);
  const source = safeUrl(recipe.sourceUrl);
  const servings = state.detailServings || Number(recipe.servings) || null;
  const factor = recipe.servings && servings ? servings / Number(recipe.servings) : 1;
  $("#recipeDetail").innerHTML = `
    <div class="detail-layout">
      <section class="detail-hero">
        ${image ? `<img src="${escapeHtml(image)}" alt="" />` : `<div class="detail-hero-placeholder" aria-hidden="true">${escapeHtml(recipe.title.charAt(0).toUpperCase())}</div>`}
        <button class="icon-button detail-close" type="button" data-detail-action="close" aria-label="Close recipe">×</button>
        <button class="favorite-button detail-favorite" type="button" data-detail-action="favorite" aria-label="${recipe.favorite ? "Remove from" : "Add to"} favourites" aria-pressed="${Boolean(recipe.favorite)}">${recipe.favorite ? "♥" : "♡"}</button>
        <div class="detail-hero-content">
          <span class="detail-category">${escapeHtml(recipe.category || "Uncategorised")}</span>
          <h2 class="detail-title" id="detailTitle">${escapeHtml(recipe.title)}</h2>
          ${recipe.description ? `<p class="detail-description">${escapeHtml(recipe.description)}</p>` : ""}
          <div class="detail-meta">
            ${recipe.prepTime ? `<span>Prep ${escapeHtml(recipe.prepTime)}</span>` : ""}
            ${recipe.cookTime ? `<span>Cook ${escapeHtml(recipe.cookTime)}</span>` : ""}
            ${recipe.servings ? `<span>Serves ${escapeHtml(recipe.servings)}</span>` : ""}
          </div>
        </div>
      </section>
      <section class="detail-body">
        <div class="detail-toolbar">
          <button class="secondary-button" type="button" data-detail-action="share">Share</button>
          <button class="secondary-button" type="button" data-detail-action="print">Print</button>
          <button class="secondary-button" type="button" data-detail-action="edit">Edit</button>
        </div>
        <section class="detail-section">
          <h3>Ingredients
            ${recipe.servings ? `<span class="serving-control"><button type="button" data-detail-action="servings-down" aria-label="Reduce servings">−</button><span>Serves ${servings}</span><button type="button" data-detail-action="servings-up" aria-label="Increase servings">＋</button></span>` : ""}
          </h3>
          <ul class="ingredient-list">
            ${(recipe.ingredients || []).map((ingredient, index) => `<li class="ingredient-item"><input id="ingredient-${index}" type="checkbox" /><label for="ingredient-${index}">${escapeHtml(scaleIngredient(ingredient, factor))}</label></li>`).join("")}
          </ul>
        </section>
        <section class="detail-section">
          <h3>Method</h3>
          <ul class="method-list">${(recipe.instructions || []).map((step, index) => `<li><span class="method-step-number" aria-hidden="true">${index + 1}</span><span>${escapeHtml(step)}</span></li>`).join("")}</ul>
        </section>
        ${recipe.tags?.length ? `<section class="detail-section"><h3>Tags</h3><div class="tag-list">${recipe.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div></section>` : ""}
        ${source ? `<section class="detail-section"><h3>Original recipe</h3><a class="source-link" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Open the saved source link ↗</a></section>` : ""}
        <button class="text-button danger-button" type="button" data-detail-action="delete">Delete recipe</button>
      </section>
    </div>`;
}

async function handleDetailAction(event) {
  const button = event.target.closest("[data-detail-action]");
  if (!button) return;
  const action = button.dataset.detailAction;
  const recipe = state.recipes.find((item) => item.id === state.detailId);
  if (!recipe) return;

  if (action === "close") $("#recipeDialog").close();
  if (action === "favorite") await toggleFavorite(recipe.id);
  if (action === "print") window.print();
  if (action === "edit") {
    $("#recipeDialog").close();
    openAddDialog(recipe);
  }
  if (action === "share") await shareRecipe(recipe);
  if (action === "servings-down" || action === "servings-up") {
    const delta = action.endsWith("up") ? 1 : -1;
    state.detailServings = Math.max(1, Math.min(99, Number(state.detailServings || recipe.servings) + delta));
    renderRecipeDetail(recipe);
  }
  if (action === "delete") await deleteRecipe(recipe);
}

async function deleteRecipe(recipe) {
  const confirmed = window.confirm(`Delete “${recipe.title}”? This cannot be undone unless it is in a backup.`);
  if (!confirmed) return;
  await removeRecipe(recipe.id);
  state.recipes = state.recipes.filter((item) => item.id !== recipe.id);
  $("#recipeDialog").close();
  render();
  showToast("Recipe deleted");
}

async function shareRecipe(recipe) {
  const text = formatRecipeText(recipe);
  try {
    if (navigator.share) {
      await navigator.share({ title: recipe.title, text });
    } else {
      await navigator.clipboard.writeText(text);
      showToast("Recipe copied to the clipboard");
    }
  } catch (error) {
    if (error?.name !== "AbortError") showToast("The recipe could not be shared.", "error");
  }
}

function formatRecipeText(recipe) {
  return [
    recipe.title,
    recipe.description,
    [recipe.prepTime && `Prep: ${recipe.prepTime}`, recipe.cookTime && `Cook: ${recipe.cookTime}`, recipe.servings && `Serves: ${recipe.servings}`].filter(Boolean).join(" · "),
    "Ingredients",
    ...(recipe.ingredients || []).map((item) => `• ${item}`),
    "",
    "Method",
    ...(recipe.instructions || []).map((item, index) => `${index + 1}. ${item}`),
    recipe.sourceUrl ? `\nSource: ${recipe.sourceUrl}` : ""
  ].filter((part) => part !== undefined && part !== null).join("\n");
}

const unicodeFractions = {
  "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3,
  "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875
};

function scaleIngredient(line, factor) {
  if (!factor || Math.abs(factor - 1) < 0.001) return line;
  const match = /^(\d+\s+)?(\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])(?=\s|[a-z])/i.exec(line);
  if (!match) return line;
  let amount = 0;
  if (match[1]) amount += Number(match[1].trim());
  const part = match[2];
  if (unicodeFractions[part]) amount += unicodeFractions[part];
  else if (part.includes("/")) {
    const [top, bottom] = part.split("/").map(Number);
    amount += top / bottom;
  } else amount += Number(part);
  if (!Number.isFinite(amount)) return line;
  return `${formatAmount(amount * factor)}${line.slice(match[0].length)}`;
}

function formatAmount(value) {
  const whole = Math.floor(value + 0.001);
  const fraction = value - whole;
  const options = [
    [0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.375, "⅜"], [0.5, "½"],
    [0.625, "⅝"], [2 / 3, "⅔"], [0.75, "¾"], [0.875, "⅞"]
  ];
  const nearest = options.reduce((best, item) => Math.abs(item[0] - fraction) < Math.abs(best[0] - fraction) ? item : best, [0, ""]);
  if (Math.abs(nearest[0] - fraction) < 0.045) return `${whole || ""}${nearest[1]}`;
  return Number(value.toFixed(2)).toString();
}

function exportBackup() {
  const payload = {
    app: "My Cookbook",
    version: 1,
    exportedAt: new Date().toISOString(),
    recipes: state.recipes
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `my-cookbook-backup-${date}.cookbook.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Cookbook backup downloaded");
}

async function importBackup(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.recipes)) throw new Error("Invalid backup");
    let imported = 0;
    for (const candidate of data.recipes) {
      const recipe = validateImportedRecipe(candidate);
      if (!recipe) continue;
      await putRecipe(recipe);
      const index = state.recipes.findIndex((item) => item.id === recipe.id);
      if (index >= 0) state.recipes[index] = recipe;
      else state.recipes.push(recipe);
      imported += 1;
    }
    sortRecipes();
    render();
    showToast(`${imported} ${imported === 1 ? "recipe" : "recipes"} restored`);
  } catch (error) {
    console.error(error);
    showToast("That file is not a valid cookbook backup.", "error");
  }
}

function validateImportedRecipe(candidate) {
  if (!candidate || typeof candidate !== "object" || !candidate.title) return null;
  return {
    id: String(candidate.id || makeId()),
    title: String(candidate.title).slice(0, 100),
    description: String(candidate.description || "").slice(0, 180),
    category: String(candidate.category || "Uncategorised").slice(0, 50),
    tags: Array.isArray(candidate.tags) ? candidate.tags.map(String).slice(0, 12) : [],
    prepTime: String(candidate.prepTime || "").slice(0, 40),
    cookTime: String(candidate.cookTime || "").slice(0, 40),
    servings: Number(candidate.servings) || "",
    ingredients: Array.isArray(candidate.ingredients) ? candidate.ingredients.map(String).filter(Boolean).slice(0, 300) : [],
    instructions: Array.isArray(candidate.instructions) ? candidate.instructions.map(String).filter(Boolean).slice(0, 200) : [],
    image: safeImageSrc(String(candidate.image || "")),
    sourceUrl: safeUrl(String(candidate.sourceUrl || "")),
    favorite: Boolean(candidate.favorite),
    createdAt: candidate.createdAt || new Date().toISOString(),
    updatedAt: candidate.updatedAt || new Date().toISOString(),
    isSample: Boolean(candidate.isSample)
  };
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  $("#toastRegion").append(toast);
  setTimeout(() => toast.remove(), 3600);
}

function registerWebMcpTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const register = (tool) => {
    try {
      Promise.resolve(context.registerTool(tool)).catch((error) => console.warn("Cookbook tool registration failed", error));
    } catch (error) {
      console.warn("Cookbook tool registration failed", error);
    }
  };

  register({
    name: "list_recipes",
    title: "List cookbook recipes",
    description: "List the recipes saved in this cookbook, optionally limited to favourites or one category.",
    inputSchema: {
      type: "object",
      properties: { category: { type: "string" }, favoritesOnly: { type: "boolean" } },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute(input = {}) {
      const recipes = state.recipes.filter((recipe) => (!input.category || recipe.category === input.category) && (!input.favoritesOnly || recipe.favorite));
      return { count: recipes.length, recipes: recipes.map(recipeSummary) };
    }
  });

  register({
    name: "search_recipes",
    title: "Search cookbook",
    description: "Search recipe titles, categories, tags, and ingredients in this cookbook.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", minLength: 1 } },
      required: ["query"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute(input) {
      if (!input?.query || typeof input.query !== "string") throw new Error("query is required");
      const query = input.query.toLowerCase();
      const recipes = state.recipes.filter((recipe) => [recipe.title, recipe.category, ...(recipe.tags || []), ...(recipe.ingredients || [])].join(" ").toLowerCase().includes(query));
      return { count: recipes.length, recipes: recipes.map(recipeSummary) };
    }
  });

  register({
    name: "create_recipe",
    title: "Create cookbook recipe",
    description: "Create and save a complete recipe in this cookbook. Ingredients and instructions must be supplied as arrays of lines.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1 },
        ingredients: { type: "array", items: { type: "string" }, minItems: 1 },
        instructions: { type: "array", items: { type: "string" }, minItems: 1 },
        category: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        prepTime: { type: "string" },
        cookTime: { type: "string" },
        servings: { type: "number" },
        sourceUrl: { type: "string" }
      },
      required: ["title", "ingredients", "instructions"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    async execute(input) {
      if (!input?.title || !Array.isArray(input.ingredients) || !input.ingredients.length || !Array.isArray(input.instructions) || !input.instructions.length) {
        throw new Error("title, ingredients, and instructions are required");
      }
      const inferred = classifyRecipe([input.title, ...input.ingredients].join(" "));
      const now = new Date().toISOString();
      const recipe = validateImportedRecipe({
        id: makeId(),
        title: input.title,
        ingredients: input.ingredients,
        instructions: input.instructions,
        category: input.category || inferred.category,
        tags: input.tags || inferred.tags,
        prepTime: input.prepTime,
        cookTime: input.cookTime,
        servings: input.servings,
        sourceUrl: input.sourceUrl,
        createdAt: now,
        updatedAt: now
      });
      await saveRecipeObject(recipe);
      return { saved: true, recipe: recipeSummary(recipe) };
    }
  });
}

function recipeSummary(recipe) {
  return {
    id: recipe.id,
    title: recipe.title,
    category: recipe.category,
    tags: recipe.tags || [],
    servings: recipe.servings || null,
    prepTime: recipe.prepTime || null,
    cookTime: recipe.cookTime || null,
    favorite: Boolean(recipe.favorite)
  };
}

document.addEventListener("DOMContentLoaded", initialise);

