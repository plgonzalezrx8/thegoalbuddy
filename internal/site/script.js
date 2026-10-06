const toast = document.querySelector(".copy-toast");
let toastTimer;

function announce(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3500);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const previousFocus = document.activeElement;
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
  } finally {
    field.remove();
    previousFocus?.focus({ preventScroll: true });
  }
}

for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    const label = button.querySelector("span");
    try {
      await copyText(button.dataset.copy);
      announce("Command copied. Paste it into your repository terminal.");
      label.textContent = "Copied";
    } catch {
      announce("Could not copy. Select the command text and copy it manually.");
      label.textContent = "Select text";
    } finally {
      button.disabled = false;
      setTimeout(() => {
        label.textContent = "Copy";
      }, 2500);
    }
  });
}
