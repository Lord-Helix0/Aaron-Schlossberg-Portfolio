(() => {
    "use strict";

    function initReadingProgress() {
        const progress = document.querySelector("[data-reading-progress]");
        const readingBody = document.querySelector("[data-reading-body]");

        if (!progress || !readingBody) return;

        let frameRequested = false;

        function updateProgress() {
            const bodyRect = readingBody.getBoundingClientRect();
            const bodyTop = window.scrollY + bodyRect.top;
            const bodyBottom = bodyTop + readingBody.offsetHeight;
            const start = bodyTop;
            const end = Math.max(
                start + 1,
                bodyBottom - window.innerHeight * 0.35
            );
            const readingPosition =
                window.scrollY + Math.min(window.innerHeight * 0.2, 150);
            const rawProgress = (readingPosition - start) / (end - start);
            const normalizedProgress = Math.min(1, Math.max(0, rawProgress));
            const percentage = Math.round(normalizedProgress * 100);

            progress.value = percentage;
            progress.setAttribute("aria-valuetext", `${percentage}% read`);
            frameRequested = false;
        }

        function requestProgressUpdate() {
            if (frameRequested) return;

            frameRequested = true;
            window.requestAnimationFrame(updateProgress);
        }

        window.addEventListener("scroll", requestProgressUpdate, {
            passive: true
        });
        window.addEventListener("resize", requestProgressUpdate);
        requestProgressUpdate();
    }

    function initShareHub() {
        const dialog = document.querySelector(
            "[data-share-dialog], #writing-share-dialog, .writing-share-dialog"
        );

        const triggers = Array.from(
            document.querySelectorAll(
                "[data-share-trigger], [data-share-open], .writing-share-trigger"
            )
        );

        if (!dialog || triggers.length === 0) return;

        const closeControls = Array.from(
            dialog.querySelectorAll("[data-share-close]")
        );

        const nativeShareControls = Array.from(
            dialog.querySelectorAll(
                '[data-share-native], [data-share="native"]'
            )
        );

        const copyControls = Array.from(
            dialog.querySelectorAll(
                '[data-share-copy], [data-share="copy"]'
            )
        );

        const status = dialog.querySelector(
            "[data-share-status], .writing-share-status"
        );

        const panel = dialog.querySelector(
            "[data-share-panel], .writing-share-panel, .writing-share-dialog__panel"
        );

        const canonicalLink = document.querySelector(
            'link[rel="canonical"]'
        );

        const titleMeta = document.querySelector(
            'meta[property="og:title"]'
        );

        const descriptionMeta = document.querySelector(
            'meta[property="og:description"]'
        );

        const shareUrl =
            canonicalLink?.href || window.location.href.split("#")[0];

        const shareTitle =
            titleMeta?.content ||
            document.querySelector("h1")?.textContent?.trim() ||
            document.title;

        const shareText = descriptionMeta?.content || "";

        const isNativeDialog =
            typeof HTMLDialogElement !== "undefined" &&
            dialog instanceof HTMLDialogElement;

        const canUseNativeShare =
            typeof navigator.share === "function" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(any-pointer: coarse)").matches;

        let previouslyFocused = null;
        let statusTimer = null;

        function setStatus(message) {
            if (!status) return;

            window.clearTimeout(statusTimer);
            status.textContent = message;

            if (message) {
                statusTimer = window.setTimeout(() => {
                    status.textContent = "";
                }, 3500);
            }
        }

        function getFocusableElements() {
            return Array.from(
                dialog.querySelectorAll(
                    'a[href], button:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"])'
                )
            ).filter((element) => !element.hasAttribute("hidden"));
        }

        function finishClosing() {
            document.body.classList.remove("writing-share-open");
            dialog.removeAttribute("data-open");

            if (!isNativeDialog) {
                dialog.hidden = true;
                dialog.setAttribute("aria-hidden", "true");
            }

            if (previouslyFocused instanceof HTMLElement) {
                previouslyFocused.focus();
            }
        }

        function openDialog() {
            previouslyFocused = document.activeElement;

            setStatus("");
            document.body.classList.add("writing-share-open");
            dialog.setAttribute("data-open", "true");

            if (isNativeDialog) {
                if (!dialog.open) {
                    dialog.showModal();
                }
            } else {
                dialog.hidden = false;
                dialog.setAttribute("aria-hidden", "false");
            }

            window.requestAnimationFrame(() => {
                getFocusableElements()[0]?.focus();
            });
        }

        function closeDialog() {
            if (isNativeDialog && dialog.open) {
                dialog.close();
                return;
            }

            finishClosing();
        }

        function setShareLink(name, href) {
            dialog
                .querySelectorAll(
                    `[data-share-${name}], ` +
                    `[data-share-network="${name}"], ` +
                    `[data-share="${name}"]`
                )
                .forEach((control) => {
                    if (control instanceof HTMLAnchorElement) {
                        control.href = href;
                    }
                });
        }

        const encodedUrl = encodeURIComponent(shareUrl);
        const encodedTitle = encodeURIComponent(shareTitle);

        const encodedText = encodeURIComponent(
            shareText
                ? `${shareTitle} — ${shareText}`
                : shareTitle
        );

        setShareLink(
            "email",
            `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(
                `${shareText ? `${shareText}\n\n` : ""}${shareUrl}`
            )}`
        );

        setShareLink(
            "facebook",
            `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
        );

        setShareLink(
            "linkedin",
            `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
        );

        setShareLink(
            "x",
            `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`
        );

        setShareLink(
            "twitter",
            `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`
        );

        setShareLink(
            "bluesky",
            `https://bsky.app/intent/compose?text=${encodedText}%0A%0A${encodedUrl}`
        );

        nativeShareControls.forEach((control) => {
            control.hidden = !canUseNativeShare;

            control.addEventListener("click", async () => {
                if (!canUseNativeShare) return;

                try {
                    await navigator.share({
                        title: shareTitle,
                        text: shareText,
                        url: shareUrl
                    });

                    closeDialog();
                } catch (error) {
                    if (error?.name !== "AbortError") {
                        setStatus(
                            "Sharing was not available. Try Copy Link instead."
                        );
                    }
                }
            });
        });

        async function copyShareUrl() {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareUrl);
                return;
            }

            const temporaryField =
                document.createElement("textarea");

            temporaryField.value = shareUrl;
            temporaryField.setAttribute("readonly", "");
            temporaryField.style.position = "fixed";
            temporaryField.style.opacity = "0";

            document.body.appendChild(temporaryField);
            temporaryField.select();

            const copied = document.execCommand("copy");

            temporaryField.remove();

            if (!copied) {
                throw new Error("Copy command failed");
            }
        }

        copyControls.forEach((control) => {
            control.addEventListener("click", async () => {
                try {
                    await copyShareUrl();

                    setStatus(
                        "Link copied to your clipboard."
                    );
                } catch {
                    setStatus(
                        "Could not copy automatically. Copy the URL from your browser."
                    );
                }
            });
        });

        triggers.forEach((trigger) => {
            trigger.addEventListener("click", openDialog);
        });

        closeControls.forEach((control) => {
            control.addEventListener("click", closeDialog);
        });

        if (isNativeDialog) {
            dialog.addEventListener("close", finishClosing);

            dialog.addEventListener("cancel", (event) => {
                event.preventDefault();
                closeDialog();
            });
        }

        dialog.addEventListener("click", (event) => {
            if (event.target === dialog) {
                closeDialog();
            }

            if (
                event.target instanceof Element &&
                event.target.closest("[data-share-backdrop]")
            ) {
                closeDialog();
            }
        });

        dialog.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !isNativeDialog) {
                event.preventDefault();
                closeDialog();
                return;
            }

            if (event.key !== "Tab") return;

            const focusableElements = getFocusableElements();

            if (focusableElements.length === 0) return;

            const firstElement = focusableElements[0];

            const lastElement =
                focusableElements[
                    focusableElements.length - 1
                ];

            if (
                event.shiftKey &&
                document.activeElement === firstElement
            ) {
                event.preventDefault();
                lastElement.focus();
            } else if (
                !event.shiftKey &&
                document.activeElement === lastElement
            ) {
                event.preventDefault();
                firstElement.focus();
            }
        });

        if (panel) {
            panel.addEventListener("click", (event) => {
                event.stopPropagation();
            });
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        initReadingProgress();
        initShareHub();
    });
})();