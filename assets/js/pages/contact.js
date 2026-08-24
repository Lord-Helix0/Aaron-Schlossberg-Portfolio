(function () {
    "use strict";

    const copyButton = document.querySelector("[data-copy-phone]");
    const phoneNumber = document.querySelector("[data-phone-number]");
    const copyStatus = document.getElementById("phone-copy-status");

    if (!copyButton || !phoneNumber || !copyStatus) {
        return;
    }

    const originalButtonText = copyButton.textContent.trim();
    let resetTimer;

    copyButton.addEventListener("click", async () => {
        const number = phoneNumber.textContent.trim();

        if (!number) {
            copyStatus.textContent = "The phone number could not be found.";
            return;
        }

        try {
            await navigator.clipboard.writeText(number);

            copyButton.textContent = "Copied!";
            copyStatus.textContent = `Phone number copied: ${number}`;

            window.clearTimeout(resetTimer);

            resetTimer = window.setTimeout(() => {
                copyButton.textContent = originalButtonText;
                copyStatus.textContent = "";
            }, 3500);
        } catch (error) {
            console.error("Could not copy phone number:", error);

            copyStatus.textContent =
                `Copying failed. Please select the displayed number: ${number}`;
        }
    });
})();