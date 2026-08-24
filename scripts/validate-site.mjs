import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://www.aaronschlossberg.com";

const IGNORE_DIRS = new Set([
    ".git",
    "_site",
    "node_modules",
    "__MACOSX"
]);

const GENERATED_JSON = new Set([
    "assets/data/writings-search-index.json",
    "assets/data/info-sprawlings-search-index.json",
    "assets/data/site-search-index.json"
]);

const issues = [];

const counts = {
    html: 0,
    refs: 0,
    json: 0,
    css: 0,
    js: 0,
    sitemap: 0
};


/* Terminal UI */
const color =
    !process.argv.includes("--no-color") &&
    !process.env.NO_COLOR;

const C = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    green: "\x1b[32m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m"
};

function paint(text, name) {
    return color
        ? `${C[name]}${text}${C.reset}`
        : text;
}


/* General Helpers */
function rel(file) {
    return path
        .relative(ROOT, file)
        .split(path.sep)
        .join("/");
}


function issue(
    severity,
    title,
    file,
    line,
    found,
    why,
    fix,
    code = ""
) {
    issues.push({
        severity,
        title,
        file: file ? rel(file) : "",
        line,
        found,
        why,
        fix,
        code
    });
}


async function exists(file) {
    try {
        await access(file);
        return true;
    } catch {
        return false;
    }
}


async function walk(dir) {
    const out = [];

    for (
        const entry of await readdir(
            dir,
            { withFileTypes: true }
        )
    ) {
        if (
            entry.isDirectory() &&
            IGNORE_DIRS.has(entry.name)
        ) {
            continue;
        }

        const full =
            path.join(dir, entry.name);

        if (entry.isDirectory()) {
            out.push(
                ...await walk(full)
            );
        } else {
            out.push(full);
        }
    }

    return out;
}


function lineOf(
    element,
    attribute = null
) {
    const location =
        element?.sourceCodeLocation;

    if (
        attribute &&
        location?.attrs?.[attribute]
    ) {
        return (
            location
                .attrs[attribute]
                .startLine
        );
    }

    return (
        location?.startLine ||
        null
    );
}


/* URL/Path Helpers */
function pageUrl(file) {
    const filepath = rel(file);

    if (
        filepath.startsWith(
            "_partials/"
        )
    ) {
        return "/";
    }

    if (filepath === "index.html") {
        return "/";
    }

    if (
        filepath.endsWith(
            "/index.html"
        )
    ) {
        return (
            "/" +
            filepath.slice(
                0,
                -"/index.html".length
            ) +
            "/"
        );
    }

    return `/${filepath}`;
}


function localUrl(
    value,
    base = "/"
) {
    const trimmed =
        String(value || "")
            .trim();

    if (
        !trimmed ||
        trimmed === "#" ||
        trimmed.startsWith("#") ||
        /^(mailto|tel|sms|javascript|data|blob):/i
            .test(trimmed)
    ) {
        return null;
    }

    try {
        const url =
            new URL(
                trimmed,
                new URL(base, ORIGIN)
            );

        return (
            url.origin === ORIGIN
                ? url
                : null
        );
    } catch {
        return "INVALID";
    }
}


function redirectsFrom(text) {
    const map = new Map();

    for (
        const raw of
        text.split(/\r?\n/)
    ) {
        const line =
            raw.trim();

        if (
            !line ||
            line.startsWith("#")
        ) {
            continue;
        }

        const [
            from,
            to,
            status = "301"
        ] =
            line.split(/\s+/);

        if (
            from?.startsWith("/") &&
            !from.includes("*")
        ) {
            map.set(
                from,
                {
                    to,
                    status
                }
            );
        }
    }

    return map;
}

function candidates(pathname) {
    let pathnameDecoded;

    try {
        pathnameDecoded =
            decodeURIComponent(pathname);
    } catch {
        pathnameDecoded =
            pathname;
    }

    pathnameDecoded =
        pathnameDecoded.replace(
            /^\/+|\/+$/g,
            ""
        );

    if (!pathnameDecoded) {
        return [
            "index.html"
        ];
    }

    if (
        path.extname(
            pathnameDecoded
        )
    ) {
        return [
            pathnameDecoded
        ];
    }

    return [
        `${pathnameDecoded}/index.html`,
        `${pathnameDecoded}.html`
    ];
}

async function actualCaseInsensitive(
    candidate
) {
    const parts =
        candidate
            .split("/")
            .filter(Boolean);

    let directory = ROOT;
    const actual = [];

    for (const part of parts) {
        let entries;

        try {
            entries =
                await readdir(
                    directory,
                    {
                        withFileTypes: true
                    }
                );
        } catch {
            return null;
        }

        const exact =
            entries.find(
                entry =>
                    entry.name === part
            );

        if (exact) {
            actual.push(
                exact.name
            );

            directory =
                path.join(
                    directory,
                    exact.name
                );

            continue;
        }

        const matches =
            entries.filter(
                entry =>
                    entry.name
                        .toLowerCase() ===
                    part.toLowerCase()
            );

        if (
            matches.length !== 1
        ) {
            return null;
        }

        actual.push(
            matches[0].name
        );

        directory =
            path.join(
                directory,
                matches[0].name
            );
    }

    return actual.join("/");
}


/* Local Path Checker */
async function checkPath({
    pathname,
    file,
    line,
    attr,
    raw,
    redirects,
    sitemap = false
}) {
    let clean;

    try {
        clean =
            decodeURIComponent(
                pathname
            );
    } catch {
        clean = pathname;
    }


    /* Legacy Info Sprawlings URLs */
    if (
        clean ===
            "/info-sprawlings" ||
        clean.startsWith(
            "/info-sprawlings/"
        )
    ) {
        const fixed =
            clean ===
                "/info-sprawlings"
                ? "/projects/info-sprawlings/"
                : clean.replace(
                    /^\/info-sprawlings\/?/,
                    "/projects/info-sprawlings/"
                );

        issue(
            "error",

            "This still uses the old Info Sprawlings URL",

            file,
            line,

            `${attr}="${raw}"`,

            "Info Sprawlings now lives under /projects/. " +
            "Source code should not depend on the legacy redirect.",

            `Change it to "${fixed}".`,

            "LEGACY_INFO_PATH"
        );

        return;
    }


    /* Does the target exist exactly? */
    for (
        const candidate of
        candidates(clean)
    ) {
        if (
            await exists(
                path.join(
                    ROOT,
                    candidate
                )
            )
        ) {
            return;
        }
    }


    /* Could this just be capitalization? */
    for (
        const candidate of
        candidates(clean)
    ) {
        const actual =
            await actualCaseInsensitive(
                candidate
            );

        if (actual) {
            const display =
                "/" +
                actual.replace(
                    /\/index\.html$/,
                    "/"
                );

            issue(
                "error",

                "The filename capitalization does not match",

                file,
                line,

                `${attr}="${raw}"`,

                "This can work on a Mac but fail on Netlify/Linux because filenames are case-sensitive.",

                `Make the reference match the real path exactly: "${display}".`,

                "CASE_MISMATCH"
            );

            return;
        }
    }


    /* Does it rely on a redirect? */
    const redirect =
        redirects.get(clean) ||
        redirects.get(
            clean.endsWith("/")
                ? clean.slice(0, -1)
                : `${clean}/`
        );

    if (
        redirect &&
        !sitemap
    ) {
        issue(
            "warning",

            "This internal link works only because of a redirect",

            file,
            line,

            `${attr}="${raw}"`,

            `It redirects to "${redirect.to}". ` +
            "Current source code should link directly to the final URL.",

            `Change the link to "${redirect.to}".`,

            "LINK_USES_REDIRECT"
        );

        return;
    }


    /* Missing target */
    const asset =
        Boolean(
            path.extname(clean)
        );

    issue(
        "error",

        sitemap
            ? "A sitemap URL does not exist in the source site"
            : asset
                ? "A local file does not exist"
                : "An internal link points to a page that does not exist",

        file,
        line,

        sitemap
            ? raw
            : `${attr}="${raw}"`,

        sitemap
            ? "Search engines should only be given URLs that actually exist."
            : asset
                ? "The browser will request this file and get a 404."
                : "Visitors who follow this link will reach a missing page.",

        sitemap
            ? "Remove this <url> entry until the page exists, or create the page at this exact path."
            : asset
                ? "Correct the path/filename or add the missing file."
                : "Correct the href or create the missing page.",

        sitemap
            ? "SITEMAP_MISSING"
            : "MISSING_LOCAL_TARGET"
    );
}

async function checkRef(
    value,
    file,
    line,
    attr,
    base,
    redirects
) {
    const url =
        localUrl(
            value,
            base
        );

    if (url === null) {
        return;
    }

    if (
        url === "INVALID"
    ) {
        issue(
            "error",

            "This URL is malformed",

            file,
            line,

            `${attr}="${value}"`,

            "The browser cannot reliably interpret this URL.",

            "Correct the URL syntax.",

            "INVALID_URL"
        );

        return;
    }

    counts.refs++;

    await checkPath({
        pathname: url.pathname,
        file,
        line,
        attr,
        raw: value,
        redirects
    });
}


/* HTML */
async function validateHtml(
    file,
    redirects
) {
    counts.html++;

    const html =
        await readFile(
            file,
            "utf8"
        );

    const $ =
        load(
            html,
            {
                sourceCodeLocationInfo: true
            }
        );

    const base =
        pageUrl(file);


    /* No <style> blocks */
    $("style").each(
        (_, element) => {
            issue(
                "error",

                "A <style> block is inside an HTML file",

                file,
                lineOf(element),

                "<style> ... </style>",

                "This project keeps page styling in external CSS files.",

                "Move those rules into the appropriate /assets/css/ file, then delete the <style> block.",

                "STYLE_BLOCK"
            );
        }
    );


    /* Duplicate IDs */
    const ids =
        new Map();

    $("[id]").each(
        (_, element) => {
            const id =
                $(element)
                    .attr("id");

            if (!id) {
                return;
            }

            if (
                ids.has(id)
            ) {
                issue(
                    "error",

                    `The id "${id}" appears more than once on this page`,

                    file,

                    lineOf(
                        element,
                        "id"
                    ),

                    `id="${id}"`,

                    "HTML IDs must be unique; duplicates can break links, CSS, JavaScript, and accessibility.",

                    `If both elements need the same styling, give them a shared class instead. ` +
                    `The first "${id}" is around line ${ids.get(id)}.`,

                    "DUPLICATE_ID"
                );
            } else {
                ids.set(
                    id,
                    lineOf(
                        element,
                        "id"
                    )
                );
            }
        }
    );


    /* href, src, action */
    const attrs = [
        ["a[href]", "href"],
        ["link[href]", "href"],
        ["script[src]", "src"],
        ["img[src]", "src"],
        ["source[src]", "src"],
        ["video[src]", "src"],
        ["audio[src]", "src"],
        ["iframe[src]", "src"],
        ["form[action]", "action"]
    ];

    for (
        const [
            selector,
            attr
        ] of attrs
    ) {
        for (
            const element of
            $(selector).toArray()
        ) {
            await checkRef(
                $(element).attr(attr),
                file,
                lineOf(
                    element,
                    attr
                ),
                attr,
                base,
                redirects
            );
        }
    }


    /* srcset */
    for (
        const selector of
        [
            "img[srcset]",
            "source[srcset]"
        ]
    ) {
        for (
            const element of
            $(selector).toArray()
        ) {
            const srcset =
                $(element)
                    .attr("srcset") ||
                "";

            for (
                const entry of
                srcset.split(",")
            ) {
                const value =
                    entry
                        .trim()
                        .split(/\s+/)[0];

                if (!value) {
                    continue;
                }

                await checkRef(
                    value,
                    file,
                    lineOf(
                        element,
                        "srcset"
                    ),
                    "srcset",
                    base,
                    redirects
                );
            }
        }
    }
}


/* JSON */
function jsonLine(
    text,
    error
) {
    const match =
        String(
            error?.message || ""
        ).match(
            /position\s+(\d+)/i
        );

    if (!match) {
        return null;
    }

    return (
        text
            .slice(
                0,
                Number(match[1])
            )
            .split(/\r?\n/)
            .length
    );
}

async function validateJson(
    file,
    redirects
) {
    if (
        GENERATED_JSON.has(
            rel(file)
        )
    ) {
        return;
    }

    counts.json++;

    const text =
        await readFile(
            file,
            "utf8"
        );

    let data;

    try {
        data =
            JSON.parse(text);
    } catch (error) {
        issue(
            "error",

            "This JSON file is invalid",

            file,

            jsonLine(
                text,
                error
            ),

            error.message,

            "JavaScript cannot reliably read it until the JSON syntax is fixed.",

            "Check commas, quotes, braces, and brackets near the reported line.",

            "INVALID_JSON"
        );

        return;
    }


    /* Very Info Sprawlings JSON file canonical local page URLs*/
    if (
        rel(file)
            .startsWith(
                "data/info-sprawlings/"
            ) &&
        typeof data?.url ===
            "string"
    ) {
        const url =
            localUrl(
                data.url,
                "/"
            );

        if (
            url &&
            url !== "INVALID"
        ) {
            await checkPath({
                pathname:
                    url.pathname,

                file,
                line: null,

                attr: "url",
                raw: data.url,

                redirects
            });
        }
    }
}


/* CSS */
async function validateCss(
    file,
    redirects
) {
    counts.css++;

    const text =
        await readFile(
            file,
            "utf8"
        );

    const base =
        `/${
            path.posix.dirname(
                rel(file)
            )
        }/`;

    const regex =
        /url\(\s*(?:(["'])(.*?)\1|([^)"']+))\s*\)/g;

    for (
        let match;
        (
            match =
                regex.exec(text)
        );
    ) {
        const value =
            (
                match[2] ??
                match[3] ??
                ""
            ).trim();

        const line =
            text
                .slice(
                    0,
                    match.index
                )
                .split(/\r?\n/)
                .length;

        await checkRef(
            value,
            file,
            line,
            "url()",
            base,
            redirects
        );
    }
}


/* Browser JavaScript */
async function validateBrowserJs(
    file,
    redirects
) {
    counts.js++;

    const text =
        await readFile(
            file,
            "utf8"
        );

    /* Checks literal local paths loaded by: fetch("/..."), loadText("/..."), loadJSON("/...") */
    const regex =
        /\b(?:fetch|loadText|loadJSON)\(\s*(["'])(.*?)\1/g;

    for (
        let match;
        (
            match =
                regex.exec(text)
        );
    ) {
        const value =
            match[2].trim();

        if (
            !value.startsWith("/") &&
            !value.startsWith(ORIGIN)
        ) {
            continue;
        }

        const line =
            text
                .slice(
                    0,
                    match.index
                )
                .split(/\r?\n/)
                .length;

        await checkRef(
            value,
            file,
            line,
            "loaded path",
            "/",
            redirects
        );
    }
}


/* Sitemaps */
async function validatePageSitemap(
    file,
    redirects
) {
    const xml =
        await readFile(
            file,
            "utf8"
        );

    const $ =
        load(
            xml,
            {
                xmlMode: true,
                sourceCodeLocationInfo: true
            }
        );

    for (
        const element of
        $("url > loc").toArray()
    ) {
        const value =
            $(element)
                .text()
                .trim();

        if (!value) {
            continue;
        }

        counts.sitemap++;

        const url =
            localUrl(
                value,
                "/"
            );

        if (
            !url ||
            url === "INVALID"
        ) {
            issue(
                "error",

                "A sitemap URL is invalid",

                file,
                lineOf(element),

                value,

                `Page sitemap URLs should use ${ORIGIN}.`,

                "Replace this <loc> with the correct canonical URL.",

                "BAD_SITEMAP_URL"
            );

            continue;
        }

        await checkPath({
            pathname:
                url.pathname,

            file,

            line:
                lineOf(element),

            attr: "loc",
            raw: value,

            redirects,

            sitemap: true
        });
    }
}

async function validateSitemapIndex(
    file
) {
    const xml =
        await readFile(
            file,
            "utf8"
        );

    const $ =
        load(
            xml,
            {
                xmlMode: true,
                sourceCodeLocationInfo: true
            }
        );

    for (
        const element of
        $("sitemap > loc")
            .toArray()
    ) {
        const value =
            $(element)
                .text()
                .trim();

        const url =
            localUrl(
                value,
                "/"
            );

        if (
            !url ||
            url === "INVALID"
        ) {
            issue(
                "error",

                "The sitemap index contains an invalid URL",

                file,
                lineOf(element),

                value,

                "The sitemap index should point to sitemap files on the canonical site.",

                "Replace this <loc> with the correct sitemap URL.",

                "BAD_SITEMAP_INDEX"
            );

            continue;
        }

        const target =
            path.join(
                ROOT,

                url.pathname
                    .replace(
                        /^\/+/,
                        ""
                    )
            );

        if (
            !await exists(target)
        ) {
            issue(
                "error",

                "The sitemap index points to a missing sitemap file",

                file,
                lineOf(element),

                value,

                "Search engines will not be able to load this child sitemap.",

                "Correct the path or restore the missing sitemap file.",

                "MISSING_SITEMAP_FILE"
            );
        }
    }
}


/* Output */
function printIssue(
    item,
    number,
    total
) {
    const error =
        item.severity === "error";

    const shade =
        error
            ? "red"
            : "yellow";

    const label =
        error
            ? "ERROR"
            : "WARNING";

    console.log("");

    console.log(
        `${
            paint(
                `${label} ${number}/${total}`,
                shade
            )
        } — ${
            paint(
                item.title,
                "bold"
            )
        }`
    );

    if (item.file) {
        console.log(
            `  ${
                paint(
                    "Where:",
                    "gray"
                )
            } ${
                item.file
            }${
                item.line
                    ? `:${item.line}`
                    : ""
            }`
        );
    }

    if (item.found) {
        console.log(
            `  ${
                paint(
                    "Found:",
                    "gray"
                )
            } ${
                item.found
            }`
        );
    }

    if (item.why) {
        console.log(
            `  ${
                paint(
                    "Why:",
                    "gray"
                )
            } ${
                item.why
            }`
        );
    }

    if (item.fix) {
        console.log(
            `  ${
                paint(
                    "Fix:",
                    "green"
                )
            } ${
                item.fix
            }`
        );
    }
}


/* Run Everything */
async function main() {
    console.log("");

    console.log(
        paint(
            "╭──────────────────────────────────────────────────────────────╮",
            "cyan"
        )
    );

    console.log(
        `${
            paint(
                "│",
                "cyan"
            )
        }${
            paint(
                "  🔎 Aaron's Universe — Site Health Check                    ",
                "bold"
            )
        }${
            paint(
                "│",
                "cyan"
            )
        }`
    );

    console.log(
        paint(
            "╰──────────────────────────────────────────────────────────────╯",
            "cyan"
        )
    );

    console.log("");


    const redirectText =
        await readFile(
            path.join(
                ROOT,
                "_redirects"
            ),
            "utf8"
        ).catch(
            () => ""
        );

    const redirects =
        redirectsFrom(
            redirectText
        );

    const files =
        await walk(ROOT);


    const html =
        files.filter(
            file =>
                path
                    .extname(file)
                    .toLowerCase() ===
                ".html"
        );


    const json =
        files.filter(
            file =>
                path
                    .extname(file)
                    .toLowerCase() ===
                ".json"
        );


    const css =
        files.filter(
            file =>
                rel(file)
                    .startsWith(
                        "assets/css/"
                    ) &&
                path
                    .extname(file)
                    .toLowerCase() ===
                ".css"
        );


    const js =
        files.filter(
            file =>
                rel(file)
                    .startsWith(
                        "assets/js/"
                    ) &&
                path
                    .extname(file)
                    .toLowerCase() ===
                ".js"
        );


    for (const file of html) {
        await validateHtml(
            file,
            redirects
        );
    }


    for (const file of json) {
        await validateJson(
            file,
            redirects
        );
    }


    for (const file of css) {
        await validateCss(
            file,
            redirects
        );
    }


    for (const file of js) {
        await validateBrowserJs(
            file,
            redirects
        );
    }


    const pageSitemap =
        path.join(
            ROOT,
            "sitemaps",
            "sitemap-pages.xml"
        );


    const sitemapIndex =
        path.join(
            ROOT,
            "sitemap.xml"
        );


    if (
        await exists(
            pageSitemap
        )
    ) {
        await validatePageSitemap(
            pageSitemap,
            redirects
        );
    }


    if (
        await exists(
            sitemapIndex
        )
    ) {
        await validateSitemapIndex(
            sitemapIndex
        );
    }


    /* Summary */
    console.log(
        paint(
            "Checked",
            "bold"
        )
    );


    const metrics = [
        [
            "HTML files",
            counts.html
        ],
        [
            "Local links/assets",
            counts.refs
        ],
        [
            "JSON files",
            counts.json
        ],
        [
            "CSS files",
            counts.css
        ],
        [
            "Browser JavaScript files",
            counts.js
        ],
        [
            "Sitemap page URLs",
            counts.sitemap
        ]
    ];


    for (
        const [
            label,
            value
        ] of metrics
    ) {
        console.log(
            `  ${
                paint(
                    "✓",
                    "green"
                )
            } ${
                label.padEnd(27)
            } ${
                paint(
                    String(value),
                    "bold"
                )
            }`
        );
    }


    const errors =
        issues.filter(
            item =>
                item.severity ===
                "error"
        );


    const warnings =
        issues.filter(
            item =>
                item.severity ===
                "warning"
        );


    /* Perfectly clean */
    if (!issues.length) {
        console.log("");

        console.log(
            paint(
                "✓ Everything checked here looks clean.",
                "green"
            )
        );

        console.log(
            paint(
                "  No broken local references, invalid JSON, duplicate IDs, <style> blocks,",
                "dim"
            )
        );

        console.log(
            paint(
                "  legacy Info Sprawlings paths, filename-case problems, or bad sitemap URLs were found.",
                "dim"
            )
        );

        console.log("");

        return;
    }


    /* Issues */
    console.log("");

    console.log(
        `${
            paint(
                String(errors.length),
                errors.length
                    ? "red"
                    : "green"
            )
        } error(s), ${
            paint(
                String(warnings.length),
                warnings.length
                    ? "yellow"
                    : "green"
            )
        } warning(s)`
    );


    errors.forEach(
        (item, index) =>
            printIssue(
                item,
                index + 1,
                errors.length
            )
    );


    warnings.forEach(
        (item, index) =>
            printIssue(
                item,
                index + 1,
                warnings.length
            )
    );


    console.log("");


    /* Errors stop deployment; warnings do not. */
    if (errors.length) {
        console.log(
            paint(
                "Build stopped: fix the errors above, then run npm run validate again.",
                "red"
            )
        );

        console.log("");

        process.exitCode = 1;
    } else {
        console.log(
            paint(
                "✓ No build-blocking errors. Warnings are cleanup recommendations.",
                "green"
            )
        );

        console.log("");
    }
}

await main();