const toast = document.querySelector(".copy-toast");
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function announce(message: string): void {
  if (!(toast instanceof HTMLElement)) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3500);
}

async function copyText(value: string): Promise<void> {
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
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  }
}

for (const button of document.querySelectorAll("[data-copy]")) {
  if (!(button instanceof HTMLButtonElement)) continue;
  button.addEventListener("click", async () => {
    const value = button.dataset.copy;
    if (button.disabled || value === undefined) return;
    const previousFocus = document.activeElement;
    button.disabled = true;
    const label = button.querySelector("span");
    try {
      await copyText(value);
      announce("Command copied. Paste it into your repository terminal.");
      if (label instanceof HTMLElement) label.textContent = "Copied";
    } catch {
      announce("Could not copy. Select the command text and copy it manually.");
      if (label instanceof HTMLElement) label.textContent = "Select text";
    } finally {
      button.disabled = false;
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
      setTimeout(() => {
        if (label instanceof HTMLElement) label.textContent = "Copy";
      }, 2500);
    }
  });
}
