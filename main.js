function copyToClipboard(text, type) {
  navigator.clipboard.writeText(text).then(() => {
      alert(type + " has been copied to clipboard! \n\n" + type + ": " + text);
  }).catch(err => {
      console.error("Failed to copy: ", err);
  });
}