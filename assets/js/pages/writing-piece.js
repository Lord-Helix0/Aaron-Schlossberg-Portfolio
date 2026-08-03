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
            const end = Math.max(start + 1, bodyBottom - window.innerHeight * 0.35);
            const readingPosition = window.scrollY + Math.min(window.innerHeight * 0.2, 150);
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

        window.addEventListener("scroll", requestProgressUpdate, { passive: true });
        window.addEventListener("resize", requestProgressUpdate);
        requestProgressUpdate();
    }

    document.addEventListener("DOMContentLoaded", initReadingProgress);
})();