document.querySelectorAll('a[href^="http"]').forEach((link) => {
  link.addEventListener("click", () => {
    link.setAttribute("aria-label", `${link.textContent.trim()} (se abre en una pestaña nueva)`);
  });
});
