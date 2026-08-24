import {
    cp,
    mkdir,
    readFile,
    readdir,
    rm,
    writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const SCRIPT_DIRECTORY = path.dirname(
    fileURLToPath(import.meta.url)
);
const SITE_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const OUTPUT_ROOT = path.join(SITE_ROOT, "_site");
const SITE_ORIGIN = "https://www.aaronschlossberg.com";

const WRITINGS_PAGE = path.join(
    SITE_ROOT,
    "writings",
    "index.html"
);
const WRITINGS_CONFIG = path.join(
    SITE_ROOT,
    "data",
    "writings-search-config.json"
);
const INFO_DATA_DIRECTORY = path.join(
    SITE_ROOT,
    "data",
    "info-sprawlings"
);
const INFO_CONFIG = path.join(
    SITE_ROOT,
    "data",
    "info-sprawlings-search-config.json"
);

const LOCAL_DATA_DIRECTORY = path.join(
    SITE_ROOT,
    "assets",
    "data"
);
const OUTPUT_DATA_DIRECTORY = path.join(
    OUTPUT_ROOT,
    "assets",
    "data"
);

const WRITINGS_FIELDS = [
    { key: "title", label: "title", weight: 120 },
    { key: "tags", label: "types and tags", weight: 55 },
    {
        key: "keywords",
        label: "keywords and aliases",
        weight: 50
    },
    { key: "summary", label: "summary", weight: 35 },
    {
        key: "context",
        label: "context or project",
        weight: 28
    },
    {
        key: "metadata",
        label: "piece details",
        weight: 22
    },
    {
        key: "status",
        label: "status or year",
        weight: 12
    },
    { key: "body", label: "full text", weight: 8 }
];

const INFO_FIELDS = [
    { key: "title", label: "title", weight: 140 },
    { key: "aliases", label: "aliases", weight: 115 },
    { key: "topics", label: "topics", weight: 80 },
    {
        key: "headings",
        label: "section headings",
        weight: 65
    },
    { key: "summary", label: "summary", weight: 48 },
    {
        key: "entityType",
        label: "knowledge type",
        weight: 35
    },
    {
        key: "related",
        label: "related terms and pages",
        weight: 28
    },
    { key: "body", label: "article text", weight: 9 }
];

const SITE_FIELDS = [
    { key: "title", label: "title", weight: 140 },
    {
        key: "section",
        label: "site section",
        weight: 70
    },
    {
        key: "topics",
        label: "types and topics",
        weight: 60
    },
    { key: "summary", label: "summary", weight: 35 }
];

const EXCLUDED_ROOT_ENTRIES = new Set([
    ".git",
    ".gitignore",
    ".github",
    ".vscode",
    "_site",
    "netlify.toml",
    "node_modules",
    "package-lock.json",
    "package.json",
    "README.md",
    "scripts"
]);

function compactText(value) {
    return String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function unique(values) {
    return Array.from(
        new Set(values.filter(Boolean))
    );
}

function pathnameFromHref(href) {
    const url = new URL(href, SITE_ORIGIN);

    if (url.origin !== SITE_ORIGIN) {
        throw new Error(
            `Expected a local site URL, received: ${href}`
        );
    }

    return decodeURIComponent(url.pathname);
}

function idFromPathname(pathname) {
    return pathname
        .replace(/^\/+|\/+$/g, "")
        .replace(/^writings\//, "")
        .replace(/\//g, "--");
}

function localHtmlFileFromHref(
    href,
    allowedRoots
) {
    const pathname = pathnameFromHref(href);
    const relativePath =
        pathname.replace(/^\/+/, "");

    const isAllowed = allowedRoots.some(
        (root) =>
            relativePath === root ||
            relativePath.startsWith(
                `${root}/`
            )
    );

    if (
        !isAllowed ||
        relativePath.includes("..") ||
        relativePath.includes("\\")
    ) {
        throw new Error(
            `Unsafe or unexpected local page URL: ${href}`
        );
    }

    return relativePath.endsWith(".html")
        ? path.join(SITE_ROOT, relativePath)
        : path.join(
            SITE_ROOT,
            relativePath,
            "index.html"
        );
}

function extractDefinitionList(
    $,
    root,
    selector
) {
    const metadata = {};

    root.find(
        `${selector} > div`
    ).each((_, element) => {
        const row = $(element);
        const label = compactText(
            row.find("dt").first().text()
        );
        const value = compactText(
            row.find("dd").first().text()
        );

        if (label && value) {
            metadata[label] = value;
        }
    });

    return metadata;
}

function firstMetadataValue(
    metadataSources,
    labels
) {
    for (const metadata of metadataSources) {
        for (const label of labels) {
            if (metadata[label]) {
                return metadata[label];
            }
        }
    }

    return "";
}

function textWithBreakSpacing(element) {
    const clone = element.clone();
    clone.find("br").replaceWith(" ");

    return compactText(clone.text());
}

function searchableText($, roots) {
    return compactText(
        roots
            .toArray()
            .map((element) => {
                const clone = $(element).clone();

                clone
                    .find("[data-search-exclude]")
                    .remove();

                return clone.text();
            })
            .join(" ")
    );
}

function labelsFromMetadata(values) {
    return unique(
        (
            Array.isArray(values)
                ? values
                : []
        ).map((value) => {
            if (typeof value === "string") {
                return compactText(value);
            }

            return compactText(
                value?.name ||
                value?.label ||
                value?.title
            );
        })
    );
}

async function writeGeneratedIndex(
    filename,
    index
) {
    const serialized =
        `${JSON.stringify(index, null, 2)}\n`;

    const localFile = path.join(
        LOCAL_DATA_DIRECTORY,
        filename
    );
    const outputFile = path.join(
        OUTPUT_DATA_DIRECTORY,
        filename
    );

    await Promise.all([
        mkdir(
            path.dirname(localFile),
            { recursive: true }
        ),
        mkdir(
            path.dirname(outputFile),
            { recursive: true }
        )
    ]);

    await Promise.all([
        writeFile(
            localFile,
            serialized,
            "utf8"
        ),
        writeFile(
            outputFile,
            serialized,
            "utf8"
        )
    ]);
}

async function copyStaticSite() {
    if (
        path.dirname(OUTPUT_ROOT) !==
            SITE_ROOT ||
        path.basename(OUTPUT_ROOT) !==
            "_site"
    ) {
        throw new Error(
            "Refusing to clear an unexpected output directory."
        );
    }

    await rm(OUTPUT_ROOT, {
        recursive: true,
        force: true
    });

    await mkdir(OUTPUT_ROOT, {
        recursive: true
    });

    const entries = await readdir(
        SITE_ROOT,
        {
            withFileTypes: true
        }
    );

    for (const entry of entries) {
        if (
            EXCLUDED_ROOT_ENTRIES.has(
                entry.name
            ) ||
            entry.name === ".DS_Store"
        ) {
            continue;
        }

        await cp(
            path.join(
                SITE_ROOT,
                entry.name
            ),
            path.join(
                OUTPUT_ROOT,
                entry.name
            ),
            {
                recursive: true,

                filter(source) {
                    return (
                        path.basename(source) !==
                        ".DS_Store"
                    );
                }
            }
        );
    }
}

async function buildWritingsIndex() {
    const [catalogHtml, configText] =
        await Promise.all([
            readFile(
                WRITINGS_PAGE,
                "utf8"
            ),
            readFile(
                WRITINGS_CONFIG,
                "utf8"
            )
        ]);

    const config = JSON.parse(configText);
    const $catalog = load(catalogHtml);

    const cards = $catalog(
        "[data-writing-card]"
    ).toArray();

    if (!cards.length) {
        throw new Error(
            "No live [data-writing-card] elements were found."
        );
    }

    const pieces = [];
    const seenIds = new Set();
    const seenUrls = new Set();

    for (const cardElement of cards) {
        const card =
            $catalog(cardElement);

        const action = card
            .find(
                ".writings-piece-action[href]"
            )
            .first();

        const href =
            action.attr("href");

        if (!href) {
            throw new Error(
                "Every live writing card needs a piece link."
            );
        }

        const url =
            pathnameFromHref(href);

        const id =
            idFromPathname(url);

        if (
            !id ||
            seenIds.has(id) ||
            seenUrls.has(url)
        ) {
            throw new Error(
                `Duplicate or invalid writing URL: ${url}`
            );
        }

        seenIds.add(id);
        seenUrls.add(url);

        const pageFile =
            localHtmlFileFromHref(
                href,
                [
                    "writings",
                    "projects/info-sprawlings"
                ]
            );

        const pageHtml =
            await readFile(
                pageFile,
                "utf8"
            ).catch((error) => {
                throw new Error(
                    `The card for ${url} ` +
                    `points to a missing page: ` +
                    pageFile,
                    { cause: error }
                );
            });

        const $page = load(pageHtml);

        const explicitBodies =
            $page("[data-search-body]");

        const searchableBodies =
            explicitBodies.length
                ? explicitBodies
                : $page(
                    "[data-reading-body]"
                );

        if (!searchableBodies.length) {
            throw new Error(
                `${url} needs a ` +
                `[data-search-body] element ` +
                `around its full text.`
            );
        }

        const body = searchableText(
            $page,
            searchableBodies
        );

        if (!body) {
            throw new Error(
                `${url} has an empty searchable body.`
            );
        }

        const cardMetadata =
            extractDefinitionList(
                $catalog,
                card,
                ".writings-piece-meta"
            );

        const pageMetadata =
            extractDefinitionList(
                $page,
                $page.root(),
                ".writing-piece-meta"
            );

        const metadataSources = [
            cardMetadata,
            pageMetadata
        ];

        const title = compactText(
            card.find("h3").first().text()
        );

        const cardSummary =
            textWithBreakSpacing(
                card
                    .find(
                        ".writings-piece-summary"
                    )
                    .first()
            );

        const pageDeck = compactText(
            $page(
                ".writing-piece-deck"
            ).first().text()
        );

        const pageContext = compactText(
            $page(
                ".writing-piece-context p"
            )
                .toArray()
                .map(
                    (element) =>
                        $page(element).text()
                )
                .join(" ")
        );

        const pageKicker = compactText(
            $page(
                ".writing-piece-kicker"
            ).first().text()
        );

        const pageGenre =
            firstMetadataValue(
                metadataSources,
                ["Genre", "Form"]
            );

        if (!title) {
            throw new Error(
                `The writing card for ${url} ` +
                `has no h3 title.`
            );
        }

        pieces.push({
            id,
            url,
            title,

            types: unique(
                compactText(
                    card.attr(
                        "data-writing-types"
                    )
                )
                    .toLowerCase()
                    .split(" ")
            ),

            tags: unique([
                ...card
                    .find(
                        ".writings-piece-tags span"
                    )
                    .toArray()
                    .map((element) =>
                        compactText(
                            $catalog(
                                element
                            ).text()
                        )
                    ),
                pageKicker,
                pageGenre
            ]),

            summary: unique([
                cardSummary,
                pageDeck,
                pageContext
            ]).join(" "),

            context:
                firstMetadataValue(
                    metadataSources,
                    ["Context"]
                ),

            project:
                firstMetadataValue(
                    metadataSources,
                    ["Project"]
                ),

            status:
                firstMetadataValue(
                    metadataSources,
                    ["Status"]
                ),

            year:
                firstMetadataValue(
                    metadataSources,
                    ["Year", "Published"]
                ),

            metadata: {
                ...pageMetadata,
                ...cardMetadata
            },

            keywords: compactText(
                card.attr(
                    "data-search-terms"
                )
            ),

            body
        });
    }

    const index = {
        version: 2,
        generatedAt:
            new Date().toISOString(),
        collection: "writings",
        fieldDefinitions:
            WRITINGS_FIELDS,

        config: {
            minimumTypoLength:
                Number(
                    config.minimumTypoLength
                ) || 4,

            synonymGroups:
                Array.isArray(
                    config.synonymGroups
                )
                    ? config.synonymGroups
                    : []
        },

        pieces
    };

    await writeGeneratedIndex(
        "writings-search-index.json",
        index
    );

    return index;
}

function validateInfoMetadata(
    metadata,
    filename
) {
    const requiredFields = [
        "id",
        "url",
        "title",
        "entityType",
        "summary",
        "primarySection"
    ];

    for (const field of requiredFields) {
        if (!compactText(metadata[field])) {
            throw new Error(
                `${filename} needs a ` +
                `non-empty ${field}.`
            );
        }
    }

    if (
        metadata.primarySection !==
        "info-sprawlings"
    ) {
        throw new Error(
            `${filename} must use ` +
            `info-sprawlings as its ` +
            `primarySection.`
        );
    }

    if (
        !Array.isArray(
            metadata.collections
        ) ||
        !metadata.collections.includes(
            "info-sprawlings"
        )
    ) {
        throw new Error(
            `${filename} must belong to ` +
            `the info-sprawlings collection.`
        );
    }
}

async function buildInfoSprawlingsIndex() {
    const [entries, configText] =
        await Promise.all([
            readdir(
                INFO_DATA_DIRECTORY,
                {
                    withFileTypes: true
                }
            ),

            readFile(
                INFO_CONFIG,
                "utf8"
            )
        ]);

    const config =
        JSON.parse(configText);

    const filenames = entries
        .filter(
            (entry) =>
                entry.isFile() &&
                entry.name.endsWith(
                    ".json"
                )
        )
        .map((entry) => entry.name)
        .sort(
            (first, second) =>
                first.localeCompare(
                    second
                )
        );

    if (!filenames.length) {
        throw new Error(
            "No Info Sprawlings metadata files were found."
        );
    }

    const items = [];
    const seenIds = new Set();
    const seenUrls = new Set();

    for (const filename of filenames) {
        const metadata = JSON.parse(
            await readFile(
                path.join(
                    INFO_DATA_DIRECTORY,
                    filename
                ),
                "utf8"
            )
        );

        validateInfoMetadata(
            metadata,
            filename
        );

        const url = pathnameFromHref(
            metadata.url
        );

        if (
            seenIds.has(metadata.id) ||
            seenUrls.has(url)
        ) {
            throw new Error(
                `Duplicate Info Sprawling ` +
                `id or URL in ${filename}.`
            );
        }

        seenIds.add(metadata.id);
        seenUrls.add(url);

        const pageFile =
            localHtmlFileFromHref(
                metadata.url,
                ["projects/info-sprawlings"]
            );

        const pageHtml =
            await readFile(
                pageFile,
                "utf8"
            ).catch((error) => {
                throw new Error(
                    `${filename} points to ` +
                    `a missing page: ` +
                    pageFile,
                    { cause: error }
                );
            });

        const $page = load(pageHtml);

        const searchableRoot =
            $page(
                "[data-search-body]"
            ).first();

        if (!searchableRoot.length) {
            throw new Error(
                `${metadata.url} needs a ` +
                `[data-search-body] element.`
            );
        }

        const body = searchableText(
            $page,
            searchableRoot
        );

        if (!body) {
            throw new Error(
                `${metadata.url} has an ` +
                `empty searchable body.`
            );
        }

        const headings = unique(
            searchableRoot
                .find("h2, h3")
                .toArray()
                .filter(
                    (element) =>
                        !$page(element)
                            .closest(
                                "[data-search-exclude]"
                            )
                            .length
                )
                .map((element) =>
                    compactText(
                        $page(element).text()
                    )
                )
        );

        const sections = searchableRoot
            .find("section[id]")
            .toArray()
            .filter(
                (element) =>
                    !$page(element).is(
                        "[data-search-exclude]"
                    )
            )
            .map((element) => {
                const section =
                    $page(element);

                return {
                    id: compactText(
                        section.attr("id")
                    ),

                    heading: compactText(
                        section
                            .find("h2, h3")
                            .first()
                            .text()
                    ),

                    text: searchableText(
                        $page,
                        section
                    )
                };
            })
            .filter(
                (section) =>
                    section.id &&
                    section.heading &&
                    section.text
            );

        const aliases =
            labelsFromMetadata(
                metadata.aliases
            );

        const topics =
            labelsFromMetadata(
                metadata.topics
            );

        const relatedTerms =
            labelsFromMetadata(
                metadata.relatedTerms
            );

        const relationshipLabels =
            labelsFromMetadata(
                metadata.relationships
            );

        const relatedWritingLabels =
            labelsFromMetadata(
                metadata.relatedWriting
            );

        items.push({
            id: metadata.id,
            url,
            title: metadata.title,
            entityType:
                metadata.entityType,
            summary: metadata.summary,
            primarySection:
                metadata.primarySection,
            collections:
                metadata.collections,

            writingTypes:
                labelsFromMetadata(
                    metadata.writingTypes
                ),

            aliases,
            topics,
            relatedTerms,

            relationships:
                Array.isArray(
                    metadata.relationships
                )
                    ? metadata.relationships
                    : [],

            relatedWriting:
                Array.isArray(
                    metadata.relatedWriting
                )
                    ? metadata.relatedWriting
                    : [],

            dateCreated:
                metadata.dateCreated || "",

            dateModified:
                metadata.dateModified || "",

            headings,
            sections,

            searchFields: {
                title: metadata.title,
                aliases,
                topics,
                headings,
                summary:
                    metadata.summary,
                entityType:
                    metadata.entityType,

                related: [
                    ...relatedTerms,
                    ...relationshipLabels,
                    ...relatedWritingLabels,

                    ...(
                        Array.isArray(
                            metadata.searchTerms
                        )
                            ? metadata.searchTerms
                            : []
                    )
                ],

                body
            }
        });
    }

    const index = {
        version: 1,
        generatedAt:
            new Date().toISOString(),
        collection: "info-sprawlings",
        fieldDefinitions:
            INFO_FIELDS,

        config: {
            minimumTypoLength:
                Number(
                    config.minimumTypoLength
                ) || 4,

            synonymGroups:
                Array.isArray(
                    config.synonymGroups
                )
                    ? config.synonymGroups
                    : []
        },

        items
    };

    await writeGeneratedIndex(
        "info-sprawlings-search-index.json",
        index
    );

    return index;
}

async function buildSiteSearchIndex(
    writingsIndex,
    infoIndex
) {
    const itemsByUrl = new Map();

    for (
        const piece of
        writingsIndex.pieces
    ) {
        const topics = unique([
            ...(piece.types || []),
            ...(piece.tags || [])
        ]);

        itemsByUrl.set(
            piece.url,
            {
                id:
                    `writings:${piece.id}`,
                url: piece.url,
                title: piece.title,
                section: "Writings",
                topics,
                summary: piece.summary,

                searchFields: {
                    title: piece.title,
                    section: "Writings",
                    topics,
                    summary:
                        piece.summary
                }
            }
        );
    }

    for (
        const item of
        infoIndex.items
    ) {
        const topics = unique([
            item.entityType,
            ...(item.topics || []),
            ...(item.aliases || [])
        ]);

        /*
         * set() intentionally replaces
         * Blender's Writings-catalog
         * representation with its canonical
         * Info Sprawlings representation.
         */
        itemsByUrl.set(
            item.url,
            {
                id:
                    `info-sprawlings:${item.id}`,
                url: item.url,
                title: item.title,
                section:
                    "Info Sprawlings",
                topics,
                summary: item.summary,

                searchFields: {
                    title: item.title,
                    section:
                        "Info Sprawlings",
                    topics,
                    summary:
                        item.summary
                }
            }
        );
    }

    const index = {
        version: 1,
        generatedAt:
            new Date().toISOString(),
        collection: "site",
        fieldDefinitions:
            SITE_FIELDS,

        config: {
            minimumTypoLength: 4,
            synonymGroups: []
        },

        items: Array.from(
            itemsByUrl.values()
        )
    };

    await writeGeneratedIndex(
        "site-search-index.json",
        index
    );

    return index;
}

await copyStaticSite();

const [
    writingsIndex,
    infoIndex
] = await Promise.all([
    buildWritingsIndex(),
    buildInfoSprawlingsIndex()
]);

const siteIndex =
    await buildSiteSearchIndex(
        writingsIndex,
        infoIndex
    );

const writingCount =
    writingsIndex.pieces.length;

const infoCount =
    infoIndex.items.length;

console.log(
    `Built ${OUTPUT_ROOT} with ` +
    `${writingCount} ` +
    `${
        writingCount === 1
            ? "writing"
            : "writings"
    }, ` +
    `${infoCount} Info ` +
    `${
        infoCount === 1
            ? "Sprawling"
            : "Sprawlings"
    }, and ` +
    `${siteIndex.items.length} ` +
    `unique site-search entries.`
);