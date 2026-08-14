(function () {
    "use strict";

    const SEARCH_INDEX_URL =
        "/assets/data/writings-search-index.json";

    function initWritingsCatalog() {
        const catalog = document.querySelector(
            "[data-writings-catalog]"
        );

        const searchEngine =
            window.WritingsSearch;

        if (!catalog || !searchEngine) return;

        const searchInput = catalog.querySelector(
            "[data-writing-search]"
        );

        const clearSearchButton =
            catalog.querySelector(
                "[data-clear-search]"
            );

        const filterButtons = Array.from(
            catalog.querySelectorAll(
                "[data-writing-filter]"
            )
        );

        const resetButtons = Array.from(
            catalog.querySelectorAll(
                "[data-reset-writing-filters]"
            )
        );

        const cards = Array.from(
            catalog.querySelectorAll(
                "[data-writing-card]"
            )
        );

        const grid = catalog.querySelector(
            "[data-writing-grid]"
        );

        const resultsCount =
            catalog.querySelector(
                "[data-writing-results-count]"
            );

        const searchStatus =
            catalog.querySelector(
                "[data-writing-search-status]"
            );

        const noResults =
            catalog.querySelector(
                "[data-writing-no-results]"
            );

        const additionalFilters =
            catalog.querySelector(
                "[data-writing-additional-filters]"
            );

        const contextFilter =
            catalog.querySelector(
                "[data-writing-context-filter]"
            );

        const yearFilter =
            catalog.querySelector(
                "[data-writing-year-filter]"
            );

        const statusFilter =
            catalog.querySelector(
                "[data-writing-status-filter]"
            );

        if (
            !searchInput ||
            !clearSearchButton ||
            filterButtons.length === 0 ||
            cards.length === 0 ||
            !grid ||
            !resultsCount ||
            !noResults
        ) {
            return;
        }

        const initialParams =
            new URLSearchParams(
                window.location.search
            );

        const allowedFilters = new Set(
            filterButtons.map(
                (button) =>
                    button.dataset.writingFilter
            )
        );

        const requestedType =
            searchEngine.normalize(
                initialParams.get("type")
            );

        const originalCardOrder = new Map(
            cards.map(
                (card, index) => [
                    card,
                    index
                ]
            )
        );

        const cardById = new Map(
            cards.map((card) => [
                cardId(card),
                card
            ])
        );

        let activeType =
            allowedFilters.has(requestedType)
                ? requestedType
                : "all";

        let searchIndexLoaded = false;
        let searchConfig = {};

        let preparedPieces = cards
            .map(pieceFromCard)
            .map(searchEngine.preparePiece);

        searchInput.value =
            initialParams.get("q") || "";

        function cardId(card) {
            const link = card.querySelector(
                ".writings-piece-action[href]"
            );

            if (!link) return "";

            const pathname = new URL(
                link.href,
                window.location.href
            ).pathname;

            return decodeURIComponent(pathname)
                .replace(/^\/+|\/+$/g, "")
                .replace(/^writings\//, "")
                .replace(/\//g, "--");
        }

        function definitionListData(card) {
            const metadata = {};

            card.querySelectorAll(
                ".writings-piece-meta > div"
            ).forEach((row) => {
                const label =
                    row.querySelector("dt");

                const value =
                    row.querySelector("dd");

                if (label && value) {
                    metadata[
                        label.textContent.trim()
                    ] =
                        value.textContent.trim();
                }
            });

            return metadata;
        }

        function pieceFromCard(card) {
            const metadata =
                definitionListData(card);

            const link = card.querySelector(
                ".writings-piece-action[href]"
            );

            return {
                id: cardId(card),

                url: link
                    ? new URL(
                        link.href,
                        window.location.href
                    ).pathname
                    : "",

                title:
                    card.querySelector("h3")
                        ?.textContent
                        .trim() || "",

                types:
                    (
                        card.dataset
                            .writingTypes || ""
                    )
                        .split(" ")
                        .filter(Boolean),

                tags: Array.from(
                    card.querySelectorAll(
                        ".writings-piece-tags span"
                    )
                ).map(
                    (tag) =>
                        tag.textContent.trim()
                ),

                summary:
                    card.querySelector(
                        ".writings-piece-summary"
                    )?.textContent.trim() || "",

                context:
                    metadata.Context || "",

                project:
                    metadata.Project || "",

                status:
                    metadata.Status || "",

                year: "",
                metadata,

                keywords:
                    card.dataset
                        .searchTerms || "",

                body: ""
            };
        }

        function populateFilter(
            select,
            values,
            allLabel,
            requestedValue
        ) {
            if (!select) return false;

            const uniqueValues =
                Array.from(
                    new Map(
                        values
                            .filter(Boolean)
                            .map((value) => [
                                searchEngine
                                    .normalize(
                                        value
                                    ),
                                value
                            ])
                    ).values()
                ).sort(
                    (first, second) =>
                        first.localeCompare(
                            second
                        )
                );

            const wrapper = select.closest(
                "[data-additional-filter]"
            );

            select.replaceChildren();

            select.add(
                new Option(
                    allLabel,
                    "all"
                )
            );

            uniqueValues.forEach((value) => {
                select.add(
                    new Option(
                        value,
                        searchEngine.normalize(
                            value
                        )
                    )
                );
            });

            const normalizedRequest =
                searchEngine.normalize(
                    requestedValue
                );

            const requestedOptionExists =
                Array.from(
                    select.options
                ).some(
                    (option) =>
                        option.value ===
                        normalizedRequest
                );

            select.value =
                requestedOptionExists
                    ? normalizedRequest
                    : "all";

            const isUseful =
                uniqueValues.length > 1;

            if (wrapper) {
                wrapper.hidden = !isUseful;
            }

            return isUseful;
        }

        function populateAdditionalFilters() {
            if (!additionalFilters) return;

            const contextUseful =
                populateFilter(
                    contextFilter,
                    preparedPieces.map(
                        (piece) =>
                            piece.project ||
                            piece.context
                    ),
                    "All contexts and projects",
                    initialParams.get(
                        "context"
                    )
                );

            const yearUseful =
                populateFilter(
                    yearFilter,
                    preparedPieces.map(
                        (piece) =>
                            piece.year
                    ),
                    "All years",
                    initialParams.get(
                        "year"
                    )
                );

            const statusUseful =
                populateFilter(
                    statusFilter,
                    preparedPieces.map(
                        (piece) =>
                            piece.status
                    ),
                    "All statuses",
                    initialParams.get(
                        "status"
                    )
                );

            additionalFilters.hidden =
                !(
                    contextUseful ||
                    yearUseful ||
                    statusUseful
                );
        }

        function matchesSelectFilter(
            piece,
            select,
            valueGetter
        ) {
            if (
                !select ||
                select.value === "all"
            ) {
                return true;
            }

            return (
                searchEngine.normalize(
                    valueGetter(piece)
                ) === select.value
            );
        }

        function ensureMatchBox(card) {
            let box = card.querySelector(
                "[data-writing-match]"
            );

            if (box) return box;

            box =
                document.createElement("div");

            box.className =
                "writings-search-match";

            box.dataset.writingMatch = "";
            box.hidden = true;

            box.innerHTML = `
                <p
                    class="writings-search-match-label"
                    data-writing-match-label>
                </p>
                <p
                    class="writings-search-match-excerpt"
                    data-writing-match-excerpt>
                </p>
            `;

            const action =
                card.querySelector(
                    ".writings-piece-action"
                );

            if (action) action.before(box);
            else card.append(box);

            return box;
        }

        function appendHighlightedExcerpt(
            element,
            excerpt
        ) {
            element.replaceChildren();

            if (excerpt.prefix) {
                element.append(
                    document.createTextNode("…")
                );
            }

            let position = 0;

            excerpt.ranges.forEach(
                (range) => {
                    if (
                        range.start > position
                    ) {
                        element.append(
                            document
                                .createTextNode(
                                    excerpt.text
                                        .slice(
                                            position,
                                            range.start
                                        )
                                )
                        );
                    }

                    const mark =
                        document
                            .createElement(
                                "mark"
                            );

                    mark.textContent =
                        excerpt.text.slice(
                            range.start,
                            range.end
                        );

                    element.append(mark);

                    position = range.end;
                }
            );

            if (
                position <
                excerpt.text.length
            ) {
                element.append(
                    document.createTextNode(
                        excerpt.text.slice(
                            position
                        )
                    )
                );
            }

            if (excerpt.suffix) {
                element.append(
                    document.createTextNode("…")
                );
            }
        }

        function showMatch(
            card,
            result,
            hasQuery
        ) {
            const box =
                ensureMatchBox(card);

            if (
                !hasQuery ||
                !result ||
                !result.matched
            ) {
                box.hidden = true;
                return;
            }

            const label =
                box.querySelector(
                    "[data-writing-match-label]"
                );

            const excerptElement =
                box.querySelector(
                    "[data-writing-match-excerpt]"
                );

            const excerpt =
                searchEngine.buildExcerpt(
                    result
                );

            label.textContent =
                searchEngine
                    .describeMatchedFields(
                        result.matchedFields
                    );

            if (excerpt) {
                appendHighlightedExcerpt(
                    excerptElement,
                    excerpt
                );

                excerptElement.hidden =
                    false;
            } else {
                excerptElement
                    .replaceChildren();

                excerptElement.hidden =
                    true;
            }

            box.hidden = false;
        }

        function setUrlFilter(
            url,
            name,
            value
        ) {
            if (
                !value ||
                value === "all"
            ) {
                url.searchParams.delete(
                    name
                );
            } else {
                url.searchParams.set(
                    name,
                    value
                );
            }
        }

        function updateUrl(hasQuery) {
            const url = new URL(
                window.location.href
            );

            if (hasQuery) {
                url.searchParams.set(
                    "q",
                    searchInput.value.trim()
                );
            } else {
                url.searchParams.delete("q");
            }

            setUrlFilter(
                url,
                "type",
                activeType
            );

            setUrlFilter(
                url,
                "context",
                contextFilter?.value ||
                    "all"
            );

            setUrlFilter(
                url,
                "year",
                yearFilter?.value ||
                    "all"
            );

            setUrlFilter(
                url,
                "status",
                statusFilter?.value ||
                    "all"
            );

            window.history.replaceState(
                null,
                "",
                `${url.pathname}` +
                `${url.search}` +
                `${url.hash}`
            );
        }

        function renderCatalog() {
            const query =
                searchInput.value.trim();

            const hasQuery =
                searchEngine.parseQuery(
                    query,
                    searchConfig
                ).length > 0;

            const rankedCards = [];

            preparedPieces.forEach(
                (piece) => {
                    const card =
                        cardById.get(
                            piece.id
                        );

                    if (!card) return;

                    const result =
                        searchEngine
                            .searchPiece(
                                piece,
                                query,
                                searchConfig
                            );

                    const matchesType =
                        activeType === "all" ||
                        piece.types.includes(
                            activeType
                        );

                    const matchesContext =
                        matchesSelectFilter(
                            piece,
                            contextFilter,
                            (candidate) =>
                                candidate.project ||
                                candidate.context
                        );

                    const matchesYear =
                        matchesSelectFilter(
                            piece,
                            yearFilter,
                            (candidate) =>
                                candidate.year
                        );

                    const matchesStatus =
                        matchesSelectFilter(
                            piece,
                            statusFilter,
                            (candidate) =>
                                candidate.status
                        );

                    const isVisible =
                        result.matched &&
                        matchesType &&
                        matchesContext &&
                        matchesYear &&
                        matchesStatus;

                    card.hidden =
                        !isVisible;

                    showMatch(
                        card,
                        result,
                        hasQuery &&
                        isVisible
                    );

                    rankedCards.push({
                        card,
                        score:
                            result.score,
                        visible:
                            isVisible,
                        originalIndex:
                            originalCardOrder
                                .get(card)
                    });
                }
            );

            rankedCards.sort(
                (first, second) => {
                    if (
                        first.visible !==
                        second.visible
                    ) {
                        return first.visible
                            ? -1
                            : 1;
                    }

                    if (
                        hasQuery &&
                        second.score !==
                            first.score
                    ) {
                        return (
                            second.score -
                            first.score
                        );
                    }

                    return (
                        first.originalIndex -
                        second.originalIndex
                    );
                }
            );

            grid.append(
                ...rankedCards.map(
                    (item) => item.card
                )
            );

            const visibleCount =
                rankedCards.filter(
                    (item) =>
                        item.visible
                ).length;

            filterButtons.forEach(
                (button) => {
                    button.setAttribute(
                        "aria-pressed",
                        String(
                            button.dataset
                                .writingFilter ===
                                activeType
                        )
                    );
                }
            );

            resultsCount.textContent =
                `${visibleCount} ` +
                `${
                    visibleCount === 1
                        ? "piece"
                        : "pieces"
                } shown` +
                `${
                    hasQuery &&
                    visibleCount > 1
                        ? " · sorted by relevance"
                        : ""
                }`;

            noResults.hidden =
                visibleCount !== 0 ||
                !searchIndexLoaded;

            clearSearchButton.disabled =
                !hasQuery;

            const hasAdditionalFilter =
                [
                    contextFilter,
                    yearFilter,
                    statusFilter
                ].some(
                    (select) =>
                        select &&
                        select.value !==
                            "all"
                );

            const isDefaultView =
                !hasQuery &&
                activeType === "all" &&
                !hasAdditionalFilter;

            resetButtons.forEach(
                (button) => {
                    button.disabled =
                        isDefaultView;
                }
            );

            updateUrl(hasQuery);
        }

        function resetCatalog() {
            searchInput.value = "";
            activeType = "all";

            [
                contextFilter,
                yearFilter,
                statusFilter
            ].forEach((select) => {
                if (select) {
                    select.value = "all";
                }
            });

            renderCatalog();
            searchInput.focus();
        }

        async function loadSearchIndex() {
            try {
                const response =
                    await fetch(
                        SEARCH_INDEX_URL,
                        {
                            credentials:
                                "same-origin"
                        }
                    );

                if (!response.ok) {
                    throw new Error(
                        `Search index returned ` +
                        `${response.status}.`
                    );
                }

                const rawIndex =
                    await response.json();

                const preparedIndex =
                    searchEngine.prepareIndex(
                        rawIndex
                    );

                if (
                    !preparedIndex
                        .pieces.length
                ) {
                    throw new Error(
                        "The search index does " +
                        "not contain any pieces."
                    );
                }

                preparedPieces =
                    preparedIndex.pieces
                        .filter((piece) =>
                            cardById.has(
                                piece.id
                            )
                        );

                searchConfig =
                    preparedIndex.config;

                populateAdditionalFilters();

                searchIndexLoaded = true;

                if (searchStatus) {
                    searchStatus.textContent =
                        `Search includes card ` +
                        `details and the complete ` +
                        `text of ` +
                        `${preparedPieces.length} ` +
                        `${
                            preparedPieces.length ===
                            1
                                ? "piece"
                                : "pieces"
                        }. Quoted phrases and ` +
                        `close spelling mistakes ` +
                        `are supported.`;
                }
            } catch (error) {
                searchIndexLoaded = true;

                if (searchStatus) {
                    searchStatus.textContent =
                        "Full-text search is " +
                        "temporarily unavailable. " +
                        "Titles, tags, summaries, " +
                        "and card details are still " +
                        "searchable.";
                }

                console.warn(
                    "Writing search index:",
                    error
                );
            }

            renderCatalog();
        }

        searchInput.addEventListener(
            "input",
            renderCatalog
        );

        clearSearchButton.addEventListener(
            "click",
            () => {
                searchInput.value = "";
                renderCatalog();
                searchInput.focus();
            }
        );

        filterButtons.forEach(
            (button) => {
                button.addEventListener(
                    "click",
                    () => {
                        activeType =
                            button.dataset
                                .writingFilter;

                        renderCatalog();
                    }
                );
            }
        );

        [
            contextFilter,
            yearFilter,
            statusFilter
        ].forEach((select) => {
            if (select) {
                select.addEventListener(
                    "change",
                    renderCatalog
                );
            }
        });

        resetButtons.forEach(
            (button) => {
                button.addEventListener(
                    "click",
                    resetCatalog
                );
            }
        );

        renderCatalog();
        loadSearchIndex();
    }

    document.addEventListener(
        "DOMContentLoaded",
        initWritingsCatalog
    );
})();