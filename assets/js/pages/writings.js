(function () {
    "use strict";

    function normalize(value) {
        return String(value || "")
            .toLocaleLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function initWritingsCatalog() {
        const catalog = document.querySelector("[data-writings-catalog]");

        if (!catalog) return;

        const searchInput = catalog.querySelector("[data-writing-search]");
        const clearSearchButton = catalog.querySelector("[data-clear-search]");
        const filterButtons = Array.from(
            catalog.querySelectorAll("[data-writing-filter]")
        );
        const resetButtons = Array.from(
            catalog.querySelectorAll("[data-reset-writing-filters]")
        );
        const cards = Array.from(catalog.querySelectorAll("[data-writing-card]"));
        const resultsCount = catalog.querySelector("[data-writing-results-count]");
        const noResults = catalog.querySelector("[data-writing-no-results]");

        if (
            !searchInput ||
            !clearSearchButton ||
            filterButtons.length === 0 ||
            cards.length === 0 ||
            !resultsCount ||
            !noResults
        ) {
            return;
        }

        const allowedFilters = new Set(
            filterButtons.map((button) => button.dataset.writingFilter)
        );
        const initialParams = new URLSearchParams(window.location.search);
        const requestedFilter = normalize(initialParams.get("type"));

        let activeFilter = allowedFilters.has(requestedFilter)
            ? requestedFilter
            : "all";

        searchInput.value = initialParams.get("q") || "";

        function updateUrl(query) {
            const url = new URL(window.location.href);

            if (query) {
                url.searchParams.set("q", searchInput.value.trim());
            } else {
                url.searchParams.delete("q");
            }

            if (activeFilter === "all") {
                url.searchParams.delete("type");
            } else {
                url.searchParams.set("type", activeFilter);
            }

            window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        }

        function renderCatalog() {
            const query = normalize(searchInput.value);
            const queryTerms = query.split(" ").filter(Boolean);
            let visibleCount = 0;

            cards.forEach((card) => {
                const cardTypes = normalize(card.dataset.writingTypes).split(" ");
                const searchableText = normalize(
                    `${card.textContent} ${card.dataset.searchTerms || ""}`
                );
                const matchesSearch =
                    queryTerms.length === 0 ||
                    queryTerms.every((term) => searchableText.includes(term));
                const matchesFilter =
                    activeFilter === "all" || cardTypes.includes(activeFilter);
                const isVisible = matchesSearch && matchesFilter;

                card.hidden = !isVisible;

                if (isVisible) visibleCount += 1;
            });

            filterButtons.forEach((button) => {
                button.setAttribute(
                    "aria-pressed",
                    String(button.dataset.writingFilter === activeFilter)
                );
            });

            resultsCount.textContent = `${visibleCount} ${
                visibleCount === 1 ? "piece" : "pieces"
            } shown`;
            noResults.hidden = visibleCount !== 0;
            clearSearchButton.disabled = !query;

            const isDefaultView = !query && activeFilter === "all";
            resetButtons.forEach((button) => {
                button.disabled = isDefaultView;
            });

            updateUrl(query);
        }

        function resetCatalog() {
            searchInput.value = "";
            activeFilter = "all";
            renderCatalog();
            searchInput.focus();
        }

        searchInput.addEventListener("input", renderCatalog);

        clearSearchButton.addEventListener("click", () => {
            searchInput.value = "";
            renderCatalog();
            searchInput.focus();
        });

        filterButtons.forEach((button) => {
            button.addEventListener("click", () => {
                activeFilter = button.dataset.writingFilter;
                renderCatalog();
            });
        });

        resetButtons.forEach((button) => {
            button.addEventListener("click", resetCatalog);
        });

        renderCatalog();
    }

    document.addEventListener("DOMContentLoaded", initWritingsCatalog);
})();