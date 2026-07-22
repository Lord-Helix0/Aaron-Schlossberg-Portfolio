console.log("main.js loaded");

/* ------------------------------------------------------------
  Helpers
------------------------------------------------------------ */
async function loadText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return await res.text();
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return await res.json();
}

function safeStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

/* ------------------------------------------------------------
  Partials loader (header/footer/highlights)
  - If a placeholder exists on the page, this injects the partial.
------------------------------------------------------------ */
async function loadPartials() {
  const jobs = [];

  const headerHost = document.getElementById("header-placeholder");
  if (headerHost) {
    jobs.push(
      loadText("/_partials/header.html").then((html) => {
        headerHost.innerHTML = html;
      })
    );
  }

  const footerHost = document.getElementById("footer-placeholder");
  if (footerHost) {
    jobs.push(
      loadText("/_partials/footer.html").then((html) => {
        footerHost.innerHTML = html;
      })
    );
  }

  const highlightsHost = document.getElementById("highlights-placeholder");
  if (highlightsHost) {
    jobs.push(
      loadText("/_partials/highlights.html").then((html) => {
        highlightsHost.innerHTML = html;
      })
    );
  }

  const pageConstructionHost = document.getElementById("page-construction-placeholder");
  if (pageConstructionHost) {
    jobs.push(
      loadText("/_partials/page-construction.html").then((html) => {
        pageConstructionHost.innerHTML = html;
      })
    );
  }

  // Don’t fail the whole page if one partial fails
  await Promise.allSettled(jobs);
}

/* ------------------------------------------------------------
  Config-driven links
  Usage: <a data-config-link="instagram">Instagram</a>
------------------------------------------------------------ */
function applyConfigLinks(config) {
  const linkMap = config?.links || {};

  document.querySelectorAll("[data-config-link]").forEach((el) => {
    const key = safeStr(el.getAttribute("data-config-link"));
    const url = safeStr(linkMap[key]);

    // If no URL exists, hide it if requested
    const shouldHide = el.hasAttribute("data-hide-if-missing");

    if (!url) {
      if (shouldHide) el.style.display = "none";
      return;
    }

    // If it's an anchor, set href; otherwise, set textContent
    if (el.tagName.toLowerCase() === "a") {
      el.setAttribute("href", url);

      // Optional: new tab behavior
      if (el.hasAttribute("data-external")) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener");
      }
    } else {
      el.textContent = url;
    }
  });
}

/* ------------------------------------------------------------
  Config-driven text and URLs

  Usage note:
  <span data-config-text="siteName">Fallback text</span>
  <a data-config-href="baseUrl" href="/">Fallback link</a>
------------------------------------------------------------ */
function getConfigValue(config, path) {
  return path
    .split(".")
    .reduce((current, key) => current?.[key], config);
}

function applyConfigValues(config) {
  document.querySelectorAll("[data-config-text]").forEach((el) => {
    const path = safeStr(el.getAttribute("data-config-text"));
    const value = safeStr(getConfigValue(config, path));

    if (value) {
      el.textContent = value;
    }
  });

  document.querySelectorAll("[data-config-href]").forEach((el) => {
    const path = safeStr(el.getAttribute("data-config-href"));
    const value = safeStr(getConfigValue(config, path));

    if (value && el.tagName.toLowerCase() === "a") {
      el.setAttribute("href", value);
    }
  });
}

/* ------------------------------------------------------------
  Footer init (auto-year)
------------------------------------------------------------ */
function initFooterYear() {
  const yearSpan = document.getElementById("current-year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();
}

/* ------------------------------------------------------------
  Copy helper (kept from your original)
------------------------------------------------------------ */
function copyToClipboard(text, type) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      alert(`${type} has been copied to clipboard!\n\n${type}: ${text}`);
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
    });
}

// Expose globally so existing onclick handlers keep working
window.copyToClipboard = copyToClipboard;

function initCarousels() {
    document.querySelectorAll("[data-carousel]").forEach((carousel) => {
        const track = carousel.querySelector(".carousel-track");
        const prev = carousel.querySelector(".carousel-btn-prev");
        const next = carousel.querySelector(".carousel-btn-next");

        if (!track || !prev || !next || track.dataset.carouselReady === "true") return;

        const originalCards = Array.from(track.children);
        if (originalCards.length <= 1) {
            prev.style.display = "none";
            next.style.display = "none";
            return;
        }

        track.dataset.carouselReady = "true";

        originalCards.forEach((card) => {
            track.appendChild(card.cloneNode(true));
        });

        originalCards.slice().reverse().forEach((card) => {
            track.insertBefore(card.cloneNode(true), track.firstChild);
        });

        const getOriginalWidth = () => track.scrollWidth / 3;

        requestAnimationFrame(() => {
        track.scrollLeft = getOriginalWidth();
        });

        function getStep() {
            const card = track.querySelector(".quora-card");
            if (!card) return 320;

            const gap = parseFloat(getComputedStyle(track).gap) || 0;
            return card.getBoundingClientRect().width + gap;
        }

        function keepInfinite() {
        const originalWidth = getOriginalWidth();

        if (track.scrollLeft >= originalWidth * 2) {
            track.scrollLeft -= originalWidth;
        } else if (track.scrollLeft <= 0) {
            track.scrollLeft += originalWidth;
        }
        }

        next.addEventListener("click", () => {
            track.scrollBy({ left: getStep(), behavior: "smooth" });
            setTimeout(keepInfinite, 450);
        });

        prev.addEventListener("click", () => {
            track.scrollBy({ left: -getStep(), behavior: "smooth" });
            setTimeout(keepInfinite, 450);
        });

        track.addEventListener("scroll", () => {
            window.clearTimeout(track._carouselTimer);
            track._carouselTimer = window.setTimeout(keepInfinite, 120);
        });
    });
}

/* ------------------------------------------------------------
  Init
------------------------------------------------------------ */
async function init() {
    // 1) Load header/footer/highlights first
    await loadPartials();
    initCarousels();

    // 2) After footer is injected, set the year
    initFooterYear();

    // 3) Load config once and apply all config links
    try {
        const config = await loadJSON("/data/config.json");
        applyConfigLinks(config);
        applyConfigValues(config);
    } catch (e) {
        console.warn("Config load failed:", e);
    }
}

document.addEventListener("DOMContentLoaded", init);