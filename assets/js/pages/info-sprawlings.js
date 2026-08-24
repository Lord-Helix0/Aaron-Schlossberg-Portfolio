(function () {
    "use strict";

    const SEARCH_INDEX_URL =
        "/assets/data/info-sprawlings-search-index.json";

    function initInfoSprawlingsCatalog() {
        const catalog = document.querySelector(
            "[data-info-catalog]"
        );
        const searchEngine = window.SiteSearch;

        if (!catalog || !searchEngine) return;

        const searchInput = catalog.querySelector(
            "[data-info-search]"
        );
        const clearButton = catalog.querySelector(
            "[data-info-clear-search]"
        );
        const typeFilter = catalog.querySelector(
            "[data-info-type-filter]"
        );
        const topicFilter = catalog.querySelector(
            "[data-info-topic-filter]"
        );
        const typeFilterWrap = catalog.querySelector(
            "[data-info-type-filter-wrap]"
        );
        const topicFilterWrap = catalog.querySelector(
            "[data-info-topic-filter-wrap]"
        );
        const resetButtons = Array.from(
            catalog.querySelectorAll(
                "[data-info-reset]"
            )
        );
        const grid = catalog.querySelector(
            "[data-info-grid]"
        );
        const count = catalog.querySelector(
            "[data-info-results-count]"
        );
        const status = catalog.querySelector(
            "[data-info-search-status]"
        );
        const noResults = catalog.querySelector(
            "[data-info-no-results]"
        );

        if (
            !searchInput ||
            !clearButton ||
            !typeFilter ||
            !topicFilter ||
            !grid ||
            !count ||
            !noResults
        ) {
            return;
        }

        const initialParams = new URLSearchParams(
            window.location.search
        );

        let items = [];
        let config = {};
        let fieldDefinitions = [];
        let loaded = false;

        searchInput.value =
            initialParams.get("q") || "";

        function normalize(value) {
            return searchEngine.normalize(value);
        }

        function createElement(
            tagName,
            className,
            textContent
        ) {
            const element =
                document.createElement(tagName);

            if (className) {
                element.className = className;
            }

            if (textContent !== undefined) {
                element.textContent = textContent;
            }

            return element;
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

            excerpt.ranges.forEach((range) => {
                if (range.start > position) {
                    element.append(
                        document.createTextNode(
                            excerpt.text.slice(
                                position,
                                range.start
                            )
                        )
                    );
                }

                const mark =
                    document.createElement("mark");

                mark.textContent =
                    excerpt.text.slice(
                        range.start,
                        range.end
                    );

                element.append(mark);
                position = range.end;
            });

            if (position < excerpt.text.length) {
                element.append(
                    document.createTextNode(
                        excerpt.text.slice(position)
                    )
                );
            }

            if (excerpt.suffix) {
                element.append(
                    document.createTextNode("…")
                );
            }
        }

        function matchingSectionId(item, query) {
            const units = searchEngine.parseQuery(
                query,
                config
            );

            if (!units.length) return "";

            const section = (item.sections || [])
                .find((candidate) => {
                    const searchable = normalize(
                        `${candidate.heading} ` +
                        `${candidate.text}`
                    );

                    return units.every((unit) =>
                        unit.variants.some(
                            (variant) =>
                                searchable.includes(
                                    variant
                                )
                        )
                    );
                });

            return section?.id || "";
        }

        function buildCard(item, result, query) {
            const card = createElement(
                "article",
                "info-card"
            );
            const type = createElement(
                "p",
                "info-card-type",
                item.entityType
            );
            const heading = createElement("h3");
            const titleLink = createElement(
                "a",
                "info-card-title-link",
                item.title
            );

            titleLink.href = item.url;
            heading.append(titleLink);

            const summary = createElement(
                "p",
                "info-card-summary",
                item.summary
            );
            const topics = createElement(
                "div",
                "info-card-topics"
            );

            (item.topics || [])
                .slice(0, 4)
                .forEach((topic) => {
                    topics.append(
                        createElement(
                            "span",
                            "",
                            topic
                        )
                    );
                });

            card.append(
                type,
                heading,
                summary,
                topics
            );

            const hasQuery =
                searchEngine.parseQuery(
                    query,
                    config
                ).length > 0;

            if (hasQuery && result?.matched) {
                const matchBox = createElement(
                    "div",
                    "info-card-match"
                );
                const matchLabel = createElement(
                    "p",
                    "info-card-match-label",
                    searchEngine
                        .describeMatchedFields(
                            result.matchedFields,
                            fieldDefinitions
                        )
                );
                const excerpt =
                    searchEngine.buildExcerpt(result);

                matchBox.append(matchLabel);

                if (excerpt) {
                    const excerptElement =
                        createElement(
                            "p",
                            "info-card-match-excerpt"
                        );

                    appendHighlightedExcerpt(
                        excerptElement,
                        excerpt
                    );

                    matchBox.append(excerptElement);
                }

                card.append(matchBox);
            }

            const action = createElement(
                "a",
                "info-button info-button-primary info-card-link",
                "Read this article"
            );
            const sectionId = matchingSectionId(
                item,
                query
            );

            action.href = sectionId
                ? `${item.url}#${sectionId}`
                : item.url;
            action.setAttribute(
                "aria-label",
                `Read the Info Sprawling about ${item.title}`
            );

            card.append(action);
            return card;
        }

        function populateFilter(
            select,
            wrapper,
            values,
            allLabel,
            requestedValue
        ) {
            const labelsByValue = new Map();

            values.filter(Boolean).forEach((value) => {
                labelsByValue.set(
                    normalize(value),
                    value
                );
            });

            const labels = Array.from(
                labelsByValue.values()
            ).sort((first, second) =>
                first.localeCompare(second)
            );

            select.replaceChildren(
                new Option(allLabel, "all")
            );

            labels.forEach((label) => {
                select.add(
                    new Option(
                        label,
                        normalize(label)
                    )
                );
            });

            const requested = normalize(
                requestedValue
            );
            const hasRequestedOption =
                Array.from(select.options)
                    .some(
                        (option) =>
                            option.value === requested
                    );

            select.value = hasRequestedOption
                ? requested
                : "all";

            if (wrapper) {
                wrapper.hidden =
                    labels.length <= 1;
            }
        }

        function populateFilters() {
            populateFilter(
                typeFilter,
                typeFilterWrap,
                items.map(
                    (item) => item.entityType
                ),
                "All types",
                initialParams.get("type")
            );

            populateFilter(
                topicFilter,
                topicFilterWrap,
                items.flatMap(
                    (item) => item.topics || []
                ),
                "All topics",
                initialParams.get("topic")
            );
        }

        function setUrlValue(url, name, value) {
            if (!value || value === "all") {
                url.searchParams.delete(name);
            } else {
                url.searchParams.set(name, value);
            }
        }

        function updateUrl(query) {
            const url = new URL(
                window.location.href
            );

            setUrlValue(url, "q", query);
            setUrlValue(
                url,
                "type",
                typeFilter.value
            );
            setUrlValue(
                url,
                "topic",
                topicFilter.value
            );

            window.history.replaceState(
                null,
                "",
                `${url.pathname}${url.search}${url.hash}`
            );
        }

        function render() {
            const query = searchInput.value.trim();
            const hasQuery =
                searchEngine.parseQuery(
                    query,
                    config
                ).length > 0;

            const results = items
                .map((item, originalIndex) => ({
                    item,
                    originalIndex,
                    result: searchEngine.searchPiece(
                        item,
                        query,
                        config
                    )
                }))
                .filter(({ item, result }) => {
                    const matchesType =
                        typeFilter.value === "all" ||
                        normalize(item.entityType) ===
                            typeFilter.value;
                    const matchesTopic =
                        topicFilter.value === "all" ||
                        (item.topics || [])
                            .some(
                                (topic) =>
                                    normalize(topic) ===
                                    topicFilter.value
                            );

                    return (
                        result.matched &&
                        matchesType &&
                        matchesTopic
                    );
                })
                .sort((first, second) => {
                    if (
                        hasQuery &&
                        second.result.score !==
                            first.result.score
                    ) {
                        return (
                            second.result.score -
                            first.result.score
                        );
                    }

                    return (
                        first.originalIndex -
                        second.originalIndex
                    );
                });

            grid.replaceChildren(
                ...results.map(({ item, result }) =>
                    buildCard(
                        item,
                        result,
                        query
                    )
                )
            );

            count.textContent =
                `${results.length} ` +
                `${results.length === 1
                    ? "article"
                    : "articles"} shown` +
                `${hasQuery && results.length > 1
                    ? " · sorted by relevance"
                    : ""}`;

            noResults.hidden =
                !loaded || results.length !== 0;
            clearButton.disabled = !hasQuery;

            const isDefault =
                !hasQuery &&
                typeFilter.value === "all" &&
                topicFilter.value === "all";

            resetButtons.forEach((button) => {
                button.disabled = isDefault;
            });

            updateUrl(query);
        }

        function reset() {
            searchInput.value = "";
            typeFilter.value = "all";
            topicFilter.value = "all";
            render();
            searchInput.focus();
        }

        async function loadIndex() {
            try {
                const response = await fetch(
                    SEARCH_INDEX_URL,
                    { credentials: "same-origin" }
                );

                if (!response.ok) {
                    throw new Error(
                        `Search index returned ${response.status}.`
                    );
                }

                const prepared =
                    searchEngine.prepareIndex(
                        await response.json()
                    );

                if (!prepared.items.length) {
                    throw new Error(
                        "The knowledge index is empty."
                    );
                }

                items = prepared.items;
                config = prepared.config;
                fieldDefinitions =
                    prepared.fieldDefinitions;

                populateFilters();
                loaded = true;

                if (status) {
                    status.textContent =
                        `Search indexes the entirety of ` +
                        `all ${items.length} ` +
                        `${items.length === 1
                            ? "article"
                            : "articles"}.`;
                }

                render();
            } catch (error) {
                loaded = true;
                count.textContent =
                    "The collection could not be loaded.";

                if (status) {
                    status.textContent =
                        "Knowledge search is temporarily unavailable.";
                }

                console.warn(
                    "Info Sprawlings search index:",
                    error
                );
            }
        }

        let inputTimer;

        searchInput.addEventListener(
            "input",
            () => {
                window.clearTimeout(inputTimer);
                inputTimer = window.setTimeout(
                    render,
                    120
                );
            }
        );
        clearButton.addEventListener(
            "click",
            () => {
                searchInput.value = "";
                render();
                searchInput.focus();
            }
        );
        typeFilter.addEventListener(
            "change",
            render
        );
        topicFilter.addEventListener(
            "change",
            render
        );
        resetButtons.forEach((button) => {
            button.addEventListener(
                "click",
                reset
            );
        });

        loadIndex();
    }

    document.addEventListener(
        "DOMContentLoaded",
        initInfoSprawlingsCatalog
    );
})();