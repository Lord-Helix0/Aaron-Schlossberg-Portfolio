(function () {
    "use strict";

    const FIELD_DEFINITIONS = [
        { key: "title", label: "title", weight: 120 },
        { key: "tags", label: "types and tags", weight: 55 },
        { key: "keywords", label: "keywords and aliases", weight: 50 },
        { key: "summary", label: "summary", weight: 35 },
        { key: "context", label: "context or project", weight: 28 },
        { key: "metadata", label: "piece details", weight: 22 },
        { key: "status", label: "status or year", weight: 12 },
        { key: "body", label: "full text", weight: 8 }
    ];

    function normalize(value) {
        return String(value || "")
            .toLocaleLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[’']/g, "")
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function unique(values) {
        return Array.from(
            new Set(values.filter(Boolean))
        );
    }

    function normalizedSynonymGroups(groups) {
        return (Array.isArray(groups) ? groups : [])
            .map((group) =>
                unique(group.map(normalize))
            )
            .filter((group) => group.length > 1);
    }

    function expandSynonyms(value, synonymGroups) {
        const matchingGroup = synonymGroups.find(
            (group) => group.includes(value)
        );

        if (!matchingGroup) return [value];

        return [
            value,
            ...matchingGroup.filter(
                (candidate) => candidate !== value
            )
        ];
    }

    function parseQuery(rawQuery, config) {
        const raw = String(rawQuery || "").trim();

        const synonymGroups = normalizedSynonymGroups(
            config && config.synonymGroups
        );

        if (!raw) return [];

        const normalizedFullQuery = normalize(
            raw.replace(/^["“]|["”]$/g, "")
        );

        const fullQueryGroup = synonymGroups.find(
            (group) =>
                group.includes(normalizedFullQuery)
        );

        if (fullQueryGroup) {
            return [{
                value: normalizedFullQuery,
                variants: expandSynonyms(
                    normalizedFullQuery,
                    synonymGroups
                ),
                exactPhrase: false
            }];
        }

        const units = [];
        const pattern =
            /"([^"]+)"|“([^”]+)”|(\S+)/g;

        let match;

        while ((match = pattern.exec(raw)) !== null) {
            const quotedValue =
                match[1] || match[2] || "";

            const value = normalize(
                quotedValue || match[3]
            );

            if (!value) continue;

            units.push({
                value,
                variants: expandSynonyms(
                    value,
                    synonymGroups
                ),
                exactPhrase: Boolean(quotedValue)
            });
        }

        return units;
    }

    function metadataText(metadata) {
        return Object.entries(metadata || {})
            .map(([label, value]) =>
                `${label} ${value}`
            )
            .join(" ");
    }

    function preparePiece(piece) {
        const rawFields = {
            title: piece.title || "",
            tags: [
                ...(piece.types || []),
                ...(piece.tags || [])
            ].join(" "),
            keywords: piece.keywords || "",
            summary: piece.summary || "",
            context: [
                piece.context,
                piece.project
            ].filter(Boolean).join(" "),
            metadata: metadataText(piece.metadata),
            status: [
                piece.status,
                piece.year
            ].filter(Boolean).join(" "),
            body: piece.body || ""
        };

        const fields = FIELD_DEFINITIONS.map(
            (definition) => {
                const text =
                    rawFields[definition.key];

                const normalized =
                    normalize(text);

                return {
                    ...definition,
                    text,
                    normalized,
                    tokens: unique(
                        normalized.split(" ")
                    )
                };
            }
        );

        return {
            ...piece,
            types: (piece.types || []).map(normalize),
            fields
        };
    }

    function prepareIndex(index) {
        return {
            ...index,
            config: index.config || {},
            pieces: (index.pieces || [])
                .map(preparePiece)
        };
    }

    function typoThreshold(length) {
        if (length <= 5) return 1;
        if (length <= 12) return 2;
        return 3;
    }

    function damerauLevenshtein(
        firstValue,
        secondValue,
        maximumDistance
    ) {
        const first = String(firstValue);
        const second = String(secondValue);

        if (
            Math.abs(first.length - second.length) >
            maximumDistance
        ) {
            return maximumDistance + 1;
        }

        const rows = first.length + 1;
        const columns = second.length + 1;

        const matrix = Array.from(
            { length: rows },
            () => new Array(columns).fill(0)
        );

        for (let row = 0; row < rows; row += 1) {
            matrix[row][0] = row;
        }

        for (
            let column = 0;
            column < columns;
            column += 1
        ) {
            matrix[0][column] = column;
        }

        for (let row = 1; row < rows; row += 1) {
            let rowMinimum = maximumDistance + 1;

            for (
                let column = 1;
                column < columns;
                column += 1
            ) {
                const substitutionCost =
                    first[row - 1] ===
                    second[column - 1]
                        ? 0
                        : 1;

                matrix[row][column] = Math.min(
                    matrix[row - 1][column] + 1,
                    matrix[row][column - 1] + 1,
                    matrix[row - 1][column - 1] +
                        substitutionCost
                );

                if (
                    row > 1 &&
                    column > 1 &&
                    first[row - 1] ===
                        second[column - 2] &&
                    first[row - 2] ===
                        second[column - 1]
                ) {
                    matrix[row][column] = Math.min(
                        matrix[row][column],
                        matrix[row - 2][column - 2] +
                            substitutionCost
                    );
                }

                rowMinimum = Math.min(
                    rowMinimum,
                    matrix[row][column]
                );
            }

            if (rowMinimum > maximumDistance) {
                return maximumDistance + 1;
            }
        }

        return matrix[first.length][second.length];
    }

    function fuzzyTokenMatch(
        term,
        tokens,
        minimumTypoLength
    ) {
        if (
            term.length < minimumTypoLength ||
            term.includes(" ")
        ) {
            return null;
        }

        const maximumDistance =
            typoThreshold(term.length);

        let best = null;

        for (const token of tokens) {
            if (
                Math.abs(token.length - term.length) >
                    maximumDistance ||
                token.length < minimumTypoLength
            ) {
                continue;
            }

            const distance = damerauLevenshtein(
                term,
                token,
                maximumDistance
            );

            if (
                distance <= maximumDistance &&
                (!best || distance < best.distance)
            ) {
                best = {
                    token,
                    distance
                };

                if (distance === 1) break;
            }
        }

        return best;
    }

    function matchVariantInField(
        variant,
        field,
        minimumTypoLength
    ) {
        if (!field.normalized) return null;

        if (field.normalized === variant) {
            return {
                quality: 1.5,
                kind: "exact",
                matchedValue: variant
            };
        }

        if (variant.includes(" ")) {
            if (field.normalized.includes(variant)) {
                return {
                    quality: 1.3,
                    kind: "phrase",
                    matchedValue: variant
                };
            }

            return null;
        }

        if (field.tokens.includes(variant)) {
            return {
                quality: 1,
                kind: "word",
                matchedValue: variant
            };
        }

        const prefixToken = field.tokens.find(
            (token) =>
                token.length >= 3 &&
                variant.length >= 3 &&
                token.startsWith(variant)
        );

        if (prefixToken) {
            return {
                quality: 0.82,
                kind: "partial",
                matchedValue: prefixToken
            };
        }

        const fuzzyMatch = fuzzyTokenMatch(
            variant,
            field.tokens,
            minimumTypoLength
        );

        if (fuzzyMatch) {
            return {
                quality: Math.max(
                    0.42,
                    0.62 -
                        fuzzyMatch.distance * 0.07
                ),
                kind: "typo",
                matchedValue: fuzzyMatch.token,
                distance: fuzzyMatch.distance
            };
        }

        return null;
    }

    function matchUnitInField(
        unit,
        field,
        config
    ) {
        const minimumTypoLength =
            Number(config.minimumTypoLength) || 4;

        let best = null;

        unit.variants.forEach(
            (variant, variantIndex) => {
                const match = matchVariantInField(
                    variant,
                    field,
                    minimumTypoLength
                );

                if (!match) return;

                const synonymAdjustment =
                    variantIndex === 0
                        ? 1
                        : 0.92;

                const phraseAdjustment =
                    unit.exactPhrase
                        ? 1.12
                        : 1;

                const score =
                    field.weight *
                    match.quality *
                    synonymAdjustment *
                    phraseAdjustment;

                if (!best || score > best.score) {
                    best = {
                        ...match,
                        score,
                        fieldKey: field.key,
                        fieldLabel: field.label,
                        fieldText: field.text,
                        queryValue: unit.value,
                        usedSynonym:
                            variantIndex !== 0
                    };
                }
            }
        );

        return best;
    }

    function searchPiece(
        piece,
        rawQuery,
        config
    ) {
        const units = parseQuery(
            rawQuery,
            config
        );

        if (units.length === 0) {
            return {
                matched: true,
                score: 0,
                matches: [],
                matchedFields: [],
                excerptMatch: null
            };
        }

        const matches = [];

        for (const unit of units) {
            let bestForUnit = null;

            for (const field of piece.fields) {
                const fieldMatch =
                    matchUnitInField(
                        unit,
                        field,
                        config
                    );

                if (
                    fieldMatch &&
                    (
                        !bestForUnit ||
                        fieldMatch.score >
                            bestForUnit.score
                    )
                ) {
                    bestForUnit = fieldMatch;
                }
            }

            if (!bestForUnit) {
                return {
                    matched: false,
                    score: 0,
                    matches: [],
                    matchedFields: [],
                    excerptMatch: null
                };
            }

            matches.push(bestForUnit);
        }

        const normalizedQuery = normalize(
            rawQuery.replace(/["“”]/g, "")
        );

        const titleField = piece.fields.find(
            (field) => field.key === "title"
        );

        let score = matches.reduce(
            (total, match) =>
                total + match.score,
            0
        );

        if (
            titleField.normalized ===
            normalizedQuery
        ) {
            score += 220;
        } else if (
            normalizedQuery.length >= 3 &&
            titleField.normalized.includes(
                normalizedQuery
            )
        ) {
            score += 80;
        }

        const matchedFields = unique(
            matches.map(
                (match) => match.fieldKey
            )
        );

        const bodyMatch = matches.find(
            (match) =>
                match.fieldKey === "body"
        );

        const excerptMatch =
            bodyMatch ||
            matches.reduce(
                (best, match) =>
                    !best ||
                    match.score > best.score
                        ? match
                        : best,
                null
            );

        return {
            matched: true,
            score,
            matches,
            matchedFields,
            excerptMatch
        };
    }

    function normalizeWithMap(value) {
        const source = String(value || "");
        let text = "";
        const map = [];

        for (
            let index = 0;
            index < source.length;
        ) {
            const codePoint =
                source.codePointAt(index);

            const character =
                String.fromCodePoint(codePoint);

            const normalizedCharacter =
                character
                    .toLocaleLowerCase()
                    .normalize("NFKD")
                    .replace(
                        /[\u0300-\u036f]/g,
                        ""
                    )
                    .replace(/[’']/g, "")
                    .replace(
                        /[^\p{L}\p{N}]+/gu,
                        " "
                    );

            for (
                const normalizedPart of
                normalizedCharacter
            ) {
                if (normalizedPart === " ") {
                    if (
                        !text ||
                        text.endsWith(" ")
                    ) {
                        continue;
                    }
                }

                text += normalizedPart;
                map.push(index);
            }

            index += character.length;
        }

        if (text.endsWith(" ")) {
            text = text.slice(0, -1);
            map.pop();
        }

        return {
            text,
            map
        };
    }

    function rawRangeForNormalizedMatch(
        mapped,
        start,
        length,
        rawLength
    ) {
        const rawStart =
            mapped.map[start] ?? 0;

        const lastMappedIndex =
            mapped.map[
                start + length - 1
            ] ?? rawStart;

        const rawEnd = Math.min(
            rawLength,
            lastMappedIndex + 1
        );

        return {
            start: rawStart,
            end: rawEnd
        };
    }

    function trimExcerptBoundaries(
        source,
        start,
        end
    ) {
        let adjustedStart = start;
        let adjustedEnd = end;

        if (adjustedStart > 0) {
            const nextSpace = source.indexOf(
                " ",
                adjustedStart
            );

            if (
                nextSpace !== -1 &&
                nextSpace < adjustedEnd
            ) {
                adjustedStart = nextSpace + 1;
            }
        }

        if (adjustedEnd < source.length) {
            const previousSpace =
                source.lastIndexOf(
                    " ",
                    adjustedEnd
                );

            if (
                previousSpace > adjustedStart
            ) {
                adjustedEnd = previousSpace;
            }
        }

        return {
            start: adjustedStart,
            end: adjustedEnd
        };
    }

    function highlightRanges(text, values) {
        const mapped =
            normalizeWithMap(text);

        const ranges = [];

        unique(values.map(normalize))
            .filter(
                (value) => value.length >= 2
            )
            .forEach((value) => {
                let fromIndex = 0;

                while (
                    fromIndex <
                    mapped.text.length
                ) {
                    const matchIndex =
                        mapped.text.indexOf(
                            value,
                            fromIndex
                        );

                    if (matchIndex === -1) {
                        break;
                    }

                    ranges.push(
                        rawRangeForNormalizedMatch(
                            mapped,
                            matchIndex,
                            value.length,
                            text.length
                        )
                    );

                    fromIndex =
                        matchIndex +
                        Math.max(
                            1,
                            value.length
                        );
                }
            });

        ranges.sort(
            (first, second) =>
                first.start - second.start
        );

        return ranges.reduce(
            (merged, range) => {
                const previous =
                    merged[
                        merged.length - 1
                    ];

                if (
                    previous &&
                    range.start <= previous.end
                ) {
                    previous.end = Math.max(
                        previous.end,
                        range.end
                    );
                } else {
                    merged.push({
                        ...range
                    });
                }

                return merged;
            },
            []
        );
    }

    function buildExcerpt(
        searchResult,
        maximumLength = 240
    ) {
        const match =
            searchResult.excerptMatch;

        if (
            !match ||
            match.fieldKey === "title"
        ) {
            return null;
        }

        const source = String(
            match.fieldText || ""
        ).trim();

        if (!source) return null;

        const mappedSource =
            normalizeWithMap(source);

        const normalizedMatchValue =
            normalize(match.matchedValue);

        const normalizedMatchIndex =
            mappedSource.text.indexOf(
                normalizedMatchValue
            );

        let rawMatch = {
            start: 0,
            end: Math.min(
                source.length,
                1
            )
        };

        if (normalizedMatchIndex !== -1) {
            rawMatch =
                rawRangeForNormalizedMatch(
                    mappedSource,
                    normalizedMatchIndex,
                    normalizedMatchValue.length,
                    source.length
                );
        }

        let start = Math.max(
            0,
            rawMatch.start -
                Math.floor(
                    maximumLength * 0.4
                )
        );

        let end = Math.min(
            source.length,
            start + maximumLength
        );

        if (end === source.length) {
            start = Math.max(
                0,
                end - maximumLength
            );
        }

        ({ start, end } =
            trimExcerptBoundaries(
                source,
                start,
                end
            ));

        const text = source
            .slice(start, end)
            .trim();

        const highlightValues =
            searchResult.matches
                .filter(
                    (resultMatch) =>
                        resultMatch.fieldKey ===
                        match.fieldKey
                )
                .map(
                    (resultMatch) =>
                        resultMatch.matchedValue
                );

        return {
            text,
            prefix: start > 0,
            suffix: end < source.length,
            ranges: highlightRanges(
                text,
                highlightValues
            )
        };
    }

    function describeMatchedFields(
        fieldKeys
    ) {
        const labels = unique(
            FIELD_DEFINITIONS
                .filter((definition) =>
                    fieldKeys.includes(
                        definition.key
                    )
                )
                .map(
                    (definition) =>
                        definition.label
                )
        );

        if (labels.length === 0) {
            return "Match found";
        }

        if (labels.length === 1) {
            return `Matched in ${labels[0]}`;
        }

        if (labels.length === 2) {
            return (
                `Matched in ${labels[0]} ` +
                `and ${labels[1]}`
            );
        }

        return (
            `Matched in ` +
            `${labels
                .slice(0, -1)
                .join(", ")}, and ` +
            `${labels.at(-1)}`
        );
    }

    window.WritingsSearch = {
        buildExcerpt,
        describeMatchedFields,
        normalize,
        parseQuery,
        prepareIndex,
        preparePiece,
        searchPiece
    };
})();