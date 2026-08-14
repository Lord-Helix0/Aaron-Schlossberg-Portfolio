import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const OUTPUT_ROOT = path.join(SITE_ROOT, "_site");
const WRITINGS_INDEX_FILE = path.join(SITE_ROOT, "writings", "index.html");
const SEARCH_CONFIG_FILE = path.join(
    SITE_ROOT,
    "data",
    "writings-search-config.json"
);
const SEARCH_INDEX_FILE = path.join(
    OUTPUT_ROOT,
    "assets",
    "data",
    "writings-search-index.json"
);
const LOCAL_SEARCH_INDEX_FILE = path.join(
    SITE_ROOT,
    "assets",
    "data",
    "writings-search-index.json"
);

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
    return Array.from(new Set(values.filter(Boolean)));
}

function textWithBreakSpacing(element) {
    const clone = element.clone();
    clone.find("br").replaceWith(" ");
    return compactText(clone.text());
}

function pathnameFromHref(href) {
    return new URL(
        href,
        "https://www.aaronschlossberg.com"
    ).pathname;
}

function idFromPathname(pathname) {
    return decodeURIComponent(pathname)
        .replace(/^\/+|\/+$/g, "")
        .replace(/^writings\//, "")
        .replace(/\//g, "--");
}

function localHtmlFileFromHref(href) {
    const pathname = pathnameFromHref(href);
    const relativePath = decodeURIComponent(pathname)
        .replace(/^\/+/, "");

    if (
        !relativePath.startsWith("writings/") ||
        relativePath.includes("..")
    ) {
        throw new Error(
            `Unsafe or unexpected writing URL: ${href}`
        );
    }

    if (relativePath.endsWith(".html")) {
        return path.join(SITE_ROOT, relativePath);
    }

    return path.join(SITE_ROOT, relativePath, "index.html");
}

function extractDefinitionList($, root, selector) {
    const metadata = {};

    root.find(`${selector} > div`).each((_, element) => {
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

function firstMetadataValue(metadataSources, labels) {
    for (const metadata of metadataSources) {
        for (const label of labels) {
            if (metadata[label]) {
                return metadata[label];
            }
        }
    }

    return "";
}

async function copyStaticSite() {
    if (
        path.dirname(OUTPUT_ROOT) !== SITE_ROOT ||
        path.basename(OUTPUT_ROOT) !== "_site"
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

    const entries = await readdir(SITE_ROOT, {
        withFileTypes: true
    });

    for (const entry of entries) {
        if (
            EXCLUDED_ROOT_ENTRIES.has(entry.name) ||
            entry.name === ".DS_Store"
        ) {
            continue;
        }

        await cp(
            path.join(SITE_ROOT, entry.name),
            path.join(OUTPUT_ROOT, entry.name),
            {
                recursive: true,
                filter(source) {
                    return path.basename(source) !== ".DS_Store";
                }
            }
        );
    }
}

async function buildSearchIndex() {
    const [catalogHtml, configText] = await Promise.all([
        readFile(WRITINGS_INDEX_FILE, "utf8"),
        readFile(SEARCH_CONFIG_FILE, "utf8")
    ]);

    const config = JSON.parse(configText);
    const $catalog = load(catalogHtml);
    const cardElements = $catalog(
        "[data-writing-card]"
    ).toArray();

    if (cardElements.length === 0) {
        throw new Error(
            "No live [data-writing-card] elements were found."
        );
    }

    const pieces = [];
    const seenIds = new Set();
    const seenUrls = new Set();

    for (const cardElement of cardElements) {
        const card = $catalog(cardElement);
        const action = card
            .find(".writings-piece-action[href]")
            .first();

        const href = action.attr("href");

        if (!href) {
            throw new Error(
                "Every live writing card needs a piece link."
            );
        }

        const url = pathnameFromHref(href);
        const id = idFromPathname(url);

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

        const pieceFile = localHtmlFileFromHref(href);

        const pieceHtml = await readFile(
            pieceFile,
            "utf8"
        ).catch((error) => {
            throw new Error(
                `The card for ${url} points to a missing page: ` +
                `${pieceFile}`,
                { cause: error }
            );
        });

        const $piece = load(pieceHtml);
        const explicitBodies = $piece(
            "[data-search-body]"
        );

        const searchableBodies = explicitBodies.length
            ? explicitBodies
            : $piece("[data-reading-body]");

        if (searchableBodies.length === 0) {
            throw new Error(
                `${url} needs a [data-search-body] element ` +
                `around its full text.`
            );
        }

        const body = compactText(
            searchableBodies
                .toArray()
                .map((element) => $piece(element).text())
                .join(" ")
        );

        if (!body) {
            throw new Error(
                `${url} has an empty searchable body.`
            );
        }

        const cardMetadata = extractDefinitionList(
            $catalog,
            card,
            ".writings-piece-meta"
        );

        const pageMetadata = extractDefinitionList(
            $piece,
            $piece.root(),
            ".writing-piece-meta"
        );

        const metadataSources = [
            cardMetadata,
            pageMetadata
        ];

        const cardSummary = textWithBreakSpacing(
            card.find(".writings-piece-summary").first()
        );

        const pageDeck = compactText(
            $piece(".writing-piece-deck").first().text()
        );

        const pageContext = compactText(
            $piece(".writing-piece-context p")
                .toArray()
                .map((element) => $piece(element).text())
                .join(" ")
        );

        const pageKicker = compactText(
            $piece(".writing-piece-kicker").first().text()
        );

        const pageGenre = firstMetadataValue(
            metadataSources,
            ["Genre", "Form"]
        );

        const context = firstMetadataValue(
            metadataSources,
            ["Context"]
        );

        const project = firstMetadataValue(
            metadataSources,
            ["Project"]
        );

        const status = firstMetadataValue(
            metadataSources,
            ["Status"]
        );

        const year = firstMetadataValue(
            metadataSources,
            ["Year", "Published"]
        );

        const title = compactText(
            card.find("h3").first().text()
        );

        const types = unique(
            compactText(card.attr("data-writing-types"))
                .toLowerCase()
                .split(" ")
        );

        const tags = unique([
            ...card
                .find(".writings-piece-tags span")
                .toArray()
                .map((element) =>
                    compactText($catalog(element).text())
                ),
            pageKicker,
            pageGenre
        ]);

        if (!title) {
            throw new Error(
                `The writing card for ${url} has no h3 title.`
            );
        }

        pieces.push({
            id,
            url,
            title,
            types,
            tags,
            summary: unique([
                cardSummary,
                pageDeck,
                pageContext
            ]).join(" "),
            context,
            project,
            status,
            year,
            metadata: {
                ...pageMetadata,
                ...cardMetadata
            },
            keywords: compactText(
                card.attr("data-search-terms")
            ),
            body
        });
    }

    const searchIndex = {
        version: 1,
        generatedAt: new Date().toISOString(),
        config: {
            minimumTypoLength:
                Number(config.minimumTypoLength) || 4,
            synonymGroups:
                Array.isArray(config.synonymGroups)
                    ? config.synonymGroups
                    : []
        },
        pieces
    };

    const serializedIndex =
        `${JSON.stringify(searchIndex, null, 2)}\n`;

    await Promise.all([
        mkdir(path.dirname(SEARCH_INDEX_FILE), {
            recursive: true
        }),
        mkdir(path.dirname(LOCAL_SEARCH_INDEX_FILE), {
            recursive: true
        })
    ]);

    await Promise.all([
        writeFile(
            SEARCH_INDEX_FILE,
            serializedIndex,
            "utf8"
        ),
        writeFile(
            LOCAL_SEARCH_INDEX_FILE,
            serializedIndex,
            "utf8"
        )
    ]);

    return pieces.length;
}

await copyStaticSite();

const pieceCount = await buildSearchIndex();

console.log(
    `Built ${OUTPUT_ROOT} with a full-text search index for ` +
    `${pieceCount} ` +
    `${pieceCount === 1 ? "piece" : "pieces"}.`
);